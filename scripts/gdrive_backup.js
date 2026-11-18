// ============================================================================
// 💰 CASH MANAGEMENT BC — GOOGLE DRIVE AUTO-CODE-BACKUP (No Drive install)
// ----------------------------------------------------------------------------
// Kaise kaam karta hai:
//   1. Watcher project ke code files monitor karta hai (fs.watch recursive)
//   2. Jaise hi kuch change hota hai (debounce ke baad) -> project ko staging
//      copy karta hai (node_modules/logs/backups EXCLUDE) -> ZIP banata hai
//   3. ZIP ko Google Drive ke shared folder me upload karta hai
//      (Service Account JWT -> access token -> Drive API multipart upload)
//   4. Purane backups prune karta hai (maxBackups chain retained)
//   5. Restore command: Drive se zip download karke extract kar deta hai
//
// Commands:
//   node scripts/gdrive_backup.js check               -> setup/config verify
//   node scripts/gdrive_backup.js now [--dry]         -> manual backup (-dry = sirf zip banao, upload skip)
//   node scripts/gdrive_backup.js watch               -> auto watcher (START_GDRIVE_BACKUP.bat se)
//   node scripts/gdrive_backup.js list                -> Drive par maujood backups
//   node scripts/gdrive_backup.js restore [name.zip] [targetDir] --confirm -> wapas laao
//
// NOTE: Local folder delete ho jaye to cloud backup SAFE rehta hai (Service Account
// owns the files) — local delete Drive tak jaata hi nahi (one-way upload only).
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'backups', 'gdrive-config.json');
const STAGE_DIR = path.join(require('os').tmpdir(), 'cmbc_gdrive_stage');
const EXCLUDE_DIRS = new Set(['node_modules', 'backups', 'logs', '.git', 'temp', 'tmp', 'uploads', '.vs']);
const EXCLUDE_EXT = new Set(['.zip', '.bak', '.log', '.gz', '.7z', '.rar']);

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
function loadConfig() {
    const defaults = {
        folderId: '',                                  // Google Drive folder ka ID (YAHIN backup jayega)
        serviceAccountFile: 'backups/gdrive-service-account.json',
        maxBackups: 15,                                // Drive par is se zyada purani chain delete
        watchDebounceSeconds: 45,                      // change rokne ke baad kitna ruk kar backup
        cooldownMinutes: 5,                            // do backup ke beech min gap (watch mode)
        includeLatestDbBackup: false                   // true par latest DB .bak bhi snapshot me
    };
    if (!fs.existsSync(CONFIG_PATH)) return null;
    try {
        return Object.assign(defaults, JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')));
    } catch (e) {
        console.error('❌ gdrive-config.json padhne me error:', e.message);
        return null;
    }
}

function loadServiceAccount(cfg) {
    const saPath = path.isAbsolute(cfg.serviceAccountFile) ? cfg.serviceAccountFile : path.join(ROOT, cfg.serviceAccountFile);
    if (!fs.existsSync(saPath)) return null;
    try { return JSON.parse(fs.readFileSync(saPath, 'utf8')); } catch (e) {
        console.error('❌ Service account JSON kharab hai:', e.message);
        return null;
    }
}

// ---------------------------------------------------------------------------
// AUTH (Service Account JWT -> access token)
// ---------------------------------------------------------------------------
function b64url(input) {
    return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let tokenMem = { token: null, exp: 0 };

async function getAccessToken(sa) {
    const nowSec = Math.floor(Date.now() / 1000);
    if (tokenMem.token && tokenMem.exp > nowSec + 60) return tokenMem.token;
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/drive',
        aud: 'https://oauth2.googleapis.com/token',
        iat: nowSec, exp: nowSec + 3600
    }));
    const sig = crypto.createSign('RSA-SHA256').update(`${header}.${claims}`).sign(sa.private_key);
    const jwt = `${header}.${claims}.${b64url(sig)}`;
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt
        })
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) throw new Error('Google par login fail: ' + (data.error_description || data.error || res.status));
    tokenMem = { token: data.access_token, exp: nowSec + (data.expires_in || 3600) };
    return tokenMem.token;
}

// ---------------------------------------------------------------------------
// STAGING + ZIP (PowerShell Compress-Archive, koi dependency nahi)
// ---------------------------------------------------------------------------
function copyRecursive(src, dest) {
    for (const name of fs.readdirSync(src)) {
        const s = path.join(src, name);
        const st = fs.statSync(s);
        if (st.isDirectory()) {
            if (EXCLUDE_DIRS.has(name)) continue;
            const d = path.join(dest, name);
            if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
            copyRecursive(s, d);
        } else {
            if (EXCLUDE_EXT.has(path.extname(name).toLowerCase())) continue;
            fs.copyFileSync(s, path.join(dest, name));
        }
    }
}

