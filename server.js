// Bulletproof inline .env loader (runs synchronously before any module loads)
(function loadEnvEarly() {
    try {
        const fs = require('fs');
        const path = require('path');
        const crypto = require('crypto');

        // Ensure core runtime folders exist on fresh PCs
        for (const d of ['logs', 'backups', 'database/data', 'public/uploads/documents']) {
            const p = path.join(__dirname, d);
            if (!fs.existsSync(p)) {
                try { fs.mkdirSync(p, { recursive: true }); } catch (_) { }
            }
        }

        const envPath = path.join(__dirname, '.env');
        const examplePath = path.join(__dirname, '.env.example');
        if (!fs.existsSync(envPath)) {
            if (fs.existsSync(examplePath)) {
                fs.copyFileSync(examplePath, envPath);
            } else {
                fs.writeFileSync(
                    envPath,
                    'PORT=4000\r\nHOST=0.0.0.0\r\nDB_TYPE=sqlite\r\nDB_FILE=database/data/cash_management.db\r\nJWT_SECRET=\r\nALLOW_LOCAL_AUTO_LOGIN=true\r\nAUTO_UPDATE_DISABLED=false\r\n',
                    'utf8'
                );
            }
        }

        let content = fs.readFileSync(envPath, 'utf8');
        if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
        content.split(/\r?\n/).forEach((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;
            const eq = trimmed.indexOf('=');
            if (eq === -1) return;
            const key = trimmed.slice(0, eq).trim();
            let value = trimmed.slice(eq + 1).trim();
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            if (process.env[key] === undefined) process.env[key] = value;
        });

        // Auto-generate strong cryptographic JWT_SECRET on fresh installs so token signing never fails
        if (!process.env.JWT_SECRET || !process.env.JWT_SECRET.trim() || process.env.JWT_SECRET === 'cash_management_sqlite_edition_secret_key_4000') {
            const generatedSecret = crypto.randomBytes(48).toString('base64url');
            process.env.JWT_SECRET = generatedSecret;
            let updatedEnv = content;
            if (/^JWT_SECRET\s*=/m.test(updatedEnv)) {
                updatedEnv = updatedEnv.replace(/^JWT_SECRET\s*=.*$/m, `JWT_SECRET=${generatedSecret}`);
            } else {
                updatedEnv = updatedEnv.trimEnd() + `\r\nJWT_SECRET=${generatedSecret}\r\n`;
            }
            fs.writeFileSync(envPath, updatedEnv, 'utf8');
        }
    } catch (_) { }
})();

process.env.CMBC_DEFER_DB_INIT = '1';

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const { getPool, initDatabase, isDbAlive, query, sql, getActiveTransactions } = require('./database/db');
const { createSqlIdempotencyStore } = require('./utils/idempotencyStore');
const { createIdempotencyMiddleware } = require('./utils/idempotencyMiddleware');
const { writeStartupStatus } = require('./utils/startupStatus');

// Global safety crash guards: an uncaught exception exits so the external supervisor can restart.
let uncaughtCount = 0;
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [Server] Unhandled Promise Rejection:', reason);
});
process.on('uncaughtException', (err) => {
    uncaughtCount++;
    console.error(`💥 [Server] Uncaught Exception (#${uncaughtCount}):`, err.message);
    console.error('💥 [Server] Exiting so the process supervisor can restart cleanly...');
    try {
        require('./utils/telemetryAgent').queueErrorSync({
            source: 'server',
            errorType: 'uncaughtException',
            message: err && err.message ? err.message : String(err),
            stack: err && err.stack ? err.stack : ''
        });
    } catch (_) { }
    // SSE clients ko close karo
    try { for (const c of sseClients) { try { c.end(); } catch (_) {} } } catch (_) {}
    sseClients.clear();
    setTimeout(() => process.exit(1), 1000);
});

const serverStartTime = Date.now();
const SERVER_BOOT_ID = require('crypto').randomBytes(16).toString('hex');

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || '0.0.0.0';
const DB_STARTUP_MAX_ATTEMPTS = 30;
let dbStartupReady = false;
let routesReady = false;
let dbStartupStage = 'booting';
let dbStartupAttempt = 1;
let startupProgressPct = 20;
let startupDetail = 'Server engine start ho raha hai...';

writeStartupStatus({
    pct: startupProgressPct,
    step: 2,
    stage: dbStartupStage,
    title: 'App Server Start Ho Raha Hai...',
    detail: startupDetail,
    port: PORT
});

