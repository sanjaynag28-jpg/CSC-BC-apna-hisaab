'use strict';

/**
 * Windows self-heal: PC boot / logon par app ka silent auto-start.
 *
 * Har install par ye cheezein pakki karta hai (bina user ko kuch karne ke):
 *   1. Startup folder entry  -> login hote hi server hidden start
 *   2. Desktop shortcut      -> "CSC BC Apna Hissab" (double click = app open)
 *   3. Start Menu shortcut   -> Windows search se bhi khul jaye
 *
 * Ye module admin rights ke bina chalta hai aur idempotent hai: jo pehle se
 * sahi hai use dobara nahi banata. Koi bhi step fail ho to sirf log hota hai,
 * app kabhi crash nahi hota.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const LOG_DIR = path.join(ROOT_DIR, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'auto-update.log');
const STARTUP_ENTRY_NAME = 'CSC BC Apna Hisaab (Auto).vbs';

function log(msg) {
    try {
        if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
        fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] [autostart] ${msg}\n`, 'utf8');
    } catch (_) { }
}

function getStartupDir() {
    const appData = process.env.APPDATA;
    if (!appData) return null;
    return path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
}

/**
 * Login par hidden server launcher (Startup folder VBS).
 * WScript se chalta hai, isliye koi console window nahi dikhti.
 */
function ensureStartupEntry() {
    const startupDir = getStartupDir();
    if (!startupDir) return 'no-appdata';

    const hiddenVbs = path.join(ROOT_DIR, 'start-hidden.vbs');
    if (!fs.existsSync(hiddenVbs)) return 'missing-launcher';
    if (!fs.existsSync(startupDir)) {
        try { fs.mkdirSync(startupDir, { recursive: true }); } catch (_) { return 'no-startup-dir'; }
    }

    const entryPath = path.join(startupDir, STARTUP_ENTRY_NAME);
    const content = [
        "' CSC & BC Apna Hisaab - silent auto-start (ye file delete na karein)",
        'Option Explicit',
        'Dim sh, hiddenLauncher',
        `hiddenLauncher = "${hiddenVbs}"`,
        'Set sh = CreateObject("WScript.Shell")',
        'sh.Run "wscript.exe """ & hiddenLauncher & """", 0, False',
        ''
    ].join('\r\n');

    try {
        if (fs.existsSync(entryPath) && fs.readFileSync(entryPath, 'utf8') === content) {
            return 'unchanged';
        }
        fs.writeFileSync(entryPath, content, 'utf8');
        log('Startup entry ready (login par server silent start hoga).');
        return 'created';
    } catch (e) {
        return 'error:' + e.message;
    }
}

/**
 * Desktop + Start Menu shortcut (PowerShell helper se, COM use karke).
 */
function ensureShortcuts() {
    const ps1 = path.join(__dirname, 'create_shortcuts.ps1');
    if (!fs.existsSync(ps1)) return 'missing-helper';

    const desktop = path.join(process.env.USERPROFILE || '', 'Desktop', 'CSC BC Apna Hisaab.lnk');
    const programs = process.env.APPDATA
        ? path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'CSC BC Apna Hisaab.lnk')
        : null;
    if (fs.existsSync(desktop) && (!programs || fs.existsSync(programs))) return 'unchanged';

    try {
        execFileSync('powershell.exe', [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy', 'Bypass',
            '-File', ps1,
            '-ProjectDir', ROOT_DIR
        ], { windowsHide: true, timeout: 45000, stdio: 'ignore' });
        log('Desktop / Start Menu shortcut ready.');
        return 'created';
    } catch (e) {
        return 'error:' + e.message;
    }
}

function ensureWindowsAutostart() {
    if (process.platform !== 'win32') return { skipped: true, reason: 'not-windows' };
    return {
        startupEntry: ensureStartupEntry(),
        shortcuts: ensureShortcuts()
    };
}

module.exports = { ensureWindowsAutostart };

// Manual run: node utils/windows_autostart.js
if (require.main === module) {
    const r = ensureWindowsAutostart();
    console.log('autostart:', JSON.stringify(r));
}