function buildStaging(cfg) {
    if (fs.existsSync(STAGE_DIR)) { try { fs.rmSync(STAGE_DIR, { recursive: true, force: true }); } catch (_) {} }
    if (!fs.existsSync(STAGE_DIR)) fs.mkdirSync(STAGE_DIR, { recursive: true });
    copyRecursive(ROOT, STAGE_DIR);
    if (cfg.includeLatestDbBackup) {
        try {
            const bakDir = path.join(ROOT, 'backups');
            const cands = fs.readdirSync(bakDir).filter(f => /^CashManagement.*\.bak$/i.test(f));
            if (cands.length) {
                cands.sort();
                const latest = cands[cands.length - 1];
                const dbDir = path.join(STAGE_DIR, '_database_latest');
                if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
                fs.copyFileSync(path.join(bakDir, latest), path.join(dbDir, latest));
                console.log('   + DB backup bhi add: ' + latest);
            }
        } catch (_) {}
    }
}

function runPowerShell(script) {
    return new Promise((resolve, reject) => {
        const ps = spawn('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true });
        let out = '', err = '';
        ps.stdout.on('data', d => { out += d; });
        ps.stderr.on('data', d => { err += d; });
        ps.on('close', code => code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || ('powershell exit ' + code))));
    });
}

function quotePowerShellLiteral(value) {
    return "'" + String(value).replace(/'/g, "''") + "'";
}

async function makeZip(cfg) {
    buildStaging(cfg);
    const zipPath = path.join(require('os').tmpdir(), 'cmbc_gdrive.zip');
    if (fs.existsSync(zipPath)) { try { fs.unlinkSync(zipPath); } catch (_) {} }
    await runPowerShell(`Compress-Archive -Path ${quotePowerShellLiteral(STAGE_DIR + '\\*')} -DestinationPath ${quotePowerShellLiteral(zipPath)} -Force`);
    const size = fs.statSync(zipPath).size;
    return { zipPath, size };
}

// ---------------------------------------------------------------------------
// DRIVE API HELPERS
// ---------------------------------------------------------------------------
function driveHeaders(token, extra) { return Object.assign({ Authorization: 'Bearer ' + token }, extra || {}); }

async function listBackupFiles(cfg, token) {
    const q = encodeURIComponent(`'${cfg.folderId}' in parents and trashed=false and name contains 'CMBC_code_'`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,size,createdTime)&pageSize=200&supportsAllDrives=true&orderBy=createdTime%20desc`,
        { headers: driveHeaders(token) });
    const data = await res.json();
    if (!res.ok) throw new Error('List fail: ' + (data.error && data.error.message || res.status));
    return data.files || [];
}

async function uploadZip(zipPath, cloudName, cfg, token) {
    const boundary = 'cm' + Date.now() + 'bc';
    const metadata = JSON.stringify({ name: cloudName, parents: [cfg.folderId], mimeType: 'application/zip' });
    const pre = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/zip\r\n\r\n`;
    const fin = `\r\n--${boundary}--`;
    const body = Buffer.concat([Buffer.from(pre, 'utf8'), fs.readFileSync(zipPath), Buffer.from(fin, 'utf8')]);
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
        method: 'POST',
        headers: driveHeaders(token, { 'Content-Type': 'multipart/related; boundary=' + boundary }),
        body
    });
    const data = await res.json();
    if (!res.ok) throw new Error('Upload fail: ' + (data.error && data.error.message || res.status));
    return data;
}