const os = require('os');
const currentHostname = (os.hostname() || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
const hostPattern = currentHostname ? `|${currentHostname}(\\.(local|lan))?` : '';

// Middleware - CORS restricted to LOCAL & SAME WI-FI / LAN origins + supported bank/CSC portals.
const ALLOWED_ORIGIN_RE = new RegExp('^(' + [
    `https?://(localhost|127\\.0\\.0\\.1${hostPattern}|[a-z0-9_-]+\\.(local|lan)|192\\.168\\.\\d{1,3}\\.\\d{1,3}|10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}|172\\.(1[6-9]|2\\d|3[01])\\.\\d{1,3}\\.\\d{1,3})(:\\d+)?`,
    'chrome-extension://[a-z]+',
    'moz-extension://[a-z0-9-]+',
    'https?://([a-z0-9-]+\\.)*csc\\.gov\\.in(:\\d+)?',
    'https?://([a-z0-9-]+\\.)*digipaylite\\.in(:\\d+)?',
    'https?://([a-z0-9-]+\\.)*sbi\\.co\\.in(:\\d+)?',
    'https?://([a-z0-9-]+\\.)*spicemoney\\.(in|com)(:\\d+)?',
    'https?://([a-z0-9-]+\\.)*payworld\\.(in|com)(:\\d+)?',
    'https?://([a-z0-9-]+\\.)*gov\\.in(:\\d+)?',
    'https?://([a-z0-9-]+\\.)*nic\\.in(:\\d+)?',
    'https?://([a-z0-9-]+\\.)*utiitsl\\.com(:\\d+)?',
    'https?://([a-z0-9-]+\\.)*protean-tinpan\\.com(:\\d+)?'
].join('|') + ')$', 'i');

// DNS rebinding protection: Localhost & Same Wi-Fi LAN IPs only
const ALLOWED_HOST_RE = new RegExp(`^(localhost|127\\.0\\.0\\.1|\\[::1\\]${hostPattern}|[a-z0-9_-]+\\.(local|lan)|192\\.168\\.\\d{1,3}\\.\\d{1,3}|10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}|172\\.(1[6-9]|2\\d|3[01])\\.\\d{1,3}\\.\\d{1,3})(:\\d+)?$`, 'i');

function isAllowedOrigin(origin) {
    if (!origin) return true;
    return ALLOWED_ORIGIN_RE.test(origin);
}

app.use((req, res, next) => {
    const host = req.headers.host;
    if (host && !ALLOWED_HOST_RE.test(host)) {
        return res.status(403).json({ success: false, error: 'Host not allowed' });
    }
    const origin = req.headers.origin;
    const isHealthProbe = req.path === '/api/health';
    if (isHealthProbe && origin === 'null') {
        res.header('Access-Control-Allow-Origin', 'null');
        res.header('Vary', 'Origin');
        res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Access-Control-Request-Private-Network');
        res.header('Access-Control-Allow-Private-Network', 'true');
        if (req.method === 'OPTIONS') return res.sendStatus(204);
        return next();
    }
    if (!isAllowedOrigin(origin)) {
        return res.status(403).json({ success: false, error: 'Origin not allowed' });
    }
    res.header('Access-Control-Allow-Origin', origin || `http://localhost:${PORT}`);
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Idempotency-Key, Access-Control-Request-Private-Network, X-Api-Token');
    res.header('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});
app.use(cors((req, callback) => {
    const origin = req.headers.origin;
    const allowed = isAllowedOrigin(origin) || (req.path === '/api/health' && origin === 'null');
    if (!allowed) return callback(new Error('Origin not allowed by CORS'));
    return callback(null, {
        origin: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Idempotency-Key', 'Access-Control-Request-Private-Network', 'X-Api-Token']
    });
}));
// Active request tracking — auto-update sirf tab chalega jab koi request in-flight na ho.
// SSE (/api/live-events) ko count nahi karte warna stream hamesha "busy" rahega.
let activeRequests = 0;
app.use((req, res, next) => {
    if (req.path === '/api/live-events') return next();
    activeRequests++;
    let done = false;
    const dec = () => { if (!done) { done = true; activeRequests = Math.max(0, activeRequests - 1); } };
    res.on('finish', dec);
    res.on('close', dec);
    next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.text({ type: ['text/*', 'application/json'] }));

// Gzip/Deflate compression for all responses (HTML, CSS, JS, JSON API)
app.use(compression({
    threshold: 1024,
    filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        if (req.headers.accept && req.headers.accept.includes('text/event-stream')) return false;
        return compression.filter(req, res);
    }
}));

// 1. Strict Real-Time No-Cache Middleware for ALL API routes
app.use('/api', (req, res, next) => {
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store'
    });
    next();
});

const startupWaitPage = (() => {
    try {
        return fs.readFileSync(path.join(__dirname, 'public', 'startup-wait.html'), 'utf8');
    } catch (e) {
        return null;
    }
})();

// 2. Dedicated Health Check Endpoint (always responsive from instant HTTP bind)
app.get('/api/health', async (req, res) => {
    const uptimeSeconds = Math.round((Date.now() - serverStartTime) / 1000);
    const version = getAppVersion();
    if (!routesReady || !dbStartupReady) {
        const stageStep = dbStartupStage === 'routes' ? 5
            : (dbStartupStage === 'schema' || dbStartupStage === 'schema_repair' || dbStartupStage === 'seeding') ? 4
            : dbStartupStage === 'opening_db' ? 3 : 2;
        return res.status(503).json({
            success: false,
            status: dbStartupStage === 'waiting' ? 'WAITING' : 'CONNECTING',
            dbReady: false,
            isDatabaseDown: true,
            startupStage: dbStartupStage,
            progressPct: startupProgressPct,
            step: stageStep,
            detail: startupDetail,
            port: PORT,
            connectionAttempt: dbStartupAttempt,
            maxAttempts: DB_STARTUP_MAX_ATTEMPTS,
            version,
            bootId: SERVER_BOOT_ID,
            uptimeSeconds
        });
    }

    const alive = await isDbAlive();
    if (alive) {
        res.json({
            success: true,
            status: 'CONNECTED',
            dbReady: true,
            database: process.env.DB_NAME || 'CashManagement',
            startupStage: 'ready',
            progressPct: 100,
            step: 5,
            port: PORT,
            version,
            bootId: SERVER_BOOT_ID,
            uptimeSeconds,
            serverTime: new Date()
        });
    } else {
        res.status(503).json({
            success: false,
            status: 'DISCONNECTED',
            dbReady: false,
            isDatabaseDown: true,
            startupStage: 'reconnecting',
            progressPct: 50,
            port: PORT,
            version,
            bootId: SERVER_BOOT_ID,
            uptimeSeconds,
            error: 'Database connection is DOWN.'
        });
    }
});

// Early Startup Splash Gate: Port binds immediately so browsers never hit ERR_CONNECTION_REFUSED;
// HTML navigation shows animated loading progress until SQLite DB & all routes finish mounting.
app.use((req, res, next) => {
    if (routesReady && dbStartupReady) return next();
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/extension')) {
        const accept = String(req.headers.accept || '');
        if ((accept.includes('text/html') || req.path === '/' || req.path === '/index.html') && startupWaitPage) {
            res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
            res.set('Pragma', 'no-cache');
            res.set('Expires', '0');
            return res.type('html').status(200).send(startupWaitPage.replace(/__VERSION__/g, getAppVersion()));
        }
    }
    if (req.path.startsWith('/api')) {
        return res.status(503).json({
            success: false,
            isDatabaseDown: true,
            status: 'BOOTING',
            startupStage: dbStartupStage,
            progressPct: startupProgressPct,
            detail: startupDetail,
            error: 'Server abhi start ho raha hai — kuch second me ready hoga.'
        });
    }
    return next();
});

// ============================================================================
// EXTENSION BUILD TRACKING
// Extension ke SAARE files ka hash nikal kar ek "buildId" banate hain. Browser
// me loaded extension apna buildId server se compare karta hai - jaise hi koi
// file change hoti hai, extension khud reload ho jata hai. Isse user ko har
// baar "Load unpacked" / "Reload" manually karne ki zarurat NAHI padti.
// ============================================================================
const EXT_DIR = path.join(__dirname, 'extension');
const crypto = require('crypto');

function listExtensionFiles(dir) {
    const out = [];
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
    for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...listExtensionFiles(full));
        } else if (entry.isFile()) {
            out.push(full);
        }
    }
    return out;
}

// Build fingerprint: har file ka sha1 + size, phir un sab ka ek saath hash.
function getExtensionBuild() {
    const files = listExtensionFiles(EXT_DIR).sort();
    const hash = crypto.createHash('sha1');
    let maxMtime = 0;
    const details = [];

    for (const file of files) {
        let buf = null, stat = null;
        try {
            stat = fs.statSync(file);
            buf = fs.readFileSync(file);
        } catch (e) { continue; }
        const rel = path.relative(EXT_DIR, file).replace(/\\/g, '/');
        const fileHash = crypto.createHash('sha1').update(buf).digest('hex');
        hash.update(rel + ':' + fileHash + ';');
        if (stat.mtimeMs > maxMtime) maxMtime = stat.mtimeMs;
        details.push({
            file: rel,
            size: buf.length,
            mtime: Math.floor(stat.mtimeMs),
            sha1: fileHash.slice(0, 12)
        });
    }

    return {
        buildId: hash.digest('hex').slice(0, 16),
        maxMtime: Math.floor(maxMtime),
        fileCount: details.length,
        files: details
    };
}

