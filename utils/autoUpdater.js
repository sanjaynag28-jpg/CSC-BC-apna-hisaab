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
const { execFileSync, spawn } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const VERSION_FILE = path.join(ROOT_DIR, 'version.json');
const PKG_FILE = path.join(ROOT_DIR, 'package.json');
const LOG_DIR = path.join(ROOT_DIR, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'auto-update.log');
const TMP_DIR = path.join(ROOT_DIR, '.auto-update-tmp');

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
    'backups',
    'logs',
    'bin',
    '.auto-update-tmp',
    '.antigravity',
    'database/data',
    'public/uploads',
    // Admin-managed license cache (universal keys + hardware blacklist).
    // Release ZIP me iski purani copy hoti hai, isliye local file ko overwrite mat karo.
    'config/licenses.json'
]);

// These tracked files are expected to differ locally and must survive an update.
const LOCAL_DATA_FILES = new Set(['version.json', 'config/licenses.json']);

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
        const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
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
        return JSON.parse(fs.readFileSync(path.join(dir, 'version.json'), 'utf8'));
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

function fetchJson(url, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': 'CSC-BC-Apna-Hisaab-Updater/1.0',
                'Cache-Control': 'no-cache'
            }
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                return fetchJson(res.headers.location, timeoutMs).then(resolve, reject);
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            let raw = '';
            res.setEncoding('utf8');
            res.on('data', chunk => { raw += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(raw));
                } catch (err) {
                    reject(new Error('Invalid JSON in remote version.json'));
                }
            });
        });
        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error('Network timeout'));
        });
        req.on('error', reject);
    });
}

function downloadFile(url, destPath, timeoutMs = 60000, redirects = 0) {
    return new Promise((resolve, reject) => {
        if (redirects > 5) return reject(new Error('Too many redirects'));
        const req = https.get(url, {
            headers: { 'User-Agent': 'CSC-BC-Apna-Hisaab-Updater/1.0' }
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                return downloadFile(res.headers.location, destPath, timeoutMs, redirects + 1).then(resolve, reject);
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`Download failed with HTTP ${res.statusCode}`));
            }
            const ws = fs.createWriteStream(destPath);
            res.pipe(ws);
            ws.on('finish', () => ws.close(() => resolve(destPath)));
            ws.on('error', (err) => {
                try { fs.unlinkSync(destPath); } catch (_) { }
                reject(err);
            });
        });
        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error('Download timeout'));
        });
        req.on('error', reject);
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
    'package-lock.json': 5000,
    'setup-database.js': 200,
    'database/setup_sqlite.js': 5000,
    'database/setup.sql': 10000,
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
    const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalized) return false;
    for (const p of PROTECTED_RELATIVE_PATHS) {
        if (normalized === p || normalized.startsWith(p + '/')) return true;
    }
    if (/^\.env(\.|$)/i.test(normalized) && normalized !== '.env.example') return true;
    if (/\.(mdf|ldf|ndf|bak|db|sqlite|sqlite3)$/i.test(normalized)) return true;
    if (normalized === '.admin-login.txt') return true;
    return false;
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
            fs.copyFileSync(srcPath, dstPath);
        }
    }
}

