/**
 * utils/autoUpdater.js
 * ============================================================================
 * Automatic Silent Update Engine for CSC-BC-apna-hisaab
 * Repo: https://github.com/sanjaynag28-jpg/CSC-BC-apna-hisaab (Public)
 *
 * Guarantees:
 * - Zero Data Loss: NEVER touches .env, database/data/, public/uploads/,
 *   backups/, logs/, or SQL Server user records.
 * - Auto-Backup First: Runs database/backup-runner.js before applying code.
 * - Dual-Mode: Works with Git (git fetch + reset) OR without Git (GitHub ZIP).
 * - Offline Safe: 5-second timeout; if internet is down, skips silently.
 * - Developer Safe: Skips automatically if AUTO_UPDATE_DISABLED=true in .env
 *   or if local uncommitted Git changes exist (unless --force is passed).
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const os = require('os');
const { execFileSync, spawn } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const VERSION_FILE = path.join(ROOT_DIR, 'version.json');
const PKG_FILE = path.join(ROOT_DIR, 'package.json');
const LOG_DIR = path.join(ROOT_DIR, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'auto-update.log');
const TMP_DIR = path.join(os.tmpdir(), 'cmbc-auto-update-tmp');
const LOCK_FILE = path.join(LOG_DIR, '.auto_update.lock');
const UPDATING_FLAG_FILE = path.join(LOG_DIR, '.updating');

const REPO_OWNER = 'sanjaynag28-jpg';
const REPO_NAME = 'CSC-BC-apna-hisaab';
let BRANCH = 'sqlite';
let branchFromManifest = false;
try {
    const vJson = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8').replace(/^\uFEFF/, ''));
    if (vJson.branch) {
        BRANCH = vJson.branch;
        branchFromManifest = true;
    }
} catch (_) { }

// version.json hi edition ka source of truth hai. Git checkout galti se main par
// ho lekin build SQLite ka hai, to bhi updater ko sqlite branch hi use karni chahiye.
if (!branchFromManifest) {
    try {
        const gitBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT_DIR, encoding: 'utf8', timeout: 3000 }).trim();
        if (gitBranch && gitBranch !== 'HEAD' && (gitBranch === 'sqlite' || gitBranch === 'main')) {
            BRANCH = gitBranch;
        }
    } catch (_) { }
}
// Sirf is installation ka apna branch use karo. "main" fallback kabhi mat lagao —
// agar SQLite edition galti se SQL Server edition ka code utha le to app poori tarah
// break ho sakti hai. Same branch ke liye 3 independent mirrors kaafi hain.
function getRemoteVersionUrls() {
    const urls = [
        `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/version.json`,
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/version.json?ref=${BRANCH}`,
        `https://cdn.jsdelivr.net/gh/${REPO_OWNER}/${REPO_NAME}@${BRANCH}/version.json`,
        `https://fastly.jsdelivr.net/gh/${REPO_OWNER}/${REPO_NAME}@${BRANCH}/version.json`
    ];
    return [...new Set(urls)];
}

function getRemoteZipUrls() {
    const urls = [
        `https://github.com/${REPO_OWNER}/${REPO_NAME}/archive/refs/heads/${BRANCH}.zip`,
        `https://codeload.github.com/${REPO_OWNER}/${REPO_NAME}/zip/refs/heads/${BRANCH}`,
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/zipball/${BRANCH}`
    ];
    return [...new Set(urls)];
}
const REMOTE_VERSION_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/version.json`;
const REMOTE_ZIP_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/archive/refs/heads/${BRANCH}.zip`;

// Paths that MUST NEVER be overwritten or deleted during ZIP-mode updates
const PROTECTED_RELATIVE_PATHS = new Set([
    '.env',
    '.git',
    'node_modules',
    '.runtime',
    'backups',
    'logs',
    'bin',
    '.auto-update-tmp',
    '.previous-release',
    '.antigravity',
    'database/data',
    'database/backups',
    'public/uploads',
    '.admin-login.txt',
    '.sql-server-credentials.txt',
    'version.json.bak',
    // Admin-managed license cache (universal keys + hardware blacklist).
    // Release ZIP me iski purani copy hoti hai, isliye local file ko overwrite mat karo.
    'config/licenses.json'
]);

// These tracked files are expected to differ locally and must survive an update.
const LOCAL_DATA_FILES = new Set(['version.json', 'config/licenses.json', 'extension/manifest.json']);

const state = {
    checking: false,
    updating: false,
    stage: 'idle', // 'idle' | 'manifest' | 'safety' | 'download' | 'database' | 'restarting' | 'completed' | 'error'
    progressPercent: 0,
    progressMessage: 'System idle',
    recentLogs: [],
    onProgress: null,
    lastCheckedAt: null,
    lastResult: 'idle',
    currentVersion: null,
    latestVersion: null,
    releaseNotes: null,
    lastError: null,
    failedVersion: null,
    failedAt: 0,
    periodicTimer: null,
    periodicIntervalMs: null
};

function setProgress(stage, percent, message) {
    state.stage = stage;
    state.progressPercent = Math.min(100, Math.max(0, percent));
    state.progressMessage = message;
    const timeStr = new Date().toLocaleTimeString();
    if (!state.recentLogs) state.recentLogs = [];
    state.recentLogs.push({ time: timeStr, msg: message, stage, percent });
    if (state.recentLogs.length > 60) state.recentLogs.shift();
    logUpdate(`[${percent}%] [${stage}] ${message}`);

    if (typeof state.onProgress === 'function') {
        try {
            state.onProgress({
                type: 'UPDATE_PROGRESS',
                stage,
                percent,
                message,
                time: timeStr,
                currentVersion: state.currentVersion,
                latestVersion: state.latestVersion
            });
        } catch (_) { }
    }
}

function loadDotEnvIfNeeded() {
    try {
        const envPath = path.join(ROOT_DIR, '.env');
        if (!fs.existsSync(envPath)) return;
        let rawEnv = fs.readFileSync(envPath, 'utf8');
        if (rawEnv.charCodeAt(0) === 0xFEFF) rawEnv = rawEnv.slice(1);
        const lines = rawEnv.split(/\r?\n/);
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eq = trimmed.indexOf('=');
            if (eq === -1) continue;
            const k = trimmed.slice(0, eq).trim();
            let v = trimmed.slice(eq + 1).trim();
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
                v = v.slice(1, -1);
            }
            if (process.env[k] === undefined) process.env[k] = v;
        }
    } catch (_) { }
}
loadDotEnvIfNeeded();

function logUpdate(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    try {
        if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
        fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
    } catch (_) { }
    if (!process.argv.includes('--quiet')) {
        console.log(`🔄 [Auto-Update] ${msg}`);
    }
}

function getLocalVersionInfo() {
    try {
        if (fs.existsSync(VERSION_FILE)) {
            return JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8').replace(/^\uFEFF/, ''));
        }
    } catch (_) { }
    try {
        const pkg = JSON.parse(fs.readFileSync(PKG_FILE, 'utf8').replace(/^\uFEFF/, ''));
        return { version: pkg.version || '1.0.0', notes: '' };
    } catch (_) {
        return { version: '1.0.0', notes: '' };
    }
}

function compareVersions(a, b) {
    const pa = String(a || '0.0.0').replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
    const pb = String(b || '0.0.0').replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
    const len = Math.max(pa.length, pb.length, 3);
    for (let i = 0; i < len; i++) {
        const na = pa[i] || 0;
        const nb = pb[i] || 0;
        if (na > nb) return 1;
        if (na < nb) return -1;
    }
    return 0;
}

// Update available only when the remote version is strictly newer.
// Equal ya older version par update offer nahi karna chahiye, warna app
// har 20 minute me same release download karke restart hoti rehti hai.
function isUpdateAvailable(current, latest) {
    return compareVersions(latest, current) > 0;
}

// version.json me "branch" field hota hai. Agar remote manifest kisi doosre
// branch ka hai (jaise SQL Server edition ka main), use reject karo.
function isRemoteInfoForBranch(info, branch = BRANCH) {
    if (!info || typeof info !== 'object' || !info.version) return false;
    if (!info.branch) return true; // purane manifests me branch field nahi tha
    return String(info.branch).trim().toLowerCase() === String(branch).trim().toLowerCase();
}

function readVersionInfoFromDir(dir) {
    try {
        return JSON.parse(fs.readFileSync(path.join(dir, 'version.json'), 'utf8').replace(/^\uFEFF/, ''));
    } catch (_) {
        return null;
    }
}

// Validate the downloaded archive BEFORE it overwrites the live installation.
function validateArchiveVersion(archiveDir, expectedVersion) {
    const info = readVersionInfoFromDir(archiveDir);
    if (!info || !info.version) {
        return { ok: false, reason: 'Downloaded archive me valid version.json nahi hai' };
    }
    if (!isRemoteInfoForBranch(info)) {
        return { ok: false, reason: `Archive branch '${info.branch || 'unknown'}' hai, expected '${BRANCH}'` };
    }
    if (expectedVersion && compareVersions(info.version, expectedVersion) < 0) {
        return { ok: false, reason: `Archive stale hai (v${info.version} < expected v${expectedVersion})` };
    }
    return { ok: true, version: info.version };
}

function fileHash(filePath) {
    try {
        if (!fs.existsSync(filePath)) return '';
        return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
    } catch (_) {
        return '';
    }
}

function findGitBinary() {
    const candidates = [
        'git',
        'C:\\Program Files\\Git\\bin\\git.exe',
        'C:\\Program Files\\Git\\cmd\\git.exe',
        'C:\\Program Files (x86)\\Git\\bin\\git.exe'
    ];
    for (const bin of candidates) {
        try {
            if (bin !== 'git' && !fs.existsSync(bin)) continue;
            execFileSync(bin, ['--version'], { stdio: 'ignore', timeout: 3000 });
            return bin;
        } catch (_) { }
    }
    return null;
}

function isHtmlPayload(buf) {
    const head = Buffer.isBuffer(buf) ? buf.toString('utf8', 0, Math.min(buf.length, 256)) : String(buf || '').slice(0, 256);
    return /^\s*(?:<!DOCTYPE|<html)/i.test(head);
}

function curlFetchFallback(url, destPath = null, timeoutMs = 15000) {
    if (process.platform !== 'win32') throw new Error('curl fallback only on win32');
    const sec = Math.max(5, Math.ceil(timeoutMs / 1000));
    const commonArgs = ['-fSL', '--retry', '2', '--connect-timeout', String(sec), '--max-time', String(sec * 2)];
    const attempts = [
        [...commonArgs, '--doh-url', 'https://cloudflare-dns.com/dns-query', url],
        [...commonArgs, url]
    ];
    for (const args of attempts) {
        try {
            if (destPath) {
                execFileSync('curl.exe', [...args, '-o', destPath], { stdio: 'ignore', timeout: timeoutMs * 2 + 5000, windowsHide: true });
                return destPath;
            }
            return execFileSync('curl.exe', args, { encoding: 'utf8', timeout: timeoutMs + 3000, windowsHide: true });
        } catch (_) { }
    }
    throw new Error('curl DoH/fallback fetch failed');
}

function fetchJson(url, timeoutMs = 5000, redirects = 0) {
    if (redirects > 5) return Promise.reject(new Error('Too many redirects'));
    return new Promise((resolve, reject) => {
        const headers = {
            'User-Agent': 'CSC-BC-Apna-Hisaab-Updater/1.0',
            'Cache-Control': 'no-cache'
        };
        if (url.includes('api.github.com/repos/')) {
            headers.Accept = 'application/vnd.github.raw+json';
        }
        const req = https.get(url, { headers }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                let nextUrl;
                try { nextUrl = new URL(res.headers.location, url).toString(); } catch (e) { return reject(e); }
                return fetchJson(nextUrl, timeoutMs, redirects + 1).then(resolve, reject);
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            let raw = '';
            res.setEncoding('utf8');
            res.on('error', reject);
            res.on('data', chunk => { raw += chunk; });
            res.on('end', () => {
                if (isHtmlPayload(raw)) return reject(new Error('Captive portal HTML returned'));
                try {
                    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
                    if (parsed && parsed.encoding === 'base64' && typeof parsed.content === 'string') {
                        const decoded = Buffer.from(parsed.content.replace(/\s+/g, ''), 'base64').toString('utf8');
                        return resolve(JSON.parse(decoded.replace(/^\uFEFF/, '')));
                    }
                    resolve(parsed);
                } catch (err) {
                    reject(new Error('Invalid JSON in remote version.json'));
                }
            });
        });
        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error('Network timeout'));
        });
        req.on('error', (err) => {
            if (redirects === 0 && process.platform === 'win32') {
                try {
                    const out = curlFetchFallback(url, null, timeoutMs);
                    if (isHtmlPayload(out)) return reject(err);
                    return resolve(JSON.parse(out.replace(/^\uFEFF/, '')));
                } catch (_) { }
            }
            reject(err);
        });
    });
}

function verifyZipFile(filePath) {
    try {
        const st = fs.statSync(filePath);
        if (st.size < 10000) return false;
        const fd = fs.openSync(filePath, 'r');
        const sig = Buffer.alloc(4);
        fs.readSync(fd, sig, 0, 4, 0);
        fs.closeSync(fd);
        return sig[0] === 0x50 && sig[1] === 0x4B; // 'PK'
    } catch (_) {
        return false;
    }
}

function downloadFile(url, destPath, timeoutMs = 60000, redirects = 0) {
    return new Promise((resolve, reject) => {
        if (redirects > 5) return reject(new Error('Too many redirects'));
        let ws = null;
        let settled = false;
        const fail = (err) => {
            if (settled) return;
            settled = true;
            if (ws) {
                try { ws.destroy(); } catch (_) { }
            }
            try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch (_) { }
            if (redirects === 0 && process.platform === 'win32') {
                try {
                    curlFetchFallback(url, destPath, timeoutMs);
                    if (verifyZipFile(destPath)) return resolve(destPath);
                    try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch (_) { }
                } catch (_) { }
            }
            reject(err);
        };
        const req = https.get(url, {
            headers: { 'User-Agent': 'CSC-BC-Apna-Hisaab-Updater/1.0' }
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                let nextUrl;
                try { nextUrl = new URL(res.headers.location, url).toString(); } catch (e) { return fail(e); }
                settled = true;
                return downloadFile(nextUrl, destPath, timeoutMs, redirects + 1).then(resolve, reject);
            }
            if (res.statusCode !== 200) {
                res.resume();
                return fail(new Error(`Download failed with HTTP ${res.statusCode}`));
            }
            ws = fs.createWriteStream(destPath);
            res.on('error', fail);
            ws.on('error', fail);
            res.pipe(ws);
            ws.on('finish', () => {
                ws.close(() => {
                    if (settled) return;
                    if (!verifyZipFile(destPath)) {
                        return fail(new Error('Downloaded file is not a valid ZIP archive'));
                    }
                    settled = true;
                    resolve(destPath);
                });
            });
        });
        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error('Download timeout'));
        });
        req.on('error', fail);
    });
}

function downloadFileWithRetry(url, destPath, attempts = 4, timeoutMs = 60000) {
    return (async () => {
        let lastErr = null;
        for (let i = 1; i <= attempts; i++) {
            try {
                return await downloadFile(url, destPath, timeoutMs);
            } catch (err) {
                lastErr = err;
                logUpdate(`Download attempt ${i}/${attempts} failed: ${err.message}`);
                try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch (_) { }
                if (i < attempts) await new Promise(r => setTimeout(r, Math.min(20000, 3000 * i)));
            }
        }
        throw lastErr || new Error('Download failed');
    })();
}

// Critical code files: agar update ke baad koi missing/corrupt mile to fresh copy force karo
const CRITICAL_FILES = {
    'server.js': 2000,
    'package.json': 200,
    'package-lock.json': 1000,
    'setup-database.js': 200,
    'database/setup_sqlite.js': 5000,
    'database/sqlite_schema.sql': 5000,
    'database/db.js': 3000,
    'public/index.html': 50000,
    'public/app.js': 50000,
    'routes/auth.js': 500,
    'middleware/auth.js': 500,
    'utils/autoUpdater.js': 1000
};

function findBrokenFiles(baseDir = ROOT_DIR) {
    const broken = [];
    for (const rel of Object.keys(CRITICAL_FILES)) {
        const abs = path.join(baseDir, rel);
        try {
            const st = fs.statSync(abs);
            if (!st.isFile() || st.size < CRITICAL_FILES[rel]) broken.push(rel);
        } catch (_) {
            broken.push(rel);
        }
    }
    return broken;
}

function isProtectedPath(relPath) {
    const normalized = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalized) return false;
    const lower = normalized.toLowerCase();
    for (const p of PROTECTED_RELATIVE_PATHS) {
        const pLower = p.toLowerCase();
        if (lower === pLower || lower.startsWith(pLower + '/')) return true;
    }
    if (/^\.env(\.|$)/i.test(normalized) && lower !== '.env.example') return true;
    if (/\.(mdf|ldf|ndf|bak|db|db-wal|db-shm|db-journal|sqlite|sqlite3|sqlite-wal|sqlite-shm|sqlite-journal)$/i.test(normalized)) return true;
    if (lower === '.admin-login.txt' || lower === '.sql-server-credentials.txt') return true;
    return false;
}

function isLockPidAlive(pid) {
    if (!pid || typeof pid !== 'number' || pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        return e && e.code === 'EPERM';
    }
}

function acquireUpdateLock() {
    try {
        if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, startedAt: Date.now() }), { flag: 'wx' });
                try { fs.writeFileSync(UPDATING_FLAG_FILE, String(process.pid), 'utf8'); } catch (_) { }
                return true;
            } catch (err) {
                if (err.code !== 'EEXIST') return false;
                let stale = false;
                try {
                    const existing = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
                    const ageMs = Date.now() - Number(existing.startedAt || 0);
                    if (ageMs > 15 * 60 * 1000 || !isLockPidAlive(Number(existing.pid))) {
                        stale = true;
                    }
                } catch (_) {
                    stale = true;
                }
                if (stale) {
                    try { fs.unlinkSync(LOCK_FILE); } catch (_) { }
                    try { fs.unlinkSync(UPDATING_FLAG_FILE); } catch (_) { }
                    continue;
                }
                return false;
            }
        }
    } catch (_) { }
    return false;
}

function releaseUpdateLock() {
    try { if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE); } catch (_) { }
    try { if (fs.existsSync(UPDATING_FLAG_FILE)) fs.unlinkSync(UPDATING_FLAG_FILE); } catch (_) { }
}

function copyFileAtomic(srcPath, dstPath) {
    const dir = path.dirname(dstPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmpDst = `${dstPath}.updating-tmp`;
    fs.copyFileSync(srcPath, tmpDst);
    try {
        fs.renameSync(tmpDst, dstPath);
    } catch (renameErr) {
        try {
            fs.copyFileSync(tmpDst, dstPath);
            try { fs.unlinkSync(tmpDst); } catch (_) { }
        } catch (fallbackErr) {
            try { fs.unlinkSync(tmpDst); } catch (_) { }
            throw fallbackErr;
        }
    }
}

function collectFilesRecursively(baseDir, relBase = '', out = []) {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
        const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
        if (isProtectedPath(rel)) continue;
        const abs = path.join(baseDir, entry.name);
        if (entry.isDirectory()) {
            collectFilesRecursively(abs, rel, out);
        } else if (entry.isFile()) {
            out.push({ rel, abs });
        }
    }
    return out;
}

function copyDirectorySafely(srcDir, dstDir, relBase = '') {
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    for (const entry of entries) {
        const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
        if (isProtectedPath(rel)) continue;
        const srcPath = path.join(srcDir, entry.name);
        const dstPath = path.join(dstDir, entry.name);
        if (entry.isDirectory()) {
            if (!fs.existsSync(dstPath)) fs.mkdirSync(dstPath, { recursive: true });
            copyDirectorySafely(srcPath, dstPath, rel);
        } else if (entry.isFile()) {
            copyFileAtomic(srcPath, dstPath);
        }
    }
}

function syncGoldenAppBackup() {
    try {
        const appJsPath = path.join(ROOT_DIR, 'public', 'app.js');
        const goldenPath = path.join(ROOT_DIR, 'backups', 'app.js.golden.bak');
        if (fs.existsSync(appJsPath) && fs.statSync(appJsPath).size > 100000) {
            fs.mkdirSync(path.dirname(goldenPath), { recursive: true });
            copyFileAtomic(appJsPath, goldenPath);
        }
    } catch (_) { }
}

function stageAndApplyDirectory(srcDir, dstDir) {
    const rollbackRoot = path.join(dstDir, '.previous-release');
    try { if (fs.existsSync(rollbackRoot)) fs.rmSync(rollbackRoot, { recursive: true, force: true }); } catch (_) { }
    fs.mkdirSync(rollbackRoot, { recursive: true });

    const files = collectFilesRecursively(srcDir);
    const backedUp = [];
    const newlyCreated = [];

    try {
        for (const item of files) {
            const dstPath = path.join(dstDir, item.rel);
            const snapPath = path.join(rollbackRoot, item.rel);
            if (fs.existsSync(dstPath)) {
                fs.mkdirSync(path.dirname(snapPath), { recursive: true });
                fs.copyFileSync(dstPath, snapPath);
                backedUp.push(item.rel);
            } else {
                newlyCreated.push(item.rel);
            }
            copyFileAtomic(item.abs, dstPath);
        }
    } catch (applyErr) {
        try {
            for (const rel of backedUp) {
                const snapPath = path.join(rollbackRoot, rel);
                const dstPath = path.join(dstDir, rel);
                if (fs.existsSync(snapPath)) copyFileAtomic(snapPath, dstPath);
            }
            for (const rel of newlyCreated) {
                const dstPath = path.join(dstDir, rel);
                if (fs.existsSync(dstPath)) try { fs.unlinkSync(dstPath); } catch (_) { }
            }
        } catch (_) { }
        throw applyErr;
    }

    return {
        rollback() {
            for (const rel of backedUp) {
                try {
                    const snapPath = path.join(rollbackRoot, rel);
                    const dstPath = path.join(dstDir, rel);
                    if (fs.existsSync(snapPath)) copyFileAtomic(snapPath, dstPath);
                } catch (_) { }
            }
            for (const rel of newlyCreated) {
                try {
                    const dstPath = path.join(dstDir, rel);
                    if (fs.existsSync(dstPath)) fs.unlinkSync(dstPath);
                } catch (_) { }
            }
            try { if (fs.existsSync(rollbackRoot)) fs.rmSync(rollbackRoot, { recursive: true, force: true }); } catch (_) { }
        },
        commit() {
            syncGoldenAppBackup();
            try { if (fs.existsSync(rollbackRoot)) fs.rmSync(rollbackRoot, { recursive: true, force: true }); } catch (_) { }
        }
    };
}

async function runSafeBackupBeforeUpdate() {
    const dbPath = path.join(ROOT_DIR, 'database', 'data', 'cash_management.db');
    if (fs.existsSync(dbPath)) {
        try {
            logUpdate('Running pre-update online SQLite safety backup...');
            const backupDir = path.join(ROOT_DIR, 'backups');
            if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
            const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const dest = path.join(backupDir, `pre_update_${stamp}.db`);
            let backedUp = false;
            try {
                const Database = require('better-sqlite3');
                const db = new Database(dbPath, { readonly: true, timeout: 7000 });
                try {
                    await db.backup(dest);
                    backedUp = true;
                } finally {
                    try { db.close(); } catch (_) { }
                }
            } catch (_) {
                backedUp = false;
            }
            if (!backedUp) {
                fs.copyFileSync(dbPath, dest);
                for (const ext of ['-wal', '-shm']) {
                    if (fs.existsSync(dbPath + ext)) {
                        try { fs.copyFileSync(dbPath + ext, dest + ext); } catch (_) { }
                    }
                }
            }
            // Keep latest 15 pre-update backups
            try {
                const oldBackups = fs.readdirSync(backupDir)
                    .filter(f => /^pre_update_.*\.db$/i.test(f))
                    .map(f => ({ name: f, mtime: fs.statSync(path.join(backupDir, f)).mtimeMs }))
                    .sort((a, b) => b.mtime - a.mtime);
                for (const old of oldBackups.slice(15)) {
                    try { fs.unlinkSync(path.join(backupDir, old.name)); } catch (_) { }
                }
            } catch (_) { }
            logUpdate(`Pre-update SQLite backup completed: ${path.basename(dest)}`);
            return;
        } catch (err) {
            logUpdate(`Pre-update SQLite backup warning (non-fatal): ${err.message}`);
            return;
        }
    }

    const backupScript = path.join(ROOT_DIR, 'database', 'backup-runner.js');
    if (!fs.existsSync(backupScript)) return;
    try {
        logUpdate('Running pre-update safety database backup...');
        execFileSync(process.execPath, [backupScript], {
            cwd: ROOT_DIR,
            stdio: 'ignore',
            timeout: 45000
        });
        logUpdate('Pre-update database backup completed.');
    } catch (err) {
        logUpdate(`Pre-update backup skipped/warning (non-fatal): ${err.message}`);
    }
}

async function applyCodeUpdateViaGit(gitBin, force = false) {
    const safeDirArg = ['-c', `safe.directory=${ROOT_DIR.replace(/\\/g, '/')}`];
    const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' };

    // Remove stale .git/index.lock (> 3 min old)
    const gitLockPath = path.join(ROOT_DIR, '.git', 'index.lock');
    try {
        if (fs.existsSync(gitLockPath)) {
            const st = fs.statSync(gitLockPath);
            if ((Date.now() - st.mtimeMs) > 3 * 60 * 1000) {
                fs.unlinkSync(gitLockPath);
                logUpdate('Removed stale .git/index.lock before fetch.');
            }
        }
    } catch (_) { }

    logUpdate(`Fetching latest release from GitHub via Git (${BRANCH})...`);
    execFileSync(gitBin, [...safeDirArg, 'fetch', 'origin', BRANCH, '--quiet'], {
        cwd: ROOT_DIR,
        stdio: 'ignore',
        timeout: 30000,
        env: gitEnv
    });

    if (!force) {
        const ahead = parseInt(execFileSync(gitBin, [...safeDirArg, 'rev-list', '--count', `origin/${BRANCH}..HEAD`], {
            cwd: ROOT_DIR,
            encoding: 'utf8',
            timeout: 10000,
            env: gitEnv
        }).trim(), 10) || 0;
        if (ahead > 0) {
            throw new Error('LOCAL_COMMITS_PRESENT');
        }

        const statusOut = execFileSync(gitBin, [...safeDirArg, 'status', '--porcelain'], {
            cwd: ROOT_DIR,
            encoding: 'utf8',
            timeout: 10000,
            env: gitEnv
        });
        const changedPaths = statusOut
            .split(/\r?\n/)
            .filter(line => line.length >= 4)
            .map(line => {
                const raw = line.slice(3).trim();
                const renamed = raw.includes(' -> ') ? raw.split(' -> ').pop() : raw;
                return renamed.replace(/^["']|["']$/g, '').replace(/\\/g, '/');
            })
            .filter(Boolean);
        const unexpectedChanges = changedPaths.filter(file => !LOCAL_DATA_FILES.has(file));
        if (unexpectedChanges.length > 0) {
            let diffVsRemote = '';
            try {
                diffVsRemote = execFileSync(gitBin, [...safeDirArg, 'diff', '--name-only', `origin/${BRANCH}`, '--'], {
                    cwd: ROOT_DIR,
                    encoding: 'utf8',
                    timeout: 10000,
                    env: gitEnv
                }).trim();
            } catch (_) {
                diffVsRemote = 'unknown';
            }
            const realDifferences = diffVsRemote
                .split(/\r?\n/)
                .map(f => f.trim().replace(/\\/g, '/'))
                .filter(file => file && !LOCAL_DATA_FILES.has(file));
            if (realDifferences.length > 0) {
                throw new Error('LOCAL_CHANGES_PRESENT');
            }
            logUpdate('Working tree pehle se remote release se match karta hai; Git state sync ho raha hai.');
        }
        if (changedPaths.length > 0 && unexpectedChanges.length === 0) {
            logUpdate('Ignoring generated local version.json / license config changes during update.');
        }
    }

    const licensePath = path.join(ROOT_DIR, 'config', 'licenses.json');
    const licenseDiskBackup = path.join(os.tmpdir(), `cmbc-licenses-backup-${process.pid}.json`);
    let hasLicenseBackup = false;
    try {
        if (fs.existsSync(licensePath)) {
            fs.copyFileSync(licensePath, licenseDiskBackup);
            hasLicenseBackup = true;
        }
    } catch (_) { }

    let prevHead = null;
    try {
        prevHead = execFileSync(gitBin, [...safeDirArg, 'rev-parse', 'HEAD'], {
            cwd: ROOT_DIR,
            encoding: 'utf8',
            timeout: 5000,
            env: gitEnv
        }).trim();
    } catch (_) { }

    try {
        execFileSync(gitBin, [...safeDirArg, 'reset', '--hard', `origin/${BRANCH}`], {
            cwd: ROOT_DIR,
            stdio: 'ignore',
            timeout: 30000,
            env: gitEnv
        });
        syncGoldenAppBackup();
    } catch (resetErr) {
        if (prevHead) {
            try {
                execFileSync(gitBin, [...safeDirArg, 'reset', '--hard', prevHead], {
                    cwd: ROOT_DIR,
                    stdio: 'ignore',
                    timeout: 20000,
                    env: gitEnv
                });
            } catch (_) { }
        }
        throw resetErr;
    } finally {
        if (hasLicenseBackup) {
            try {
                fs.mkdirSync(path.dirname(licensePath), { recursive: true });
                copyFileAtomic(licenseDiskBackup, licensePath);
                fs.unlinkSync(licenseDiskBackup);
                logUpdate('Local license config preserved across Git update.');
            } catch (err) {
                logUpdate(`License config restore warning: ${err.message}`);
            }
        }
    }
}

async function applyCodeUpdateViaZip(expectedVersion) {
    let lastErr = null;

    for (let round = 1; round <= 3; round++) {
        logUpdate(`Downloading latest release ZIP from GitHub... (attempt ${round}/3)`);
        if (fs.existsSync(TMP_DIR)) fs.rmSync(TMP_DIR, { recursive: true, force: true });
        fs.mkdirSync(TMP_DIR, { recursive: true });

        const zipPath = path.join(TMP_DIR, 'release.zip');
        const extractDir = path.join(TMP_DIR, 'extracted');

        try {
            const zipUrls = getRemoteZipUrls();
            let gotZip = false;
            for (const zUrl of zipUrls) {
                try {
                    await downloadFileWithRetry(zUrl, zipPath, 2, 60000);
                    gotZip = true;
                    break;
                } catch (zErr) {
                    logUpdate(`ZIP mirror (${zUrl}) download failed: ${zErr.message}`);
                }
            }
            if (!gotZip) throw new Error('All ZIP mirrors failed to download');

            let extracted = false;
            for (let i = 1; i <= 2 && !extracted; i++) {
                try {
                    if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
                    fs.mkdirSync(extractDir, { recursive: true });
                    execFileSync('powershell', [
                        '-NoProfile',
                        '-ExecutionPolicy', 'Bypass',
                        '-Command',
                        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force; try { Get-ChildItem -LiteralPath '${extractDir.replace(/'/g, "''")}' -Recurse -File | Unblock-File -ErrorAction SilentlyContinue } catch {}`
                    ], { stdio: 'ignore', timeout: 120000 });
                    extracted = true;
                } catch (extractErr) {
                    logUpdate(`ZIP extract attempt ${i}/2 failed: ${extractErr.message}`);
                    if (i === 2) throw extractErr;
                }
            }

            const topEntries = fs.readdirSync(extractDir, { withFileTypes: true }).filter(e => e.isDirectory());
            if (topEntries.length === 0) throw new Error('Extracted ZIP archive was empty');
            const extractedRoot = path.join(extractDir, topEntries[0].name);

            const archiveCheck = validateArchiveVersion(extractedRoot, expectedVersion);
            if (!archiveCheck.ok) {
                throw new Error(archiveCheck.reason);
            }
            const brokenArchive = findBrokenFiles(extractedRoot);
            if (brokenArchive.length > 0) {
                throw new Error(`Downloaded archive incomplete: ${brokenArchive.join(', ')}`);
            }
            logUpdate(`Archive verified as v${archiveCheck.version}; applying files atomically...`);

            const tx = stageAndApplyDirectory(extractedRoot, ROOT_DIR);

            const broken = findBrokenFiles();
            if (broken.length > 0) {
                tx.rollback();
                throw new Error(`Update incomplete - missing/corrupt: ${broken.join(', ')}`);
            }

            logUpdate('ZIP code files staged & applied cleanly (user data & .env preserved).');
            return tx;
        } catch (err) {
            lastErr = err;
            logUpdate(`ZIP update attempt ${round}/3 failed: ${err.message}`);
            if (round < 3) {
                await new Promise(r => setTimeout(r, Math.min(15000, 4000 * round)));
            }
        } finally {
            try {
                if (fs.existsSync(TMP_DIR)) fs.rmSync(TMP_DIR, { recursive: true, force: true });
            } catch (_) { }
        }
    }

    throw lastErr || new Error('ZIP update failed');
}

async function checkForUpdate() {
    const localInfo = getLocalVersionInfo();
    state.currentVersion = localInfo.version;
    state.checking = true;
    state.lastError = null;

    try {
        const vUrls = getRemoteVersionUrls();
        let remoteInfo = null;
        let lastNetErr = null;
        for (const url of vUrls) {
            try {
                const sep = url.includes('?') ? '&' : '?';
                const candidate = await fetchJson(`${url}${sep}t=${Date.now()}`, 8000);
                if (candidate && candidate.version && isRemoteInfoForBranch(candidate)) {
                    if (!remoteInfo || compareVersions(candidate.version, remoteInfo.version) > 0) {
                        remoteInfo = candidate;
                    }
                    // If primary raw.githubusercontent.com or api.github.com already returned an update, no need to wait on CDN mirrors
                    if (isUpdateAvailable(localInfo.version, remoteInfo.version)) break;
                } else {
                    lastNetErr = new Error(`Manifest branch mismatch (${candidate && candidate.branch ? candidate.branch : 'unknown'})`);
                }
            } catch (netErr) {
                lastNetErr = netErr;
            }
        }
        if (!remoteInfo) {
            throw lastNetErr || new Error('Version mirrors unreachable');
        }
        state.lastCheckedAt = new Date().toISOString();
        state.latestVersion = remoteInfo.version || localInfo.version;
        state.releaseNotes = remoteInfo.notes || '';
        const hasUpdate = isUpdateAvailable(state.currentVersion, state.latestVersion);
        const critical = String(remoteInfo.critical || '').toLowerCase() === 'true';
        state.lastResult = hasUpdate ? (critical ? 'critical-update-available' : 'update-available') : 'up-to-date';
        return {
            success: true,
            hasUpdate,
            critical,
            currentVersion: state.currentVersion,
            latestVersion: state.latestVersion,
            notes: state.releaseNotes,
            releasedAt: remoteInfo.releasedAt || null
        };
    } catch (err) {
        state.lastCheckedAt = new Date().toISOString();
        state.lastError = err.message;
        state.lastResult = 'offline-or-error';
        return {
            success: false,
            hasUpdate: false,
            currentVersion: state.currentVersion,
            error: err.message
        };
    } finally {
        state.checking = false;
    }
}

let beforeRestartHandler = null;
function setBeforeRestartHandler(fn) {
    beforeRestartHandler = typeof fn === 'function' ? fn : null;
}

// Standalone restart helper. `timeout` command redirect ke saath turant fail ho
// jata hai ("Input redirection is not supported"), isliye Node ka chhota helper
// process spawn karte hain jo 2 second wait karke naya server start karta hai.
function buildStandaloneRelaunch() {
    const inline = [
        'const fs = require("fs");',
        'const path = require("path");',
        'const { spawn } = require("child_process");',
        'const cwd = process.cwd();',
        'const supBat = path.join(cwd, "server-supervisor.bat");',
        'setTimeout(() => {',
        '  if (process.platform === "win32" && fs.existsSync(supBat)) {',
        '    const cmd = process.env.ComSpec || "cmd.exe";',
        '    const child = spawn(cmd, ["/d", "/c", supBat], { cwd, detached: true, stdio: "ignore", windowsHide: true });',
        '    child.unref();',
        '  } else {',
        '    const child = spawn(process.execPath, ["server.js"], { cwd, detached: true, stdio: "ignore", windowsHide: true });',
        '    child.unref();',
        '  }',
        '}, 2000);'
    ].join(' ');
    return {
        command: process.execPath,
        args: ['-e', inline],
        options: {
            cwd: ROOT_DIR,
            detached: true,
            stdio: 'ignore',
            windowsHide: true
        }
    };
}

async function restoreCanonicalPortIfFree() {
    try {
        const envPath = path.join(ROOT_DIR, '.env');
        if (!fs.existsSync(envPath)) return false;
        const raw = fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '');
        const m = raw.match(/^\s*PORT\s*=\s*(\d+)/m);
        const curPort = m ? parseInt(m[1], 10) : 4000;
        const autoFallbackPorts = new Set([4001, 4545, 4040, 4800, 5050, 8090]);
        if (!autoFallbackPorts.has(curPort)) return false;

        const net = require('net');
        const free4000 = await new Promise((resolve) => {
            const srv = net.createServer();
            srv.once('error', () => resolve(false));
            srv.once('listening', () => { srv.close(() => resolve(true)); });
            srv.listen(4000, '0.0.0.0');
        });
        if (!free4000) return false;

        const nextEnv = raw.replace(/^\s*PORT\s*=.*$/m, 'PORT=4000');
        fs.writeFileSync(envPath, nextEnv, 'utf8');
        logUpdate(`Restored .env PORT from ${curPort} back to canonical 4000.`);
        return true;
    } catch (_) {
        return false;
    }
}

async function triggerCleanRestart(options = {}) {
    const supervisorChanged = Boolean(options && options.supervisorChanged);
    try {
        await restoreCanonicalPortIfFree();
    } catch (_) { }
    try {
        const stopSentinel = path.join(LOG_DIR, '.stop_supervisor');
        if (fs.existsSync(stopSentinel)) fs.unlinkSync(stopSentinel);
    } catch (_) { }
    try {
        const { writeStartupStatus } = require('./startupStatus');
        writeStartupStatus({
            pct: 90,
            step: 5,
            stage: 'restarting',
            title: 'Naya Update Restart Ho Raha Hai...',
            detail: 'Update install ho gaya — server naye version ke saath start ho raha hai...'
        });
    } catch (_) { }

    const runGracefulExit = async () => {
        if (beforeRestartHandler) {
            try {
                await Promise.race([
                    Promise.resolve(beforeRestartHandler()),
                    new Promise(r => setTimeout(r, 6000))
                ]);
            } catch (_) { }
        }
        process.exit(0);
    };

    // 0. Hidden supervisor mode: exit karo — supervisor khud naya code load karke restart karega.
    // Agar server-supervisor.bat khud update hua hai to safe handoff flag lagao aur fresh supervisor spawn karo.
    if (process.env.CMBC_SUPERVISOR === '1' && !supervisorChanged) {
        logUpdate('Supervisor mode: flushing DB & exiting so hidden supervisor restarts cleanly...');
        setTimeout(() => { runGracefulExit(); }, 600);
        return;
    }

    if (process.env.CMBC_SUPERVISOR === '1' && supervisorChanged) {
        logUpdate('Supervisor script updated — performing clean handoff to new supervisor...');
        try {
            fs.writeFileSync(path.join(LOG_DIR, '.supervisor_relaunch'), String(Date.now()), 'utf8');
        } catch (_) { }
    }

    // 1. If running under PM2, exit cleanly so PM2 auto-restarts with updated code
    if (process.env.pm_id !== undefined || process.env.PM2_HOME) {
        logUpdate('Restarting server via PM2...');
        setTimeout(() => { runGracefulExit(); }, 600);
        return;
    }

    // 2. Standalone Node process (or supervisor handoff): flush HTTP/SQLite WAL first, spawn supervised/delayed relaunch, then exit
    logUpdate('Respawning server process (supervised) with updated code...');
    setTimeout(async () => {
        if (beforeRestartHandler) {
            try {
                await Promise.race([
                    Promise.resolve(beforeRestartHandler()),
                    new Promise(r => setTimeout(r, 6000))
                ]);
            } catch (_) { }
        }
        try {
            const relaunch = buildStandaloneRelaunch();
            const child = spawn(relaunch.command, relaunch.args, relaunch.options);
            child.unref();
        } catch (err) {
            logUpdate(`Auto-respawn warning: ${err.message}`);
        }
        setTimeout(() => process.exit(0), 250);
    }, 500);
}

function findMissingDependencies(dependencies, resolveModule = (name) => require.resolve(name, { paths: [ROOT_DIR] })) {
    return Object.keys(dependencies || {}).filter((name) => {
        try {
            resolveModule(name);
            return false;
        } catch (_) {
            return true;
        }
    });
}

function npmInstallCommand(platform = process.platform, commandShell = process.env.ComSpec || 'cmd.exe') {
    const npmArgs = ['install', '--omit=dev', '--no-audit', '--no-fund'];
    if (platform === 'win32') {
        return {
            command: commandShell,
            args: ['/d', '/c', `npm.cmd ${npmArgs.join(' ')}`]
        };
    }
    return { command: 'npm', args: npmArgs };
}

function resolveNodeBinDir() {
    const nodeDir = path.dirname(process.execPath);
    const curPath = process.env.PATH || process.env.Path || '';
    if (nodeDir && !curPath.toLowerCase().includes(nodeDir.toLowerCase())) {
        return `${nodeDir}${path.delimiter}${curPath}`;
    }
    return curPath;
}

function installDependenciesIfNeeded(force = false) {
    const packageJson = JSON.parse(fs.readFileSync(PKG_FILE, 'utf8'));
    const missing = findMissingDependencies(packageJson.dependencies);
    let sqliteNativeOk = true;
    try {
        const Database = require('better-sqlite3');
        const memDb = new Database(':memory:');
        memDb.close();
    } catch (_) {
        sqliteNativeOk = false;
    }
    if (!force && missing.length === 0 && sqliteNativeOk) return false;

    logUpdate(`Installing npm dependencies${missing.length ? ` (missing: ${missing.join(', ')})` : ''}...`);
    const npmCommand = npmInstallCommand();
    const baseEnv = {
        ...process.env,
        PATH: resolveNodeBinDir(),
        npm_config_ignore_scripts: 'true',
        NODE_OPTIONS: '--dns-result-order=ipv4first'
    };

    const tryRunNpm = (extraFlags = []) => {
        const cmd = extraFlags.length > 0 && process.platform === 'win32'
            ? { command: npmCommand.command, args: ['/d', '/c', `${npmCommand.args[2]} ${extraFlags.join(' ')}`] }
            : (extraFlags.length > 0 ? { command: npmCommand.command, args: [...npmCommand.args, ...extraFlags] } : npmCommand);
        execFileSync(cmd.command, cmd.args, {
            cwd: ROOT_DIR,
            stdio: 'ignore',
            timeout: 300000,
            windowsHide: true,
            env: baseEnv
        });
    };

    try {
        tryRunNpm();
    } catch (firstErr) {
        logUpdate(`Primary npm install failed (${firstErr.message}); trying npmmirror fallback...`);
        try {
            tryRunNpm(['--registry=https://registry.npmmirror.com']);
        } catch (mirrorErr) {
            logUpdate(`Mirror npm install failed (${mirrorErr.message}); trying SSL bypass fallback...`);
            tryRunNpm(['--registry=https://registry.npmmirror.com', '--strict-ssl=false']);
        }
    }

    const stillMissing = findMissingDependencies(packageJson.dependencies);
    if (stillMissing.length > 0) {
        throw new Error(`Dependencies are still missing after npm install: ${stillMissing.join(', ')}`);
    }

    // Verify native better-sqlite3 ABI compatibility post-install
    try {
        const Database = require('better-sqlite3');
        const memDb = new Database(':memory:');
        memDb.close();
    } catch (nativeErr) {
        logUpdate(`better-sqlite3 native verification notice: ${nativeErr.message}`);
        throw new Error(`better-sqlite3 native driver load failed after npm install: ${nativeErr.message}`);
    }

    logUpdate('npm dependencies are ready.');
    return true;
}

async function runSilentAutoUpdate(options = {}) {
    const { force = false, restartOnUpdate = true, isCli = false, forceCritical = false } = options;

    if (state.updating || !acquireUpdateLock()) {
        return { success: false, skipped: true, reason: 'Update already in progress' };
    }

    state.updating = true;
    let zipTx = null;
    try {
        const disabledFlag = String(process.env.AUTO_UPDATE_DISABLED || '').toLowerCase() === 'true';
        if (disabledFlag && !force) {
            state.lastResult = 'disabled-in-env';
            return { success: true, updated: false, skipped: true, reason: 'AUTO_UPDATE_DISABLED=true in .env' };
        }

        if (!force && !forceCritical && options.requireIdle && typeof options.isIdle === 'function' && !options.isIdle()) {
            state.lastResult = 'skipped-busy';
            logUpdate('Update skipped: app busy hai (request/transaction in-flight). Next idle window me try hoga.');
            return { success: true, updated: false, skipped: true, reason: 'App busy — update skipped safely' };
        }

        let dependenciesRepaired = false;
        let dependencyRepairError = null;
        try {
            if (findMissingDependencies(JSON.parse(fs.readFileSync(PKG_FILE, 'utf8')).dependencies).length > 0) {
                state.lastResult = 'repairing-dependencies';
                dependenciesRepaired = installDependenciesIfNeeded();
            }
        } catch (err) {
            state.lastError = err.message;
            state.lastResult = 'error';
            logUpdate(`Dependency repair failed: ${err.message}`);
            dependencyRepairError = err.message;
        }

        const check = await checkForUpdate();
        if (!check.success || !check.hasUpdate) {
            return {
                success: check.success && !dependencyRepairError,
                updated: false,
                dependenciesRepaired,
                error: dependencyRepairError || undefined,
                currentVersion: check.currentVersion,
                latestVersion: check.latestVersion
            };
        }

        const FAILED_UPDATE_COOLDOWN_MS = 45 * 60 * 1000;
        if (!force && state.failedVersion === check.latestVersion && (Date.now() - state.failedAt) < FAILED_UPDATE_COOLDOWN_MS) {
            state.lastResult = 'skipped-recent-failure';
            return {
                success: true,
                updated: false,
                skipped: true,
                reason: `v${check.latestVersion} update recently fail hua; 45 min cooldown active`,
                currentVersion: check.currentVersion,
                latestVersion: check.latestVersion
            };
        }

        // Re-check idle right before applying files/restarting so an in-flight txn started during manifest check isn't disrupted
        if (!force && !forceCritical && options.requireIdle && typeof options.isIdle === 'function' && !options.isIdle()) {
            state.lastResult = 'skipped-busy';
            logUpdate('Update deferred: active request/transaction detected right before apply.');
            return { success: true, updated: false, skipped: true, reason: 'App busy — update deferred safely' };
        }

        const isCritical = check.critical || forceCritical;
        if (isCritical && !force && !forceCritical && options.requireIdle && typeof options.isIdle === 'function' && !options.isIdle()) {
            logUpdate('🚨 Critical update detected — waiting for safe window...');
        }

        state.lastResult = 'updating';
        state.currentVersion = check.currentVersion;
        state.latestVersion = check.latestVersion;
        setProgress('manifest', 15, `GitHub manifest verified. Target release: v${check.latestVersion}`);

        const pkgHashBefore = fileHash(PKG_FILE);
        const supHashBefore = fileHash(path.join(ROOT_DIR, 'server-supervisor.bat'));

        try {
            // Step 1: Safe pre-update online SQLite DB backup
            setProgress('safety', 28, 'Securing database & user records in safety vault (Zero Data Loss Guard)...');
            await runSafeBackupBeforeUpdate();
            setProgress('safety', 38, 'Safety backup verified. Protected data safely isolated.');

            // Step 2: Pull latest code safely
            setProgress('download', 50, `Downloading latest release package v${check.latestVersion} from GitHub...`);
            const gitBin = findGitBinary();
            let codeApplied = false;
            if (gitBin && fs.existsSync(path.join(ROOT_DIR, '.git'))) {
                try {
                    await applyCodeUpdateViaGit(gitBin, force);
                    codeApplied = true;
                    logUpdate('Git update applied successfully.');
                } catch (gitErr) {
                    if (gitErr.message === 'LOCAL_CHANGES_PRESENT' || gitErr.message === 'LOCAL_COMMITS_PRESENT') {
                        state.lastResult = 'skipped-local-changes';
                        logUpdate('Local changes/commits mile — auto-update safely skip kiya gaya.');
                        return {
                            success: true,
                            updated: false,
                            skipped: true,
                            reason: 'Local uncommitted changes ya local commits present hain; update skip kiya gaya (--force se override karein)',
                            currentVersion: check.currentVersion,
                            latestVersion: check.latestVersion
                        };
                    }
                    logUpdate(`Git update failed (${gitErr.message}) — verified ZIP fallback try ho raha hai...`);
                }
            } else {
                logUpdate('Git install nahi hai — verified ZIP se update hoga.');
            }
            if (!codeApplied) {
                zipTx = await applyCodeUpdateViaZip(check.latestVersion);
            }
            const brokenAfterApply = findBrokenFiles();
            if (brokenAfterApply.length > 0) {
                throw new Error(`Update incomplete - missing/corrupt: ${brokenAfterApply.join(', ')}`);
            }

            setProgress('download', 72, 'Code package extracted cleanly. Validating dependencies...');

            const pkgHashAfter = fileHash(PKG_FILE);
            dependenciesRepaired = installDependenciesIfNeeded(pkgHashBefore !== pkgHashAfter) || dependenciesRepaired;

            const appliedVersion = getLocalVersionInfo().version;
            if (compareVersions(appliedVersion, check.latestVersion) < 0) {
                throw new Error(`Update incomplete: installed v${appliedVersion}, expected v${check.latestVersion}`);
            }
            state.currentVersion = appliedVersion;
            logUpdate(`Code version verified: v${appliedVersion}`);

            // Step 4: Run safe idempotent database migration (zero data loss)
            setProgress('database', 84, 'Applying database schema self-healing & indexes parity...');
            const setupDbScript = path.join(ROOT_DIR, 'setup-database.js');
            if (fs.existsSync(setupDbScript)) {
                try {
                    logUpdate('Running safe database schema migration check...');
                    execFileSync(process.execPath, [setupDbScript], {
                        cwd: ROOT_DIR,
                        stdio: 'ignore',
                        timeout: 60000
                    });
                } catch (migErr) {
                    logUpdate(`DB migration warning (non-fatal): ${migErr.message}`);
                }
            }
            setProgress('database', 92, 'Database integrity & performance indexes verified.');

            if (zipTx) {
                zipTx.commit();
                zipTx = null;
            }

            state.failedVersion = null;
            state.failedAt = 0;
            state.lastResult = 'updated';
            setProgress('restarting', 96, 'Restarting application engine into latest version...');

            const supervisorChanged = Boolean(supHashBefore && supHashBefore !== fileHash(path.join(ROOT_DIR, 'server-supervisor.bat')));
            if (restartOnUpdate && !isCli) {
                await triggerCleanRestart({ supervisorChanged });
            }

            setProgress('completed', 100, `Successfully updated to v${state.currentVersion}!`);

            return {
                success: true,
                updated: true,
                dependenciesRepaired,
                fromVersion: check.currentVersion,
                toVersion: state.currentVersion,
                notes: check.notes
            };
        } catch (err) {
            if (zipTx) {
                try {
                    logUpdate('Rolling back staged update files to preserve working app...');
                    zipTx.rollback();
                    zipTx = null;
                } catch (_) { }
            }
            state.lastError = err.message;
            state.lastResult = 'error';
            state.failedVersion = check.latestVersion;
            state.failedAt = Date.now();
            setProgress('error', 0, `Update failed safely (rolled back): ${err.message}`);
            logUpdate(`Update failed safely (app unaffected): ${err.message}`);
            return { success: false, updated: false, error: err.message };
        }
    } finally {
        state.updating = false;
        releaseUpdateLock();
    }
}

/**
 * Background mein har X ghante mein update check karein (silent).
 * Server chalu rehne par naya version turant pakad liya jata hai,
 * raat 2:30 AM tak wait nahi karni padti.
 * @param {number} intervalMs - Check interval in milliseconds (default 4 hours)
 * @param {Function} [isIdle] - Optional function returning true if app is idle
 */