// Sirf CORE files (jo browser actually run karta hai) ka fingerprint.
// NOTE: MV3 service worker apni hi extension files fetch nahi kar sakta
// (chrome.runtime.getURL ka fetch "Failed to fetch" deta hai), isliye browser
// side se apna build identity manifest.json ke "version" se pata lagta hai.
// Isliye server code badalne par manifest version AUTOMATICALLY bump karta hai.
const CORE_FILES = ['background.js', 'content.js', 'manifest.json'];

// Code hash: manifest ke version ko placeholder se replace karke - taaki sirf
// ASLI code change hone par hash badle (version bump se hash nahi badlna chahiye).
function computeCodeHash() {
    const hash = crypto.createHash('sha1');
    for (const file of listExtensionFiles(EXT_DIR).sort()) {
        const rel = path.relative(EXT_DIR, file).replace(/\\/g, '/');
        let buf;
        try { buf = fs.readFileSync(file); } catch (e) { continue; }
        if (rel === 'manifest.json') {
            try {
                const mf = JSON.parse(buf.toString('utf8'));
                mf.version = '__VERSION__';
                buf = Buffer.from(JSON.stringify(mf, null, 2));
            } catch (e) { }
        }
        const fileHash = crypto.createHash('sha1').update(buf).digest('hex');
        hash.update(rel + ':' + fileHash + ';');
    }
    return hash.digest('hex').slice(0, 16);
}

const BUILD_STATE_FILE = path.join(EXT_DIR, '.build-state.json');

// Extension ke code change hone par manifest ka version auto-bump hota hai.
// Isse browser (jo apna manifest version report karta hai) aur server ke
// beech ka mismatch pata lag jata hai - browser me stale copy honge to user
// ko turant pata chal jayega.
function ensureExtensionVersion() {
    const codeHash = computeCodeHash();
    const mfPath = path.join(EXT_DIR, 'manifest.json');
    try {
        const raw = fs.readFileSync(mfPath, 'utf8');
        const mf = JSON.parse(raw);

        // Build number ka source of truth khud manifest hai (state file sirf
        // codeHash cache hai) - isse koi bhi manual edit se number drift
        // nahi hota.
        const parts = String(mf.version || '1.0.0').split('.');
        const major = parts[0] || '1';
        const minor = parts[1] || '0';
        const curBuild = Number(parts[2] || 0) || 0;

        let state = { codeHash: null };
        try { state = JSON.parse(fs.readFileSync(BUILD_STATE_FILE, 'utf8')); } catch (e) { }

        if (state.codeHash === codeHash) {
            return { version: mf.version, buildNumber: curBuild, codeHash, bumped: false };
        }

        const next = `${major}.${minor}.${curBuild + 1}`;
        mf.version = next;
        const hadTrailingNewline = /\n$/.test(raw);
        fs.writeFileSync(mfPath, JSON.stringify(mf, null, 2) + (hadTrailingNewline ? '\n' : ''));
        fs.writeFileSync(BUILD_STATE_FILE, JSON.stringify({ codeHash, buildNumber: curBuild + 1, version: next }, null, 2));

        console.log(`🔄 [Extension] Code change detected - build bumped to v${next}`);
        return { version: next, buildNumber: curBuild + 1, codeHash, bumped: true };
    } catch (e) {
        return { version: getExtensionVersion(), buildNumber: 0, codeHash, bumped: false };
    }
}

function getExtensionVersion() {
    try {
        const mf = JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'manifest.json'), 'utf8'));
        return mf.version || '1.0.0';
    } catch (e) {
        return '1.0.0';
    }
}

function getCoreBuildId() {
    const hash = crypto.createHash('sha1');
    for (const rel of CORE_FILES) {
        const full = path.join(EXT_DIR, rel);
        let fileHash = 'missing';
        try {
            fileHash = crypto.createHash('sha1').update(fs.readFileSync(full)).digest('hex');
        } catch (e) { }
        hash.update(rel + ':' + fileHash + ';');
    }
    return hash.digest('hex').slice(0, 16);
}

// Dedicated Auto-Update & Version Check Endpoint for Chrome Extension
app.get('/api/extension/version', (req, res) => {
    try {
        const build = getExtensionBuild();
        const ver = ensureExtensionVersion();
        res.json({
            success: true,
            version: ver.version,
            buildId: build.buildId,
            codeHash: ver.codeHash,
            coreBuildId: getCoreBuildId(),
            buildNumber: ver.buildNumber,
            timestamp: build.maxMtime,
            fileCount: build.fileCount,
            extPath: EXT_DIR,
            serverTime: Date.now()
        });
    } catch (err) {
        res.json({ success: true, version: '1.0.0', buildId: 'unknown', timestamp: Date.now() });
    }
});

