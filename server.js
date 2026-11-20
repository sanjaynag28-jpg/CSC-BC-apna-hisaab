const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const { getPool, isDbAlive, query, sql } = require('./database/db');
const { createSqlIdempotencyStore } = require('./utils/idempotencyStore');
const { createIdempotencyMiddleware } = require('./utils/idempotencyMiddleware');

// Global safety crash guards: prevents unexpected unhandled promise rejections from killing server.
// NOTE: uncaughtException ke baad process ki state bharosemand nahi rehti. Default me sirf
// log hota hai (existing behaviour); EXIT_ON_UNCAUGHT=true karke PM2 managed restart use karein.
let uncaughtCount = 0;
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [Server] Unhandled Promise Rejection:', reason);
});
process.on('uncaughtException', (err) => {
    uncaughtCount++;
    console.error(`💥 [Server] Uncaught Exception (#${uncaughtCount}):`, err);
    if (process.env.EXIT_ON_UNCAUGHT === 'true') {
        console.error('💥 [Server] EXIT_ON_UNCAUGHT=true — process exit kar raha hai (PM2 restart karega).');
        process.exit(1);
    }
});

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

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
    if (!isAllowedOrigin(origin)) {
        return res.status(403).json({ success: false, error: 'Origin not allowed' });
    }
    res.header('Access-Control-Allow-Origin', origin || 'http://localhost:3000');
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Idempotency-Key, Access-Control-Request-Private-Network');
    res.header('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});
app.use(cors({
    origin: function (origin, callback) {
        if (isAllowedOrigin(origin)) return callback(null, true);
        return callback(new Error('Origin not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Idempotency-Key', 'Access-Control-Request-Private-Network']
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

// 2. Dedicated Health Check Endpoint
app.get('/api/health', async (req, res) => {
    const alive = await isDbAlive();
    if (alive) {
        res.json({
            success: true,
            status: 'CONNECTED',
            dbReady: true,
            database: process.env.DB_NAME || 'CashManagement',
            uptimeSeconds: Math.round((Date.now() - serverStartTime) / 1000),
            serverTime: new Date()
        });
    } else {
        res.status(503).json({
            success: false,
            status: 'DISCONNECTED',
            dbReady: false,
            isDatabaseDown: true,
            uptimeSeconds: Math.round((Date.now() - serverStartTime) / 1000),
            error: 'SQL Server connection is DOWN. Check SQL Server (SQLEXPRESS) service.'
        });
    }
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

// Diagnostics: extension folder + file list, taaki user ko pata chale ki
// browser me loaded extension isi folder se hai ya nahi.
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

// Extension ZIP download - fresh install ke liye (Load unpacked folder se
// install karne ka bhi option hai, dono ek click me).
app.get('/api/extension/download', (req, res) => {
    try {
        const { createZipFromFolder } = require('./utils/zip');
        const zip = createZipFromFolder(EXT_DIR, { skip: ['test_parser.js', 'README.txt'] });
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="cash-management-bc-extension.zip"');
        res.setHeader('Content-Length', zip.length);
        res.setHeader('Cache-Control', 'no-store');
        res.end(zip);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Extension self-test run karo (parser + URL rules regression suite)
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

// Dynamic Configuration for Extension (Banks, Portals, Accounts, Commission Rules)
app.get('/api/extension/config', async (req, res) => {
    try {
        const { query } = require('./database/db');
        let accounts = [];
        let cscServices = [];
        try {
            const accRes = await query("SELECT AccountID, AccountName, AccountType, CurrentBalance FROM Accounts WHERE IsActive = 1");
            accounts = accRes.recordset || [];
        } catch (e) { }

        try {
            const sRes = await query("SELECT ServiceID, ServiceName, GovtFee, OperatorFee, (GovtFee + OperatorFee) AS TotalFee, DefaultDays, Icon FROM CSCServices WHERE IsActive = 1 ORDER BY SortOrder ASC, ServiceName ASC");
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
            // Grab button sirf in URL patterns wale pages par dikhega.
            // Pattern me '*' koi bhi character match karta hai.
            // User inhe extension ke Settings panel se kabhi bhi badal sakta hai.
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
            error: 'SQL Server is unreachable; live updates are unavailable.'
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
            error: 'DATABASE NOT CONNECTED! SQL Server is unreachable. Kisi bhi galat calculation ya data loss se bachne ke liye project operations lock hain.'
        });
    }
    next();
});

const autoUpdater = require('./utils/autoUpdater');

// Dynamic Application Version Tracking (Updates automatically whenever version.json, app.js or server updates)
const serverStartTime = Date.now();
function getAppVersion() {
    try {
        const localVer = autoUpdater.getLocalVersionInfo().version || '1.0.0';
        const appStat = fs.statSync(path.join(__dirname, 'public', 'app.js'));
        const htmlStat = fs.statSync(path.join(__dirname, 'public', 'index.html'));
        return `${localVer}-${Math.max(Math.floor(appStat.mtimeMs), Math.floor(htmlStat.mtimeMs), serverStartTime)}`;
    } catch (e) {
        return `${serverStartTime}`;
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
        serverTime: new Date().toISOString()
    });
});

// System Auto-Update status & check (read-only)
app.get('/api/system/update-status', (req, res) => {
    res.json({ success: true, data: autoUpdater.getUpdateStatus() });
});

app.get('/api/system/check-update', async (req, res) => {
    const result = await autoUpdater.checkForUpdate();
    res.json(result);
});

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

// ---------------------------------------------------------------------------
// STARTUP "PLEASE WAIT" GATE
// Server turant listen karta hai, isliye browser me "site can't be reached"
// nahi aata. Par jab tak SQL Server ready na ho, HTML page par friendly
// "Please wait" screen dikhti hai jo khud refresh hoti hai. DB ready hote hi
// normal app khul jata hai. (User ko kuch samajhne/karne ki zaroorat nahi.)
// ---------------------------------------------------------------------------
const startupWaitPage = (() => {
    try {
        return fs.readFileSync(path.join(__dirname, 'public', 'startup-wait.html'), 'utf8');
    } catch (e) {
        return null;
    }
})();

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
app.use(express.static(path.join(__dirname, 'public'), staticOptions));
app.use('/extension', express.static(path.join(__dirname, 'extension'), staticOptions));

// Multi-Tenant Authentication Middleware
const { authenticateUser } = require('./middleware/auth');
app.use('/api', authenticateUser);
app.use('/api', createIdempotencyMiddleware(createSqlIdempotencyStore(query, sql)));

// Auth & Admin Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/idempotency', require('./routes/idempotency'));

// Authenticated Admin Manual Trigger for Silent Auto-Updater
app.post('/api/system/apply-update', async (req, res) => {
    const isAdmin = req.user && (req.user.Role === 'SuperAdmin' || req.user.UserID === 1);
    if (!isAdmin) {
        return res.status(403).json({ success: false, error: 'Sirf Admin hi manual update chala sakta hai.' });
    }
    const force = Boolean(req.body && req.body.force);
    const result = await autoUpdater.runSilentAutoUpdate({ force, restartOnUpdate: true });
    res.json(result);
});

// API Routes
app.use('/api/logs', require('./routes/logs'));
app.use('/api/accounts', require('./routes/accounts'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/parties', require('./routes/parties'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/budgets', require('./routes/budgets'));
app.use('/api/bills', require('./routes/bills'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/bc', require('./routes/bc'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/khatabook', require('./routes/khatabook'));
app.use('/api/database', require('./routes/database'));
app.use('/api/search', require('./routes/search'));
app.use('/api/recyclebin', require('./routes/recyclebin'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/csc', require('./routes/csc'));
app.use('/api/service', require('./routes/service_records'));
app.use('/api/bill-payments', require('./routes/bill_payments'));
app.use('/api/recurring', require('./routes/recurring'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/history', require('./routes/history'));

// Live Sidebar Badges API — counts across all modules in a single instant query
app.get('/api/badges', async (req, res) => {
    try {
        const { query } = require('./database/db');
        const userId = req.user?.UserID || 1;
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
        res.json({ success: true, data: result.recordset[0] || {} });
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

// SPA fallback - sab routes frontend ko bhejo (Strictly No-Cache)
app.get('/{*splat}', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
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

// Background SQL Server connection manager with auto-retry
async function connectDbInBackground() {
    const maxRetries = 30;
    let attempts = 0;
    let connected = false;

    console.log('🔄 SQL Server se connection ka intezaar...');
    while (attempts < maxRetries && !connected) {
        attempts++;
        try {
            connected = await isDbAlive();
            if (connected) {
                console.log(`✅ SQL Server se successfully connect ho gaya (Attempt: ${attempts})!`);
                // Self-Healing Dynamic Schema Bootstrapper: Ensures all tables, columns, dynamic fields exist automatically
                try {
                    const { ensureAutoSchemaBootstrapped } = require('./database/autoSchemaBootstrapper');
                    await ensureAutoSchemaBootstrapped();
                } catch (sErr) {
                    console.error('⚠️ Schema bootstrap warning:', sErr.message);
                }
                // Recurring Transactions: startup par process karo (missed entries catch-up)
                runRecurring();
                // Har 1 ghante baad dobara check (server lambe time chalne par bhi due entries generate hoti rahein)
                setInterval(runRecurring, 60 * 60 * 1000);
                break;
            }
        } catch (e) {
            console.log(`⏳ SQL Server abhi ready nahi hai (${e.message}). Attempt: ${attempts}/${maxRetries}`);
        }

        if (!connected && attempts < maxRetries) {
            console.log('⏳ SQL Server start hone ka wait kar rahe hain (3 seconds mein dobara check hoga)...');
            await new Promise(res => setTimeout(res, 3000));
        }
    }

    if (!connected) {
        console.error('⚠️ SQL Server se connect nahi ho paya. Periodic checks background mein jari rahenge.');
        const retryTimer = setInterval(async () => {
            try {
                if (await isDbAlive()) {
                    console.log('✅ SQL Server ab ready ho gaya hai!');
                    clearInterval(retryTimer);
                    try {
                        const { ensureAutoSchemaBootstrapped } = require('./database/autoSchemaBootstrapper');
                        await ensureAutoSchemaBootstrapped();
                    } catch (sErr) {
                        console.error('⚠️ Schema bootstrap warning:', sErr.message);
                    }
                    runRecurring();
                    setInterval(runRecurring, 60 * 60 * 1000);
                }
            } catch (err) { }
        }, 10000);
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
            console.log('║   🔄 Database: Connecting to SQL Server in background...       ║');
            console.log('║   📶 Network: LOCAL + SAME WI-FI / LAN ALLOWED                 ║');
            console.log('╚════════════════════════════════════════════════════════════════╝');
            console.log('');

            // Background mein SQL Server se connect karein bina port 3000 block kiye
            connectDbInBackground();

            // Windows self-heal: PC boot par silent auto-start (task + startup entry)
            // aur Desktop/Start Menu shortcut ensure karo. Purane installs par bhi
            // update ke baad ye khud lag jata hai - user ko kuch karna nahi padta.
            setTimeout(() => {
                try { require('./utils/windows_autostart').ensureWindowsAutostart(); } catch (e) { }
            }, 10000);

            // Automatic Silent Update from GitHub:
            // boot ke 5s baad ek check + har raat 2:30 AM (idle hone par hi restart).
            // Din me restart nahi hoga, isliye kisi transaction ke beech update ka risk nahi.
            setTimeout(() => {
                autoUpdater.runSilentAutoUpdate({
                    restartOnUpdate: true,
                    requireIdle: true,
                    isIdle: () => activeRequests === 0
                }).catch(() => { });
            }, 5000);

            scheduleNightlyUpdate();
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
                isIdle: () => activeRequests === 0
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

// Graceful shutdown: in-flight requests + SQL pool ko safely band karo.
let shuttingDown = false;
function gracefulShutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n🛑 ${signal} received — graceful shutdown shuru...`);

    for (const client of sseClients) {
        try { client.end(); } catch (_) { }
    }
    sseClients.clear();

    const finish = async () => {
        try {
            const db = require('./database/db');
            if (db.closePool) await db.closePool();
        } catch (_) { }
        process.exit(0);
    };

    if (httpServer) {
        httpServer.close(() => finish());
        setTimeout(() => finish(), 8000).unref();
    } else {
        finish();
    }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

startServer();