async function deleteDriveFile(id, token) {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?supportsAllDrives=true`, {
        method: 'DELETE', headers: driveHeaders(token)
    });
    if (!res.ok && res.status !== 204 && res.status !== 404) throw new Error('Drive delete fail: ' + res.status);
}

// ---------------------------------------------------------------------------
// MAIN OPERATIONS
// ---------------------------------------------------------------------------
function stampName() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `CMBC_code_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}.zip`;
}

async function backupNow(cfg, dry) {
    const sa = loadServiceAccount(cfg);
    if (!sa) throw new Error('Service account JSON file nahi mili (backups/gdrive-service-account.json). Setup guide padhein.');
    if (!cfg.folderId) throw new Error('Drive folder ID config me khaali hai.');

    console.log('📦 Code snapshot zip ban raha hai...');
    const { zipPath, size } = await makeZip(cfg);
    console.log(`✅ ZIP ready: ${(size / 1024 / 1024).toFixed(2)} MB (${zipPath})`);
    if (dry) { console.log('🧪 DRY mode — upload skip kiya (config sahi hai to upload karega).'); return; }

    const token = await getAccessToken(sa);
    const name = stampName();
    console.log('☁️  Google Drive par upload:', name);
    await uploadZip(zipPath, name, cfg, token);
    console.log('✅ UPLOAD HO GAYA! Drive folder me dekho.');

    // Prune: maxBackups se zyada purani delete
    try {
        const files = await listBackupFiles(cfg, token);
        if (files.length > cfg.maxBackups) {
            const del = files.slice(cfg.maxBackups);
            for (const f of del) {
                await deleteDriveFile(f.id, token);
                console.log('   🗑 Purana prune hua:', f.name);
            }
        }
        console.log(`☁️  Drive par total backups: ${files.length}`);
    } catch (e) { console.log('⚠ Prune skip:', e.message); }
    try { fs.writeFileSync(path.join(ROOT, 'backups', '.gdrive_last'), JSON.stringify({ lastBackup: new Date().toISOString(), lastFile: name })); } catch (_) {}
}

function validateRestoreTarget(targetDir, confirmed) {
    if (!confirmed) throw new Error('Restore requires explicit --confirm; no files were changed.');
    const dir = path.resolve(targetDir);
    const projectRoot = fs.realpathSync(ROOT);
    const root = path.parse(dir).root;
    if (dir === root) throw new Error('Unsafe restore target: volume roots are not allowed.');

    let existing = dir;
    while (!fs.existsSync(existing)) {
        const parent = path.dirname(existing);
        if (parent === existing) throw new Error('Could not resolve restore target.');
        existing = parent;
    }

    const realExisting = fs.realpathSync(existing);
    const canonicalTarget = path.resolve(realExisting, path.relative(existing, dir));
    const relativeToProject = path.relative(projectRoot, canonicalTarget);
    const projectIsTargetOrParent = relativeToProject === '' ||
        (!relativeToProject.startsWith('..' + path.sep) && relativeToProject !== '..' && !path.isAbsolute(relativeToProject));
    const targetIsProjectParent = path.relative(canonicalTarget, projectRoot);
    if (projectIsTargetOrParent || (targetIsProjectParent !== '..' &&
        !targetIsProjectParent.startsWith('..' + path.sep) && !path.isAbsolute(targetIsProjectParent))) {
        throw new Error('Unsafe restore target: do not restore into or above the project directory.');
    }
    const protectedRoots = [process.env.SystemRoot, process.env.ProgramFiles, process.env['ProgramFiles(x86)']]
        .filter(Boolean)
        .map(p => path.resolve(p));
    for (const protectedRoot of protectedRoots) {
        const relative = path.relative(protectedRoot, canonicalTarget);
        if (relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) {
            throw new Error('Unsafe restore target: Windows system directories are not allowed.');
        }
    }
    if (process.env.USERPROFILE && path.relative(canonicalTarget, path.resolve(process.env.USERPROFILE)) === '') {
        throw new Error('Unsafe restore target: the user profile directory itself is not allowed.');
    }

    const stat = fs.lstatSync(existing);
    if (stat.isSymbolicLink()) throw new Error('Unsafe restore target: symbolic links are not allowed.');
    if (fs.existsSync(dir)) {
        if (!fs.statSync(dir).isDirectory()) throw new Error('Restore target must be a directory.');
        if (fs.readdirSync(dir).length !== 0) {
            throw new Error('Restore target is not empty; existing data was preserved. Choose a new empty directory.');
        }
    }
    return dir;
}

async function restoreBackup(cfg, fileName, targetDir, confirmed) {
    const dir = validateRestoreTarget(
        targetDir || path.join(path.dirname(ROOT), 'CashManagement_Restore_' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)),
        confirmed
    );
    const sa = loadServiceAccount(cfg);
    if (!sa) throw new Error('Service account JSON nahi mili.');
    const token = await getAccessToken(sa);
    const files = await listBackupFiles(cfg, token);
    let pick = fileName ? files.find(f => f.name === fileName) : files[0];
    if (!pick) throw new Error('Backup "' + (fileName || files[0] && files[0].name || '') + '" Drive par nahi mila. `list` se dekho.');
    console.log('⬇️  Download:', pick.name, '→ restore folder:', dir);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${pick.id}?alt=media&supportsAllDrives=true`, { headers: driveHeaders(token) });
    if (!res.ok) throw new Error('Download fail: ' + res.status);
    const zipPath = path.join(require('os').tmpdir(), 'cmbc_restore.zip');
    fs.writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
    console.log('📂 Extract ho raha hai...');
    validateRestoreTarget(dir, confirmed);
    fs.mkdirSync(dir, { recursive: true });
    await runPowerShell(`Expand-Archive -LiteralPath ${quotePowerShellLiteral(zipPath)} -DestinationPath ${quotePowerShellLiteral(dir)}`);
    console.log('✅ RESTORE PURA! Folder:', dir);
    console.log('   Is folder ko naye project dir me copy karo, phir `npm install` ek baar chalao.');
}