// Extension ZIP download - fresh install ke liye (public)
app.get('/api/extension/download', (req, res) => {
    try {
        const { createZipFromFolder } = require('./utils/zip');
        const zip = createZipFromFolder(EXT_DIR, { skip: ['test_parser.js', 'test_aadhaar_input.js', 'README.txt'] });
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="cash-management-bc-extension.zip"');
        res.setHeader('Content-Length', zip.length);
        res.setHeader('Cache-Control', 'no-store');
        res.end(zip);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Extension diagnostics, test, and config are mounted after authenticateUser below
// to avoid exposing account balances or local paths to unauthenticated callers.

// 3. Real-Time Server-Sent Events (SSE) Live Stream
// "kisi bhi tranjectin karne par sab kuch auto update hoga realtime koi refresh karne ki jaroorat na pade"
const sseClients = new Set();

app.get('/api/live-events', async (req, res) => {
    let databaseConnected = false;
    try {
        databaseConnected = await isDbAlive();
    } catch (err) {
        databaseConnected = false;
    }

    if (!databaseConnected) {
        return res.status(503).json({
            success: false,
            status: 'DISCONNECTED',
            isDatabaseDown: true,
            error: 'Database is unreachable; live updates are unavailable.'
        });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    sseClients.add(res);

    // Initial connection handshake
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: Date.now() })}\n\n`);

    // Check if an update is available and push notification immediately to this client
    try {
        autoUpdater.checkForUpdate().then(upd => {
            if (upd && upd.hasUpdate) {
                try {
                    res.write(`data: ${JSON.stringify({
                        type: 'UPDATE_AVAILABLE',
                        module: 'SYSTEM_UPDATE',
                        latestVersion: upd.latestVersion,
                        currentVersion: upd.currentVersion,
                        notes: upd.notes,
                        releasedAt: upd.releasedAt,
                        critical: upd.critical
                    })}\n\n`);
                } catch (_) { }
            }
        }).catch(() => { });
    } catch (_) { }

    req.on('close', () => {
        sseClients.delete(res);
    });
});

function broadcastDataChange(eventData) {
    const payload = `data: ${JSON.stringify(eventData)}\n\n`;
    for (const client of sseClients) {
        try {
            client.write(payload);
        } catch (e) {
            sseClients.delete(client);
        }
    }
}

// 4. Global Automatic Real-Time Broadcast Middleware:
// Har ek successful POST, PUT, DELETE par sabhi connected screens ko instant live update bhejo
app.use('/api', (req, res, next) => {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        res.on('finish', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                broadcastDataChange({
                    type: 'DATA_CHANGED',
                    method: req.method,
                    path: req.originalUrl,
                    timestamp: Date.now()
                });
            }
        });
    }
    next();
});

// 5. Mandatory Database Liveness Middleware (short TTL cache - DB hit per request avoid karne ke liye)
let dbAliveCache = { value: false, checkedAt: 0 };
const DB_ALIVE_TTL_MS = 5000;

async function getDbAliveCached() {
    if (!dbStartupReady) {
        dbAliveCache = { value: false, checkedAt: Date.now() };
        return false;
    }

    const now = Date.now();
    if (now - dbAliveCache.checkedAt < DB_ALIVE_TTL_MS) {
        return dbAliveCache.value;
    }
    const alive = await isDbAlive();
    dbAliveCache = { value: alive, checkedAt: now };
    return alive;
}

app.use('/api', async (req, res, next) => {
    if (req.path === '/health' || req.path === '/live-events' || req.path.startsWith('/logs') ||
        req.headers['idempotency-key'] !== undefined) return next();
    let alive = false;
    try {
        alive = await getDbAliveCached();
    } catch (e) {
        alive = false;
    }
    if (!alive) {
        dbAliveCache = { value: false, checkedAt: Date.now() };
        return res.status(503).json({
            success: false,
            isDatabaseDown: true,
            error: 'DATABASE NOT CONNECTED! Database is unreachable. Kisi bhi galat calculation ya data loss se bachne ke liye project operations lock hain.'
        });
    }
    next();
});

const autoUpdater = require('./utils/autoUpdater');

// Broadcast real-time update wizard progress to all connected clients
if (autoUpdater && autoUpdater.state) {
    autoUpdater.state.onProgress = (progressData) => {
        try {
            broadcastDataChange({
                module: 'SYSTEM_UPDATE',
                type: 'UPDATE_PROGRESS',
                ...progressData
            });
        } catch (_) { }
    };
}

// Dynamic Application Version Tracking (reads version.json without blocking startup)
let _autoUpdaterRef = null;
function getAutoUpdater() {
    if (!_autoUpdaterRef) _autoUpdaterRef = require('./utils/autoUpdater');
    return _autoUpdaterRef;
}

function getAppVersion() {
    try {
        const vJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf8'));
        return vJson.version || '1.0.0';
    } catch (e) {
        return '1.0.0';
    }
}

// App Version Check endpoint for remote browser auto-update
app.get('/api/app-version', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const localInfo = autoUpdater.getLocalVersionInfo();
    res.json({
        success: true,
        version: getAppVersion(),
        releaseVersion: localInfo.version || '1.0.0',
        bootId: SERVER_BOOT_ID,
        serverTime: new Date().toISOString()
    });
});

// System Auto-Update status & check (read-only)
app.get('/api/system/update-status', (req, res) => {
    res.json({ success: true, data: autoUpdater.getUpdateStatus() });
});

// Check-update & version-report routes are mounted after authenticateUser below.

// Version report list — moved behind authenticateUser + SuperAdmin/loopback check (see below)

// Explicit Service Worker Route with strict zero-cache policy
app.get('/sw.js', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});

// Self-Healing Watchdog: Auto-restore app.js if 0 bytes or corrupted by editor collision
app.use((req, res, next) => {
    if (req.path === '/app.js' || req.originalUrl?.startsWith('/app.js')) {
        const appPath = path.join(__dirname, 'public', 'app.js');
        const goldenPath = path.join(__dirname, 'backups', 'app.js.golden.bak');
        try {
            if (fs.existsSync(goldenPath)) {
                if (!fs.existsSync(appPath) || fs.statSync(appPath).size < 100000) {
                    console.warn('🛡️ [Watchdog] Detected truncated app.js! Auto-restoring from golden backup...');
                    fs.copyFileSync(goldenPath, appPath);
                }
            }
        } catch (e) { }
    }
    next();
});

// Runtime DB-down guard for HTML navigation (after startup finishes)
app.use(async (req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/extension')) return next();
    const accept = String(req.headers.accept || '');
    if (!accept.includes('text/html')) return next();
    let alive = false;
    try {
        alive = await getDbAliveCached();
    } catch (e) {
        alive = false;
    }
    if (alive) return next();
    if (!startupWaitPage) return next();
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.type('html').status(200).send(startupWaitPage.replace(/__VERSION__/g, getAppVersion()));
});

// Dynamic cache-busted HTML entrypoint (guarantees browsers never run stale JS/CSS after update)
function serveIndexHtml(req, res) {
    try {
        const indexPath = path.join(__dirname, 'public', 'index.html');
        let html = fs.readFileSync(indexPath, 'utf8');
        const assetStamp = encodeURIComponent(`${getAppVersion()}-${serverStartTime}`);
        html = html.replace(/(<(?:script|link)\b[^>]*(?:src|href)="[^"?]+)\?v=[^"]*"/gi, `$1?v=${assetStamp}"`);
        const bootScript = `<script>window.__APP_VERSION__=${JSON.stringify(getAppVersion())};window.__SERVER_BOOT_ID__=${JSON.stringify(SERVER_BOOT_ID)};</script>`;
        html = html.replace('</head>', `    ${bootScript}\n</head>`);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.type('html').send(html);
    } catch (err) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
}

app.get(['/', '/index.html'], serveIndexHtml);

// Static assets with ETag support for instant 304 Not Modified revalidation
const staticOptions = {
    etag: true,
    lastModified: true,
    maxAge: 0,
    setHeaders: (res, filePath) => {
        // no-cache allows browser to cache locally, but revalidate ETag with server -> 304 Not Modified (0 bytes)
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
};
// Block direct HTTP serving of installer/repair batch/script files if any exist under public/
app.use((req, res, next) => {
    if (/\.(bat|cmd|ps1|vbs|wsf|msi)$/i.test(req.path || '')) {
        return res.status(404).end();
    }
    next();
});
app.use(express.static(path.join(__dirname, 'public'), staticOptions));
app.use('/extension', express.static(path.join(__dirname, 'extension'), staticOptions));

// Multi-Tenant Authentication Middleware & Shared-Shop Staff Context
const { authenticateUser } = require('./middleware/auth');
const { runWithActor } = require('./utils/requestContext');
const { enforceStaffPermissions } = require('./middleware/staffPermissions');
app.use('/api', authenticateUser);
app.use('/api', (req, res, next) => {
    if (req.user) return runWithActor(req.user, () => next());
    return next();
});
app.use('/api', enforceStaffPermissions);
app.use('/api', createIdempotencyMiddleware(createSqlIdempotencyStore(query, sql)));

function isStrictLoopback(req) {
    if (req.headers['x-forwarded-for'] || req.headers['forwarded']) return false;
    const remoteAddr = String((req.socket && req.socket.remoteAddress) || req.ip || '').replace(/^::ffff:/, '');
    return remoteAddr === '127.0.0.1' || remoteAddr === '::1';
}

// Authenticated extension diagnostics, test runner & tenant-scoped config
app.get('/api/extension/diagnostics', (req, res) => {
    try {
        const build = getExtensionBuild();
        res.json({
            success: true,
            extPath: EXT_DIR,
            buildId: build.buildId,
            maxMtime: build.maxMtime,
            fileCount: build.fileCount,
            files: build.files,
            serverTime: Date.now()
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/extension/test', (req, res) => {
    const { execFile } = require('child_process');
    const script = path.join(EXT_DIR, 'test_parser.js');
    if (!fs.existsSync(script)) {
        return res.status(404).send('test_parser.js not found');
    }
    execFile(process.execPath, [script], { cwd: __dirname, timeout: 60000, windowsHide: true },
        (err, stdout, stderr) => {
            res.type('text/plain').send((stdout || '') + (stderr || '') + (err ? '\n[exit ' + err.code + ']' : ''));
        }
    );
});

app.get('/api/extension/config', async (req, res) => {
    try {
        const { query } = require('./database/db');
        const userId = req.user.UserID;
        let accounts = [];
        let cscServices = [];
        try {
            const accRes = await query(
                "SELECT AccountID, AccountName, AccountType, CurrentBalance FROM Accounts WHERE IsActive = 1 AND UserID = @userId",
                { userId }
            );
            accounts = accRes.recordset || [];
        } catch (e) { }

        try {
            const sRes = await query(
                "SELECT ServiceID, ServiceName, GovtFee, OperatorFee, (GovtFee + OperatorFee) AS TotalFee, DefaultDays, Icon FROM CSCServices WHERE IsActive = 1 AND (UserID = @userId OR UserID = 1 OR UserID IS NULL) ORDER BY SortOrder ASC, ServiceName ASC",
                { userId }
            );
            cscServices = sRes.recordset || [];
        } catch (e) { }

        res.json({
            success: true,
            banks: [
                'State Bank of India', 'Punjab National Bank', 'Bank of Baroda',
                'Central Bank of India', 'Union Bank of India', 'Canara Bank',
                'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Kotak Mahindra Bank',
                'Indian Bank', 'Bank of India', 'UCO Bank', 'Indian Overseas Bank',
                'Aryavart Bank', 'Baroda UP Bank', 'Prathama UP Gramin Bank',
                'Paytm Payments Bank', 'Airtel Payments Bank', 'India Post Payments Bank',
                'Fino Payments Bank'
            ],
            accounts: accounts,
            cscServices: cscServices,
            commissionRules: {
                minComm: 0,
                maxComm: 10,
                defaultPercent: 0.2
            },
            supportedPortals: [
                { name: 'CSC AEPS', domain: 'csc.gov.in' },
                { name: 'Digipay Lite', domain: 'digipaylite.in' },
                { name: 'Digipay', domain: 'digipay.csc.gov.in' },
                { name: 'SBI Kiosk', domain: 'sbi' },
                { name: 'Spice Money', domain: 'spicemoney' },
                { name: 'Payworld', domain: 'payworld' }
            ],
            urlRules: {
                enabled: true,
                patterns: [
                    '*://*.csc.gov.in/*receipt*',
                    '*://*.csc.gov.in/*success*',
                    '*://*.csc.gov.in/*transaction*',
                    '*://*.csc.gov.in/*print*',
                    '*://*.digipaylite.in/*receipt*',
                    '*://*.digipaylite.in/*success*',
                    '*://*.digipaylite.in/*transaction*',
                    '*://*.digipay.csc.gov.in/*receipt*',
                    '*://*.digipay.csc.gov.in/*success*',
                    '*://*.digipay.csc.gov.in/*transaction*',
                    '*://*.spicemoney.in/*receipt*',
                    '*://*.spicemoney.in/*success*',
                    '*://*.spicemoney.com/*receipt*',
                    '*://*.payworld.in/*receipt*',
                    '*://*.payworld.com/*receipt*',
                    '*://*.sbi.co.in/*receipt*',
                    '*://*.sbi/*receipt*'
                ]
            },
            extension: (() => {
                try {
                    const b = getExtensionBuild();
                    return { buildId: b.buildId, fileCount: b.fileCount };
                } catch (e) { return {}; }
            })()
        });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.get('/api/system/check-update', async (req, res) => {
    const result = await autoUpdater.checkForUpdate();
    if (result && result.hasUpdate) {
        broadcastDataChange({
            type: 'UPDATE_AVAILABLE',
            module: 'SYSTEM_UPDATE',
            latestVersion: result.latestVersion,
            currentVersion: result.currentVersion,
            notes: result.notes,
            releasedAt: result.releasedAt,
            critical: result.critical
        });
    }
    res.json(result);
});

app.post('/api/system/version-report', async (req, res) => {
    try {
        const { version, pcName, hostname, ip, timestamp, notes } = req.body || {};
        const reportFile = path.join(__dirname, 'logs', 'version-reports.json');

        let reports = [];
        try {
            if (fs.existsSync(reportFile)) {
                reports = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
            }
        } catch (_) { reports = []; }

        const entry = {
            version: version || autoUpdater.getLocalVersionInfo().version,
            pcName: pcName || hostname || 'unknown-pc',
            hostname: hostname || 'unknown',
            ip: ip || req.ip || req.connection?.remoteAddress || 'unknown',
            reportedAt: timestamp || new Date().toISOString(),
            notes: notes || ''
        };

        const existingIdx = reports.findIndex(r => r.hostname === entry.hostname && r.pcName === entry.pcName);
        if (existingIdx >= 0) {
            reports[existingIdx] = entry;
        } else {
            reports.push(entry);
        }

        if (reports.length > 500) reports = reports.slice(-500);

        const logDir = path.join(__dirname, 'logs');
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        fs.writeFileSync(reportFile, JSON.stringify(reports, null, 2) + '\n', 'utf8');

        res.json({ success: true, message: 'Version report save ho gaya', data: entry });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/system/version-reports', (req, res) => {
    const isAllowed = isStrictLoopback(req) || (req.user && (req.user.Role === 'SuperAdmin' || req.user.UserID === 1));
    if (!isAllowed) {
        return res.status(403).json({ success: false, error: 'SuperAdmin access required' });
    }
    try {
        const reportFile = path.join(__dirname, 'logs', 'version-reports.json');
        let reports = [];
        if (fs.existsSync(reportFile)) {
            reports = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
        }
        res.json({ success: true, count: reports.length, data: reports });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

function yieldStartupTick() {
    return new Promise((resolve) => setImmediate(resolve));
}

let deferredRoutesMounted = false;
async function mountDeferredRoutesAndFinalize() {
    if (deferredRoutesMounted) return;
    deferredRoutesMounted = true;

    // Auth & Admin Routes
    app.use('/api/auth', require('./routes/auth'));
    app.use('/api/admin', require('./routes/admin'));
    app.use('/api/license', require('./routes/license'));
    app.use('/api/idempotency', require('./routes/idempotency'));
    await yieldStartupTick();

    // License Enforcement Guard for Mutating Requests (Data is NEVER locked for viewing)
    app.use('/api', (req, res, next) => {
        if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
            return next();
        }
        const p = req.path || '';
        if (p.startsWith('/license') || p.startsWith('/auth') || p.startsWith('/logs') || p.startsWith('/system') || p.startsWith('/settings')) {
            return next();
        }
        try {
            const lm = require('./utils/licenseManager');
            const status = lm.getLicenseStatus();
            if (status && status.isExpired) {
                return res.status(403).json({
                    success: false,
                    code: 'LICENSE_EXPIRED',
                    error: 'लाइसेंस समाप्त हो चुका है। कृपया सेटिंग्स में जाकर नया लाइसेंस एक्टिवेट करें अथवा संजय जी से संपर्क करें।',
                    license: status
                });
            }
        } catch (_) { }
        next();
    });

    // Authenticated User Trigger for 1-Click Auto-Updater from Dashboard
    app.post('/api/system/apply-update', async (req, res) => {
        const isAdmin = isStrictLoopback(req) || (req.user && (req.user.Role === 'SuperAdmin' || req.user.UserID === 1 || req.user.Role === 'Admin'));
        if (!isAdmin) {
            return res.status(403).json({ success: false, error: 'Kripya Admin account se login karke update karein.' });
        }
        if (getActiveTransactions() > 0) {
            return res.status(409).json({
                success: false,
                skipped: true,
                reason: 'Ek database transaction abhi chal raha hai — data suraksha ke liye 2 second me dubara try karein.'
            });
        }
        const force = Boolean(req.body && req.body.force !== false);
        const result = await autoUpdater.runSilentAutoUpdate({ force, restartOnUpdate: true });
        res.json(result);
    });

    // API Routes (loaded in yielding batches so Port 4000 stays live during cold boot)
    app.use('/api/logs', require('./routes/logs'));
    app.use('/api/accounts', require('./routes/accounts'));
    app.use('/api/transactions', require('./routes/transactions'));
    app.use('/api/parties', require('./routes/parties'));
    app.use('/api/categories', require('./routes/categories'));
    app.use('/api/budgets', require('./routes/budgets'));
    app.use('/api/bills', require('./routes/bills'));
    startupProgressPct = 82;
    startupDetail = 'Core accounting & ledger routes load ho rahi hain...';
    writeStartupStatus({ pct: 82, step: 5, stage: 'routes', title: 'Modules Load Ho Rahe Hain...', detail: startupDetail, port: PORT, version: getAppVersion() });
    await yieldStartupTick();

    app.use('/api/reports', require('./routes/reports'));
    app.use('/api/bc', require('./routes/bc'));
    app.use('/api/customers', require('./routes/customers'));
    app.use('/api/invoices', require('./routes/invoices'));
    app.use('/api/khatabook', require('./routes/khatabook'));
    app.use('/api/database', require('./routes/database'));
    app.use('/api/search', require('./routes/search'));
    app.use('/api/recyclebin', require('./routes/recyclebin'));
    app.use('/api/documents', require('./routes/documents'));
    startupProgressPct = 88;
    startupDetail = 'CSC, Khata aur Billing modules taiyaar ho rahe hain...';
    writeStartupStatus({ pct: 88, step: 5, stage: 'routes', title: 'Modules Load Ho Rahe Hain...', detail: startupDetail, port: PORT, version: getAppVersion() });
    await yieldStartupTick();

    app.use('/api/csc', require('./routes/csc'));
    app.use('/api/service', require('./routes/service_records'));
    app.use('/api/bill-payments', require('./routes/bill_payments'));
    app.use('/api/ucl', require('./routes/ucl'));
    app.use('/api/pac', require('./routes/pac'));
    app.use('/api/recurring', require('./routes/recurring'));
    app.use('/api/settings', require('./routes/settings'));
    app.use('/api/history', require('./routes/history'));
    startupProgressPct = 94;
    startupDetail = 'OCR, Utility Bill aur Settings active ho rahe hain...';
    writeStartupStatus({ pct: 94, step: 5, stage: 'routes', title: 'Services Activate Ho Rahi Hain...', detail: startupDetail, port: PORT, version: getAppVersion() });
    await yieldStartupTick();

    // Live Sidebar Badges API — counts across all modules in a single instant query
    app.get('/api/badges', async (req, res) => {
        try {
            const { query } = require('./database/db');
            const userId = req.user.UserID;
            const sql = `
                SELECT 
                    (SELECT COUNT(*) FROM Transactions WHERE UserID = @userId) AS transactions,
                    (SELECT COUNT(*) FROM Accounts WHERE IsActive = 1 AND UserID = @userId) AS accounts,
                    (SELECT COUNT(*) FROM Parties WHERE UserID = @userId) AS parties,
                    (SELECT COUNT(*) FROM Customers WHERE IsActive = 1 AND UserID = @userId) AS customers,
                    (SELECT COUNT(*) FROM Invoices WHERE UserID = @userId) AS invoices,
                    (SELECT COUNT(*) FROM KhataEntries WHERE UserID = @userId) AS khatabook,
                    (SELECT COUNT(*) FROM Documents WHERE UserID = @userId) AS documents,
                    (SELECT COUNT(*) FROM CSCApplications WHERE IsActive = 1 AND UserID = @userId) AS csc,
                    (SELECT COUNT(*) FROM Budgets WHERE UserID = @userId) AS budgets,
                    (SELECT COUNT(*) FROM Bills WHERE UserID = @userId) AS bills,
                    (SELECT COUNT(*) FROM Categories WHERE IsActive = 1 AND UserID = @userId) AS categories,
                    (SELECT COUNT(*) FROM AuditLogs WHERE UserID = @userId) AS history,
                    (
                        (SELECT COUNT(*) FROM Customers WHERE IsActive = 0 AND UserID = @userId) +
                        (SELECT COUNT(*) FROM Accounts WHERE IsActive = 0 AND UserID = @userId) +
                        (SELECT COUNT(*) FROM Categories WHERE IsActive = 0 AND UserID = @userId)
                    ) AS recyclebin
            `;
            const result = await query(sql, { userId });
            const base = result.recordset[0] || {};

            let ucl = 0;
            let pac = 0;
            let billpayments = 0;
            try {
                const uclRes = await query('SELECT COUNT(*) AS c FROM UCLUpdates WHERE IsDeleted = 0 AND UserID = @userId', { userId });
                ucl = uclRes.recordset?.[0]?.c || 0;
            } catch (_) { ucl = 0; }
            try {
                const pacRes = await query("SELECT COUNT(*) AS c FROM PACEntries WHERE IsDeleted = 0 AND Status = 'Available' AND UserID = @userId", { userId });
                pac = pacRes.recordset?.[0]?.c || 0;
            } catch (_) { pac = 0; }
            try {
                const bpRes = await query('SELECT COUNT(*) AS c FROM BillPayments WHERE ISNULL(IsDeleted, 0) = 0 AND UserID = @userId', { userId });
                billpayments = bpRes.recordset?.[0]?.c || 0;
            } catch (_) { billpayments = 0; }

            res.json({ success: true, data: { ...base, ucl, pac, billpayments } });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // Network Info API for Mobile QR and LAN connection
    app.get('/api/network-info', (req, res) => {
        const os = require('os');
        const nets = os.networkInterfaces();
        let lanIp = '127.0.0.1';
        for (const n of Object.keys(nets)) {
            for (const net of nets[n]) {
                if (net.family === 'IPv4' && !net.internal && (net.address.startsWith('192.168.') || net.address.startsWith('10.'))) {
                    lanIp = net.address;
                    break;
                }
            }
        }
        res.json({
            success: true,
            ip: lanIp,
            port: PORT,
            url: `http://${lanIp}:${PORT}`,
            hostname: os.hostname(),
            mDnsUrl: `http://${os.hostname().toLowerCase()}.local:${PORT}`
        });
    });

    // Unknown /api paths ko JSON 404 do (SPA fallback se pehle - warna frontend ko HTML milega)
    app.use('/api', (req, res) => {
        res.status(404).json({ success: false, error: 'API route nahi mila' });
    });

    // SPA fallback - sab routes frontend ko bhejo (Strictly No-Cache + Dynamic Versioning)
    app.get(/.*/, (req, res) => {
        serveIndexHtml(req, res);
    });

    // Global Error Handler - har error JSON me do, HTML nahi, aur logs file me save karo
    app.use((err, req, res, next) => {
        if (res.headersSent) return next(err);
        console.error('❌ API Error:', req.method, req.originalUrl, '-', err.message);

        try {
            const sLogsDir = path.join(__dirname, 'logs');
            if (!fs.existsSync(sLogsDir)) fs.mkdirSync(sLogsDir, { recursive: true });
            const sLogEntry = `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${err.message}\nStack: ${err.stack || 'N/A'}\n\n`;
            fs.appendFile(path.join(sLogsDir, 'server_errors.log'), sLogEntry, () => { });
        } catch (e) { }

        const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
        res.status(status).json({
            success: false,
            error: err.message || 'Server error aa gaya',
            ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {})
        });
    });

    routesReady = true;
}

// Background SQLite database & deferred route initialization manager
async function connectDbInBackground() {
    try {
        dbStartupStage = 'opening_db';
        startupProgressPct = 32;
        startupDetail = 'SQLite embedded database open ho raha hai...';
        writeStartupStatus({ pct: 32, step: 3, stage: 'opening_db', title: 'Database Khul Raha Hai...', detail: startupDetail, port: PORT, version: getAppVersion() });
        await yieldStartupTick();

        await initDatabase((stage, pct, detail) => {
            dbStartupStage = stage;
            startupProgressPct = pct;
            startupDetail = detail;
            writeStartupStatus({
                pct,
                step: stage === 'opening_db' ? 3 : 4,
                stage,
                title: stage === 'seeding' ? 'Defaults Verify Ho Rahe Hain...' : 'Schema & Integrity Verify Ho Rahi Hai...',
                detail,
                port: PORT,
                version: getAppVersion()
            });
        });

        dbStartupStage = 'routes';
        startupProgressPct = 76;
        startupDetail = 'Application routes aur security services load ho rahi hain...';
        writeStartupStatus({ pct: 76, step: 5, stage: 'routes', title: 'Apna Hisaab Load Ho Raha Hai...', detail: startupDetail, port: PORT, version: getAppVersion() });
        await yieldStartupTick();

        await mountDeferredRoutesAndFinalize();

        const connected = await isDbAlive();
        if (connected) {
            console.log('✅ SQLite Database 100% Ready (Zero-Install Edition)!');
            dbStartupReady = true;
            dbStartupStage = 'ready';
            startupProgressPct = 100;
            startupDetail = 'Server 100% Live Hai! App khul raha hai...';
            dbAliveCache = { value: true, checkedAt: Date.now() };
            writeStartupStatus({
                pct: 100,
                step: 5,
                stage: 'ready',
                title: 'Server 100% Live Hai!',
                detail: startupDetail,
                ok: true,
                port: PORT,
                version: getAppVersion()
            });
            runRecurring();
            setInterval(runRecurring, 60 * 60 * 1000);
        }
    } catch (e) {
        dbStartupStage = 'reconnecting';
        startupDetail = `Database startup notice: ${e.message} (retrying...)`;
        writeStartupStatus({
            pct: startupProgressPct,
            step: 3,
            stage: 'error',
            title: 'Database Retry Chal Raha Hai...',
            detail: startupDetail,
            error: e.message,
            port: PORT,
            version: getAppVersion()
        });
        console.error('⚠️ SQLite DB startup notice:', e.message);
        setTimeout(() => { connectDbInBackground(); }, 4000);
    }
}

// Server start: app.listen turant chalu hoga taaki localhost:3000 par "site can't be reached" na aaye!
let httpServer = null;

function startServer() {
    try {
        httpServer = app.listen(PORT, HOST, () => {
            const os = require('os');
            const nets = os.networkInterfaces();
            let lanIp = '127.0.0.1';
            for (const n of Object.keys(nets)) {
                for (const net of nets[n]) {
                    if (net.family === 'IPv4' && !net.internal) { lanIp = net.address; break; }
                }
            }

            console.log('');
            console.log('╔════════════════════════════════════════════════════════════════╗');
            console.log('║   💰 CASH MANAGEMENT SYSTEM - STARTED!                         ║');
            console.log('╠════════════════════════════════════════════════════════════════╣');
            console.log(`║   🌐 This PC:         http://localhost:${PORT}                      ║`);
            console.log(`║   📱 Mobile / Other:  http://${lanIp}:${PORT}               ║`);
            console.log('╠════════════════════════════════════════════════════════════════╣');
            console.log('║   ⚡ Web Server: Active & Listening (Instant Boot)             ║');
            console.log('║   🔄 Database: Connecting to SQLite Database in background...  ║');
            console.log('║   📶 Network: LOCAL + SAME WI-FI / LAN ALLOWED                 ║');
            console.log('╚════════════════════════════════════════════════════════════════╝');
            console.log('');

            // Background mein SQL Server se connect karein bina port 3000 block kiye
            connectDbInBackground();

            // Initialize License Engine & Auto-Provision Community Key (Zero Interruption)
            try {
                const licenseManager = require('./utils/licenseManager');
                licenseManager.initLicense().catch(e => console.warn('⚠️ [License] Init:', e.message));
            } catch (e) {
                console.warn('⚠️ [License] Engine error:', e.message);
            }

            // Windows self-heal + Fleet Telemetry heartbeat
            let lastAutostartSummary = null;
            setTimeout(() => {
                try { lastAutostartSummary = require('./utils/windows_autostart').ensureWindowsAutostart(); } catch (e) { }
            }, 10000);
            try {
                const telemetry = require('./utils/telemetryAgent');
                telemetry.startPeriodicTelemetry({
                    getPort: () => PORT,
                    getAppVersion,
                    getAutostartStatus: () => lastAutostartSummary
                });
            } catch (_) { }

// Smart Proactive Auto-Update Engine (Immediate Zero-Touch Delivery):
// 1. Boot ke 8s baad pehla check, agar app busy ho to har 15s me retry karega (max 8 attempts).
// 2. Har 20 minute me automatic background check.
// 3. Raat 2:30 AM scheduler.
const isServerIdleForUpdate = () => activeRequests === 0 && getActiveTransactions() === 0;
autoUpdater.setBeforeRestartHandler(() => gracefulShutdown('AUTO_UPDATE_RESTART', { exitProcess: false }));

function scheduleBootAutoUpdate() {
    let attempts = 0;
    const maxAttempts = 8;
    const tryBootUpdate = async () => {
        attempts++;
        try {
            const res = await autoUpdater.runSilentAutoUpdate({
                restartOnUpdate: true,
                requireIdle: true,
                isIdle: isServerIdleForUpdate
            });
            if (res && res.updated) return;
            if (res && res.skipped) {
                // Disabled / local changes / cooldown par boot retry ka koi matlab nahi.
                if (/AUTO_UPDATE_DISABLED|Local changes|cooldown/i.test(String(res.reason || ''))) return;
                if (attempts < maxAttempts) setTimeout(tryBootUpdate, 15000);
            }
        } catch (_) {
            if (attempts < maxAttempts) setTimeout(tryBootUpdate, 20000);
        }
    };
    setTimeout(tryBootUpdate, 8000);
}
scheduleBootAutoUpdate();

// Har 20 minute me automatic background check (Sanjay ji ke push karte hi sabhi PC par bina restart update)
autoUpdater.startPeriodicCheck(20 * 60 * 1000, isServerIdleForUpdate);

scheduleNightlyUpdate();
        });
        httpServer.on('error', (listenErr) => {
            const code = listenErr && listenErr.code ? listenErr.code : 'UNKNOWN';
            console.error(`❌ Server listen error (${code}) on ${HOST}:${PORT}:`, listenErr.message);
            writeStartupStatus({
                pct: 25,
                step: 2,
                stage: 'error',
                title: `Port ${PORT} Error (${code})`,
                detail: `Port ${PORT} par problem aayi: ${listenErr.message}`,
                error: listenErr.message,
                port: PORT,
                version: getAppVersion()
            });
            try {
                require('./utils/telemetryAgent').queueErrorSync({
                    source: 'server',
                    errorType: `listen_${code}`,
                    message: `Listen Error (${code}) on ${HOST}:${PORT}: ${listenErr.message}`
                });
            } catch (_) { }
            try {
                const errLogDir = path.join(__dirname, 'logs');
                if (!fs.existsSync(errLogDir)) fs.mkdirSync(errLogDir, { recursive: true });
                fs.appendFileSync(path.join(errLogDir, 'server_errors.log'), `[${new Date().toISOString()}] Listen Error (${code}) on ${HOST}:${PORT}: ${listenErr.message}\n`);
            } catch (_) { }
            process.exit(1);
        });
    } catch (err) {
        console.error('');
        console.error('❌ Server listen error:', err.message);
        process.exit(1);
    }
}

// Recurring engine ko safely chalaye (crash na ho)
async function runRecurring() {
    try {
        const { processRecurringTransactions } = require('./database/recurringEngine');
        await processRecurringTransactions();
    } catch (e) {
        console.error('🔁 Recurring process error (non-fatal):', e.message);
    }
}

// Raat ka auto-update scheduler: roz 2:30 AM local time.
// Boot ke baad bhi ek check hota hai, isliye purana install bhi turant update ho jata hai.
function scheduleNightlyUpdate() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(2, 30, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);

    console.log(`🕝 [Auto-Update] Next check: ${next.toLocaleString()}`);
    setTimeout(async () => {
        let result = null;
        try {
            result = await autoUpdater.runSilentAutoUpdate({
                restartOnUpdate: true,
                requireIdle: true,
                isIdle: isServerIdleForUpdate
            });
        } catch (_) { }

        // Agar app busy tha to agle din ka wait na karo — 30 min baad dobara try karo.
        if (result && result.skipped && /busy/i.test(String(result.reason || ''))) {
            console.log('⏳ [Auto-Update] App busy tha — 30 minute baad dobara try hoga.');
            setTimeout(() => scheduleNightlyUpdate(), 30 * 60 * 1000);
            return;
        }
        scheduleNightlyUpdate();
    }, next.getTime() - now.getTime());
}

// Graceful shutdown: in-flight requests + SQLite WAL checkpoint + DB close cleanly.
let shuttingDown = false;
function gracefulShutdown(signal, { exitProcess = true } = {}) {
    if (shuttingDown) return Promise.resolve();
    shuttingDown = true;
    console.log(`\n🛑 ${signal} received — graceful shutdown shuru...`);

    for (const client of sseClients) {
        try { client.end(); } catch (_) { }
    }
    sseClients.clear();

    return new Promise((resolve) => {
        let finished = false;
        const finish = async () => {
            if (finished) return;
            finished = true;
            try {
                const db = require('./database/db');
                if (db.closePool) await db.closePool();
            } catch (_) { }
            resolve();
            if (exitProcess) process.exit(0);
        };

        if (httpServer) {
            try { httpServer.close(() => finish()); } catch (_) { finish(); }
            setTimeout(() => finish(), 5000).unref();
        } else {
            finish();
        }
    });
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

startServer();