function startPeriodicCheck(intervalMs = 4 * 60 * 60 * 1000, isIdle = null) {
    if (state.periodicTimer) {
        clearInterval(state.periodicTimer);
    }
    state.periodicIntervalMs = intervalMs;
    const idleFn = isIdle || (() => true);
    state.periodicTimer = setInterval(async () => {
        try {
            logUpdate('Periodic auto-update check chal raha hai...');
            await runSilentAutoUpdate({
                restartOnUpdate: true,
                requireIdle: true,
                isIdle: idleFn
            });
        } catch (_) { }
    }, intervalMs);
    state.periodicTimer.unref?.();
    logUpdate(`Periodic auto-update check start: har ${Math.round(intervalMs / 1000 / 60)} minute`);
}

function stopPeriodicCheck() {
    if (state.periodicTimer) {
        clearInterval(state.periodicTimer);
        state.periodicTimer = null;
        state.periodicIntervalMs = null;
        logUpdate('Periodic auto-update check band kiya gaya.');
    }
}

function getUpdateStatus() {
    const localInfo = getLocalVersionInfo();
    const { periodicTimer, onProgress, ...status } = state;
    return {
        ...status,
        stage: state.stage || 'idle',
        progressPercent: state.progressPercent || 0,
        progressMessage: state.progressMessage || '',
        recentLogs: state.recentLogs || [],
        periodicCheckActive: Boolean(periodicTimer),
        currentVersion: localInfo.version,
        latestVersion: state.latestVersion || localInfo.version,
        releaseNotes: state.releaseNotes || localInfo.notes || '',
        repo: `https://github.com/${REPO_OWNER}/${REPO_NAME}`,
        autoUpdateEnabled: String(process.env.AUTO_UPDATE_DISABLED || '').toLowerCase() !== 'true'
    };
}