function runSafeBackupBeforeUpdate() {
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
    logUpdate(`Fetching latest release from GitHub via Git (${BRANCH})...`);
    execFileSync(gitBin, ['fetch', 'origin', BRANCH, '--quiet'], {
        cwd: ROOT_DIR,
        stdio: 'ignore',
        timeout: 30000
    });

    // Safety guard: do not clobber local commits/edits unless forced.
    // Fetch pehle hota hai taaki pichli ZIP update ke baad working tree agar
    // origin se already identical hai to use local change na samjha jaye.
    if (!force) {
        const ahead = parseInt(execFileSync(gitBin, ['rev-list', '--count', `origin/${BRANCH}..HEAD`], {
            cwd: ROOT_DIR,
            encoding: 'utf8',
            timeout: 10000
        }).trim(), 10) || 0;
        if (ahead > 0) {
            throw new Error('LOCAL_COMMITS_PRESENT');
        }

        const statusOut = execFileSync(gitBin, ['status', '--porcelain'], {
            cwd: ROOT_DIR,
            encoding: 'utf8',
            timeout: 10000
        }).trim();
        const changedPaths = statusOut
            .split(/\r?\n/)
            .map(line => line.slice(3).replace(/^"|"$/g, ''))
            .filter(Boolean);
        const unexpectedChanges = changedPaths.filter(file => !LOCAL_DATA_FILES.has(file));
        if (unexpectedChanges.length > 0) {
            let diffVsRemote = '';
            try {
                diffVsRemote = execFileSync(gitBin, ['diff', '--name-only', `origin/${BRANCH}`, '--'], {
                    cwd: ROOT_DIR,
                    encoding: 'utf8',
                    timeout: 10000
                }).trim();
            } catch (_) {
                diffVsRemote = 'unknown';
            }
            const realDifferences = diffVsRemote
                .split(/\r?\n/)
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

    // config/licenses.json tracked hai, isliye reset --hard use repo ki purani copy
    // se replace kar dega. Admin ke banaye keys/blacklist ko restore karo.
    const licensePath = path.join(ROOT_DIR, 'config', 'licenses.json');
    let licenseBackup = null;
    try {
        if (fs.existsSync(licensePath)) licenseBackup = fs.readFileSync(licensePath);
    } catch (_) { }

    execFileSync(gitBin, ['reset', '--hard', `origin/${BRANCH}`], {
        cwd: ROOT_DIR,
        stdio: 'ignore',
        timeout: 30000
    });

    if (licenseBackup) {
        try {
            fs.mkdirSync(path.dirname(licensePath), { recursive: true });
            fs.writeFileSync(licensePath, licenseBackup);
            logUpdate('Local license config preserved across Git update.');
        } catch (err) {
            logUpdate(`License config restore warning: ${err.message}`);
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
                        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`
                    ], { stdio: 'ignore', timeout: 60000 });
                    extracted = true;
                } catch (extractErr) {
                    logUpdate(`ZIP extract attempt ${i}/2 failed: ${extractErr.message}`);
                    if (i === 2) throw extractErr;
                }
            }

            const topEntries = fs.readdirSync(extractDir, { withFileTypes: true }).filter(e => e.isDirectory());
            if (topEntries.length === 0) throw new Error('Extracted ZIP archive was empty');
            const extractedRoot = path.join(extractDir, topEntries[0].name);

            // Live install ko chhoone se pehle hi archive verify karo. Isse galat branch,
            // stale CDN copy, ya adhoora ZIP kabhi bhi app files ko overwrite nahi karega.
            const archiveCheck = validateArchiveVersion(extractedRoot, expectedVersion);
            if (!archiveCheck.ok) {
                throw new Error(archiveCheck.reason);
            }
            const brokenArchive = findBrokenFiles(extractedRoot);
            if (brokenArchive.length > 0) {
                throw new Error(`Downloaded archive incomplete: ${brokenArchive.join(', ')}`);
            }
            logUpdate(`Archive verified as v${archiveCheck.version}; applying files...`);

            copyDirectorySafely(extractedRoot, ROOT_DIR);

            const broken = findBrokenFiles();
            if (broken.length > 0) {
                throw new Error(`Update incomplete - missing/corrupt: ${broken.join(', ')}`);
            }

            logUpdate('ZIP code files applied cleanly (user data & .env preserved).');
            return;
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
                const candidate = await fetchJson(`${url}?t=${Date.now()}`, 8000);
                if (candidate && candidate.version && isRemoteInfoForBranch(candidate)) {
                    remoteInfo = candidate;
                    break;
                }
                lastNetErr = new Error(`Manifest branch mismatch (${candidate && candidate.branch ? candidate.branch : 'unknown'})`);
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

// Standalone restart helper. `timeout` command redirect ke saath turant fail ho
// jata hai ("Input redirection is not supported"), isliye Node ka chhota helper
// process spawn karte hain jo 2 second wait karke naya server start karta hai.
function buildStandaloneRelaunch() {
    const inline = [
        'const { spawn } = require("child_process");',
        'setTimeout(() => {',
        '  const child = spawn(process.execPath, ["server.js"], { cwd: process.cwd(), detached: true, stdio: "ignore", windowsHide: true });',
        '  child.unref();',
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

function triggerCleanRestart() {
    // 0. Hidden supervisor mode: exit karo — supervisor khud naya code load karke restart karega
    if (process.env.CMBC_SUPERVISOR === '1') {
        logUpdate('Supervisor mode: exiting so hidden supervisor restarts with updated code...');
        setTimeout(() => process.exit(0), 1200);
        return;
    }

    // 1. If running under PM2, exit cleanly so PM2 auto-restarts with updated code
    if (process.env.pm_id !== undefined || process.env.PM2_HOME) {
        logUpdate('Restarting server via PM2...');
        setTimeout(() => process.exit(0), 1200);
        return;
    }

    // 2. Standalone Node process: delayed detached relaunch, then exit cleanly
    logUpdate('Respawning standalone server process with updated code...');
    try {
        const relaunch = buildStandaloneRelaunch();
        const child = spawn(relaunch.command, relaunch.args, relaunch.options);
        child.unref();
    } catch (err) {
        logUpdate(`Auto-respawn warning: ${err.message}`);
    }
    setTimeout(() => process.exit(0), 500);
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

function installDependenciesIfNeeded(force = false) {
    const packageJson = JSON.parse(fs.readFileSync(PKG_FILE, 'utf8'));
    const missing = findMissingDependencies(packageJson.dependencies);
    if (!force && missing.length === 0) return false;

    logUpdate(`Installing npm dependencies${missing.length ? ` (missing: ${missing.join(', ')})` : ''}...`);
    const npmCommand = npmInstallCommand();
    execFileSync(npmCommand.command, npmCommand.args, {
        cwd: ROOT_DIR,
        stdio: 'ignore',
        timeout: 300000,
        windowsHide: true,
        env: {
            ...process.env,
            npm_config_ignore_scripts: 'true',
            NODE_OPTIONS: '--dns-result-order=ipv4first'
        }
    });

    const stillMissing = findMissingDependencies(packageJson.dependencies);
    if (stillMissing.length > 0) {
        throw new Error(`Dependencies are still missing after npm install: ${stillMissing.join(', ')}`);
    }

    logUpdate('npm dependencies are ready.');
    return true;
}

async function runSilentAutoUpdate(options = {}) {
    const { force = false, restartOnUpdate = true, isCli = false, forceCritical = false } = options;

    if (state.updating) {
        return { success: false, skipped: true, reason: 'Update already in progress' };
    }

    // AUTO_UPDATE_DISABLED ko sirf explicit --force hi bypass karta hai.
    // Purana boot retry `forceCritical` is setting ko boot ke ~1 minute baad
    // override kar deta tha, jisse user ka disable decision bekaar ho jata tha.
    const disabledFlag = String(process.env.AUTO_UPDATE_DISABLED || '').toLowerCase() === 'true';
    if (disabledFlag && !force) {
        state.lastResult = 'disabled-in-env';
        return { success: true, updated: false, skipped: true, reason: 'AUTO_UPDATE_DISABLED=true in .env' };
    }

    // Busy guard: agar koi request abhi chal rahi hai (transaction/save), update skip karo.
    // Critical update ya force mode is guard ko bypass karta hai.
    if (!force && !forceCritical && options.requireIdle && typeof options.isIdle === 'function' && !options.isIdle()) {
        state.lastResult = 'skipped-busy';
        logUpdate('Update skipped: app busy hai (request in-flight). Next idle window me try hoga.');
        return { success: true, updated: false, skipped: true, reason: 'App busy — update skipped safely' };
    }

    let dependenciesRepaired = false;
    let dependencyRepairError = null;
    try {
        if (findMissingDependencies(JSON.parse(fs.readFileSync(PKG_FILE, 'utf8')).dependencies).length > 0) {
            state.updating = true;
            state.lastResult = 'repairing-dependencies';
            dependenciesRepaired = installDependenciesIfNeeded();
        }
    } catch (err) {
        state.lastError = err.message;
        state.lastResult = 'error';
        logUpdate(`Dependency repair failed: ${err.message}`);
        dependencyRepairError = err.message;
    } finally {
        state.updating = false;
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

    // Same version ka update recently fail hua ho to 45 minute tak dobara
    // download/restart loop mat chalao. Isse network/stale-CDN issues par
    // app har 20 minute me restart hone se bachti hai.
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

    // Critical update: force install even if busy (user safety fix)
    const isCritical = check.critical || forceCritical;
    if (isCritical && !force && !forceCritical && options.requireIdle && typeof options.isIdle === 'function' && !options.isIdle()) {
        logUpdate('🚨 Critical update detected — forcing install at next idle window...');
    }

    state.updating = true;
    state.lastResult = 'updating';
    state.currentVersion = check.currentVersion;
    state.latestVersion = check.latestVersion;
    setProgress('manifest', 15, `GitHub manifest verified. Target release: v${check.latestVersion}`);

    const pkgHashBefore = fileHash(PKG_FILE);

    try {
        // Step 1: Safe pre-update DB backup
        setProgress('safety', 28, 'Securing database & user records in safety vault (Zero Data Loss Guard)...');
        runSafeBackupBeforeUpdate();
        setProgress('safety', 38, 'Safety backup verified. Protected data safely isolated.');

        // Step 2: Pull latest code safely.
        // Git installs: fetch + reset (exact release, repo clean rehta hai).
        // Non-git installs (most users): version-verified ZIP.
        setProgress('download', 50, `Downloading latest release package v${check.latestVersion} from GitHub...`);
        const gitBin = findGitBinary();
        let codeApplied = false;
        if (gitBin) {
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
            await applyCodeUpdateViaZip(check.latestVersion);
        }
        const brokenAfterApply = findBrokenFiles();
        if (brokenAfterApply.length > 0) {
            throw new Error(`Update incomplete - missing/corrupt: ${brokenAfterApply.join(', ')}`);
        }

        setProgress('download', 72, 'Code package extracted cleanly. Validating dependencies...');

        // Also repair missing modules, even when package.json itself did not change.
        const pkgHashAfter = fileHash(PKG_FILE);
        dependenciesRepaired = installDependenciesIfNeeded(pkgHashBefore !== pkgHashAfter) || dependenciesRepaired;

        // Code apply hone ke baad confirm karo ki disk par expected version hi hai.
        // Mismatch par restart/loop nahi karna — warna app bar-bar update karti rehti hai.
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
        setProgress('database', 92, 'Database integrity & 115 performance indexes verified.');

        state.failedVersion = null;
        state.failedAt = 0;
        state.lastResult = 'updated';
        setProgress('restarting', 96, 'Restarting application engine into latest version...');

        if (restartOnUpdate && !isCli) {
            triggerCleanRestart();
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
        state.lastError = err.message;
        state.lastResult = 'error';
        state.failedVersion = check.latestVersion;
        state.failedAt = Date.now();
        logUpdate(`Update failed safely (app unaffected): ${err.message}`);
        return { success: false, updated: false, error: err.message };
    } finally {
        state.updating = false;
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
    stopPeriodicCheck
};