async function startWatch(cfg) {
    console.log('🔥 GDrive AUTO-BACKUP WATCHER START (Ctrl+C band karna)');
    console.log('   Project:', ROOT);
    console.log(`   Debounce: ${cfg.watchDebounceSeconds}s | Cooldown: ${cfg.cooldownMinutes} min | Max backups: ${cfg.maxBackups}`);
    let timer = null;
    let lastDone = 0;
    let busy = false;
    let pending = null;

    fs.watch(ROOT, { recursive: true }, (evt, fname) => {
        if (!fname) return;
        const f = String(fname);
        if (/node_modules|backups|logs|\.log$|\.zip$|gdrive[-_]config/.test(f)) return;
        clearTimeout(timer);
        timer = setTimeout(async () => {
            const now = Date.now();
            if (busy) { pending = true; return; }
            if (now - lastDone < cfg.cooldownMinutes * 60 * 1000) return;
            busy = true;
            try {
                const cfgFresh = loadConfig() || cfg;
                await backupNow(cfgFresh, false);
                lastDone = Date.now();
            } catch (e) {
                console.error('❌ Backup me problem:', e.message);
                console.log('   (10 min baad agli attempt hogi kisi change par)');
                lastDone = Date.now() - (cfg.cooldownMinutes * 60 * 1000) + 10 * 60 * 1000;
                // next change par fir try karega
            } finally {
                busy = false;
                if (pending) { pending = null; }
            }
        }, (cfg.watchDebounceSeconds || 45) * 1000);
    });
    // pehla backup turant (agar cooldown ke andar kuch nahi then)
    const cfgFresh = loadConfig() || cfg;
    backupNow(cfgFresh, false).then(() => { lastDone = Date.now(); }).catch(() => {});
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
async function main() {
    const cmd = process.argv[2] || 'now';
    const cfg = loadConfig();
    if (!cfg) {
        console.log('❌ Config nahi mili: backups\\gdrive-config.json');
        console.log('👉 backups\\gdrive-config.example.json ko copy karke banao aur');
        console.log('   folderId + service account file path set karo (guide: GDRIVE_BACKUP_SETUP_GUIDE.txt)');
        process.exitCode = 1;
        return;
    }
    try {
        if (cmd === 'now') await backupNow(cfg, process.argv.includes('--dry'));
        else if (cmd === 'check') {
            const sa = loadServiceAccount(cfg);
            if (!sa) throw new Error('Service account JSON missing.');
            console.log('📧 SA email:', sa.client_email);
            console.log('🔑 Token le rahe...');
            const token = await getAccessToken(sa);
            console.log('✅ Token OK');
            const files = await listBackupFiles(cfg, token);
            console.log(`✅ Drive folder ACCESSIBLE (folderId: ${cfg.folderId})`);
            console.log(`☁️  Is folder me abhi: ${files.length} CMBC backups`);
            files.slice(0, 5).forEach(f => console.log('   -', f.name, f.size ? '(' + (f.size / 1024 / 1024).toFixed(2) + ' MB)' : ''));
            console.log('🎉 Setup sab sahi hai! `node scripts/gdrive_backup.js watch` ya START_GDRIVE_BACKUP.bat chalao.');
        }
        else if (cmd === 'list') {
            const sa = loadServiceAccount(cfg);
            const token = await getAccessToken(sa);
            const files = await listBackupFiles(cfg, token);
            console.log(`☁️  Drive me CMBC backups (${files.length}):`);
            files.forEach((f, i) => console.log(`  ${i + 1}. ${f.name}${f.size ? ' (' + (f.size / 1024 / 1024).toFixed(2) + ' MB)' : ''} — ${f.createdTime}`));
        }
        else if (cmd === 'restore') {
            const restoreArgs = process.argv.slice(3).filter(arg => arg !== '--confirm');
            await restoreBackup(cfg, restoreArgs[0], restoreArgs[1], process.argv.includes('--confirm'));
        }
        else if (cmd === 'watch') await startWatch(cfg);
        else {
            console.log('❓ Nahi jaana:', cmd);
            console.log('Commands: check | now [--dry] | watch | list | restore [name.zip] [empty-dir] --confirm');
        }
    } catch (e) {
        console.error('❌ Error:', e.message);
        process.exitCode = 1;
    }
}

if (require.main === module) main();
module.exports = { validateRestoreTarget };