// Allow direct CLI execution: `node utils/autoUpdater.js [--silent] [--force]`
if (require.main === module) {
    const force = process.argv.includes('--force');
    runSilentAutoUpdate({ force, restartOnUpdate: false, isCli: true })
        .then((res) => {
            if (res.updated) {
                console.log(`✅ Updated successfully: v${res.fromVersion} -> v${res.toVersion}`);
            } else if (res.dependenciesRepaired) {
                console.log('✅ Missing npm dependencies repaired.');
            } else if (!process.argv.includes('--silent')) {
                console.log(`ℹ️ App is up-to-date (v${res.currentVersion || getLocalVersionInfo().version}).`);
            }
            if (!res.success) {
                console.error(`❌ Update/repair failed: ${res.error || state.lastError || 'unknown error'}`);
                process.exit(1);
            }
            process.exit(0);
        })
        .catch((err) => {
            console.error(`❌ Update/repair failed: ${err.message}`);
            process.exitCode = 1;
        });
}

module.exports = {
    state,
    checkForUpdate,
    runSilentAutoUpdate,
    compareVersions,
    isUpdateAvailable,
    isRemoteInfoForBranch,
    validateArchiveVersion,
    isProtectedPath,
    buildStandaloneRelaunch,
    findMissingDependencies,
    npmInstallCommand,
    getUpdateStatus,
    getLocalVersionInfo,
    startPeriodicCheck,
    stopPeriodicCheck,
    setBeforeRestartHandler
};
