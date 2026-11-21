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
const BRANCH = 'main';
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
    'public/uploads'
]);

const state = {
    checking: false,
    updating: false,
    lastCheckedAt: null,
    lastResult: 'idle',
    currentVersion: null,
    latestVersion: null,
    releaseNotes: null,
    lastError: null,
    periodicTimer: null,
    periodicIntervalMs: null
};

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
            return JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
        }
    } catch (_) { }
    try {
        const pkg = JSON.parse(fs.readFileSync(PKG_FILE, 'utf8'));
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
    'setup-database.js': 1000,
    'database/setup.sql': 10000,
    'public/index.html': 50000,
    'public/app.js': 50000,
    'routes/auth.js': 500,
    'middleware/auth.js': 500,
    'utils/autoUpdater.js': 1000
};

function findBrokenFiles() {
    const broken = [];
    for (const rel of Object.keys(CRITICAL_FILES)) {
        const abs = path.join(ROOT_DIR, rel);
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
    if (/\.(mdf|ldf|ndf|bak)$/i.test(normalized)) return true;
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
    // Safety guard: do not clobber uncommitted local edits unless forced
    if (!force) {
        const statusOut = execFileSync(gitBin, ['status', '--porcelain'], {
            cwd: ROOT_DIR,
            encoding: 'utf8',
            timeout: 10000
        }).trim();
        const changedPaths = statusOut.split(/\r?\n/).map(line => line.slice(3).replace(/^"|"$/g, '')).filter(Boolean);
        const unexpectedChanges = changedPaths.filter(file => file !== 'version.json');
        if (unexpectedChanges.length > 0) {
            throw new Error('LOCAL_CHANGES_PRESENT');
        }
        if (changedPaths.length > 0) {
            logUpdate('Ignoring generated local version.json change during update.');
        }
    }

    logUpdate('Fetching latest release from GitHub via Git...');
    execFileSync(gitBin, ['fetch', 'origin', BRANCH, '--quiet'], {
        cwd: ROOT_DIR,
        stdio: 'ignore',
        timeout: 30000
    });
    execFileSync(gitBin, ['reset', '--hard', `origin/${BRANCH}`], {
        cwd: ROOT_DIR,
        stdio: 'ignore',
        timeout: 30000
    });
}

async function applyCodeUpdateViaZip() {
    let lastErr = null;

    for (let round = 1; round <= 3; round++) {
        logUpdate(`Downloading latest release ZIP from GitHub... (attempt ${round}/3)`);
        if (fs.existsSync(TMP_DIR)) fs.rmSync(TMP_DIR, { recursive: true, force: true });
        fs.mkdirSync(TMP_DIR, { recursive: true });

        const zipPath = path.join(TMP_DIR, 'release.zip');
        const extractDir = path.join(TMP_DIR, 'extracted');

        try {
            await downloadFileWithRetry(REMOTE_ZIP_URL, zipPath, 4, 60000);

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
        const remoteInfo = await fetchJson(`${REMOTE_VERSION_URL}?t=${Date.now()}`, 5000);
        state.lastCheckedAt = new Date().toISOString();
        state.latestVersion = remoteInfo.version || localInfo.version;
        state.releaseNotes = remoteInfo.notes || '';
        const hasUpdate = compareVersions(state.latestVersion, state.currentVersion) > 0;
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

    // 2. Standalone Node process: spawn detached server after brief delay, then exit
    logUpdate('Respawning standalone server process with updated code...');
    try {
        const child = spawn('cmd.exe', ['/c', 'timeout /t 2 /nobreak >nul && node server.js'], {
            cwd: ROOT_DIR,
            detached: true,
            stdio: 'ignore',
            windowsHide: true
        });
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
        windowsHide: true
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

    const disabledFlag = String(process.env.AUTO_UPDATE_DISABLED || '').toLowerCase() === 'true';
    if (disabledFlag && !force && !forceCritical) {
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

    // Critical update: force install even if busy (user safety fix)
    const isCritical = check.critical || forceCritical;
    if (isCritical && !force && !forceCritical && options.requireIdle && typeof options.isIdle === 'function' && !options.isIdle()) {
        logUpdate('🚨 Critical update detected — forcing install at next idle window...');
    }

    state.updating = true;
    state.lastResult = 'updating';
    logUpdate(`New update detected: v${check.currentVersion} -> v${check.latestVersion}${isCritical ? ' (CRITICAL)' : ''} (${check.notes || 'New release'})`);

    const pkgHashBefore = fileHash(PKG_FILE);

    try {
        // Step 1: Safe pre-update DB backup
        runSafeBackupBeforeUpdate();

        // Step 2: Pull latest code safely (Git if available, otherwise ZIP)
        const gitBin = findGitBinary();
        const isGitRepo = fs.existsSync(path.join(ROOT_DIR, '.git'));
        if (gitBin && isGitRepo) {
            try {
                await applyCodeUpdateViaGit(gitBin, force);
                const brokenAfterGit = findBrokenFiles();
                if (brokenAfterGit.length > 0) {
                    logUpdate(`Git update ke baad files missing/corrupt: ${brokenAfterGit.join(', ')} — ZIP se auto-repair...`);
                    await applyCodeUpdateViaZip();
                }
            } catch (gitErr) {
                if (gitErr.message === 'LOCAL_CHANGES_PRESENT') {
                    logUpdate('Skipped silent update: uncommitted local edits detected (developer safety guard).');
                    state.lastResult = 'skipped-local-changes';
                    return { success: true, updated: false, skipped: true, reason: 'Local uncommitted edits detected' };
                }
                logUpdate(`Git update failed (${gitErr.message}), falling back to ZIP download...`);
                await applyCodeUpdateViaZip();
            }
        } else {
            await applyCodeUpdateViaZip();
        }

        // Also repair missing modules, even when package.json itself did not change.
        const pkgHashAfter = fileHash(PKG_FILE);
        dependenciesRepaired = installDependenciesIfNeeded(pkgHashBefore !== pkgHashAfter) || dependenciesRepaired;

        // Step 4: Run safe idempotent database migration (zero data loss)
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

        state.currentVersion = getLocalVersionInfo().version;
        state.lastResult = 'updated';
        logUpdate(`Successfully updated to v${state.currentVersion}!`);

        if (restartOnUpdate && !isCli) {
            triggerCleanRestart();
        }

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
    const { periodicTimer, ...status } = state;
    return {
        ...status,
        periodicCheckActive: Boolean(periodicTimer),
        currentVersion: localInfo.version,
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
    findMissingDependencies,
    npmInstallCommand,
    getUpdateStatus,
    getLocalVersionInfo,
    startPeriodicCheck,
    stopPeriodicCheck
};
