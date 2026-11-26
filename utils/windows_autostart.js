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
const STARTUP_ENTRY_VBS = 'CSC BC Apna Hisaab SQLite (Auto).vbs';
const STARTUP_ENTRY_CMD = 'CSC BC Apna Hisaab SQLite (Auto).cmd';
const RUN_VALUE_NAME = 'CSC BC Apna Hisaab SQLite';
const LOGON_TASK_NAME = 'CSC BC Apna Hisaab SQLite AutoStart';
const BOOT_TASK_NAME = 'CSC BC Apna Hisaab SQLite BootService';

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

function isWshEnabled() {
    const wscript = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'wscript.exe');
    if (!fs.existsSync(wscript)) return false;
    for (const key of [
        'HKCU\\Software\\Microsoft\\Windows Script Host\\Settings',
        'HKLM\\Software\\Microsoft\\Windows Script Host\\Settings'
    ]) {
        try {
            const out = execFileSync('reg.exe', ['query', key, '/v', 'Enabled'], {
                windowsHide: true,
                timeout: 5000,
                stdio: ['ignore', 'pipe', 'ignore']
            }).toString();
            if (/Enabled\s+REG_DWORD\s+0x0\b/i.test(out)) return false;
        } catch (_) { }
    }
    return true;
}

function runHiddenPs(psLines, timeoutMs = 45000) {
    const encoded = Buffer.from(psLines.join('\r\n'), 'utf16le').toString('base64');
    return execFileSync('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-EncodedCommand', encoded
    ], { windowsHide: true, timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

/**
 * Login par hidden server launcher (Startup folder VBS ya WSH-disabled fallback CMD).
 */
function ensureStartupEntry() {
    const startupDir = getStartupDir();
    if (!startupDir) return 'no-appdata';

    const hiddenVbs = path.join(ROOT_DIR, 'start-hidden.vbs');
    const supBat = path.join(ROOT_DIR, 'server-supervisor.bat');
    if (!fs.existsSync(hiddenVbs) && !fs.existsSync(supBat)) return 'missing-launcher';
    if (!fs.existsSync(startupDir)) {
        try { fs.mkdirSync(startupDir, { recursive: true }); } catch (_) { return 'no-startup-dir'; }
    }

    const vbsPath = path.join(startupDir, STARTUP_ENTRY_VBS);
    const cmdPath = path.join(startupDir, STARTUP_ENTRY_CMD);
    const wshOk = isWshEnabled() && fs.existsSync(hiddenVbs);

    if (wshOk) {
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
            try { if (fs.existsSync(cmdPath)) fs.unlinkSync(cmdPath); } catch (_) { }
            if (fs.existsSync(vbsPath) && fs.readFileSync(vbsPath, 'utf8') === content) {
                return 'unchanged';
            }
            fs.writeFileSync(vbsPath, content, 'utf8');
            log('Startup entry ready (VBS silent auto-start).');
            return 'created';
        } catch (e) {
            return 'error:' + e.message;
        }
    }

    // Fallback when Windows Script Host is disabled by GPO/Antivirus
    const escapedBat = supBat.replace(/'/g, "''");
    const escapedDir = ROOT_DIR.replace(/'/g, "''");
    const cmdContent = [
        '@echo off',
        `powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command "Start-Process cmd.exe -ArgumentList '/c','\"\"${escapedBat}\"\"' -WorkingDirectory '${escapedDir}' -WindowStyle Hidden"`,
        'exit /b 0',
        ''
    ].join('\r\n');
    try {
        try { if (fs.existsSync(vbsPath)) fs.unlinkSync(vbsPath); } catch (_) { }
        if (fs.existsSync(cmdPath) && fs.readFileSync(cmdPath, 'utf8') === cmdContent) {
            return 'unchanged-cmd-fallback';
        }
        fs.writeFileSync(cmdPath, cmdContent, 'utf8');
        log('Startup CMD fallback ready (WSH disabled PC).');
        return 'created-cmd-fallback';
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
        log('Shortcut creation notice: ' + e.message);
        return 'error:' + e.message;
    }
}

/**
 * HKCU Run entry (backup auto-start): Startup folder kisi policy se band ho
 * jaye to bhi login par server start ho jaye. Admin ki zaroorat nahi.
 */
function ensureRunKey() {
    const hiddenVbs = path.join(ROOT_DIR, 'start-hidden.vbs');
    const supBat = path.join(ROOT_DIR, 'server-supervisor.bat');
    if (!fs.existsSync(hiddenVbs) && !fs.existsSync(supBat)) return 'missing-launcher';

    const wshOk = isWshEnabled() && fs.existsSync(hiddenVbs);
    const wscript = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'wscript.exe');
    const targetVal = wshOk
        ? `"${wscript}" "${hiddenVbs}"`
        : `powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command "Start-Process cmd.exe -ArgumentList '/c','\"\"${supBat}\"\"' -WorkingDirectory '${ROOT_DIR.replace(/'/g, "''")}' -WindowStyle Hidden"`;

    try {
        const q = execFileSync('reg.exe', [
            'query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
            '/v', RUN_VALUE_NAME
        ], { windowsHide: true, timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
        if (q.toLowerCase().includes(targetVal.toLowerCase())) return 'unchanged';
    } catch (_) {
        // Entry nahi hai - neeche bana denge
    }

    const ps = [
        "$key = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'",
        'if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }',
        `$v = '${targetVal.replace(/'/g, "''")}'`,
        `Set-ItemProperty -Path $key -Name '${RUN_VALUE_NAME}' -Value $v`,
        `$check = (Get-ItemProperty -Path $key -Name '${RUN_VALUE_NAME}').'${RUN_VALUE_NAME}'`,
        'if (-not $check) { exit 1 }'
    ];

    try {
        runHiddenPs(ps);
        log('Windows Run entry ready (login auto-start fallback).');
        return 'created';
    } catch (e) {
        return 'error:' + e.message;
    }
}

/**
 * Windows Task Scheduler entry:
 *   1. Logon trigger (works without Admin rights, works even if Startup folder/Run is disabled)
 *   2. Startup boot trigger as SYSTEM (created automatically whenever running as Admin)
 *      so even on a reboot before user login, the server starts immediately!
 */
function ensureScheduledTask() {
    const hiddenVbs = path.join(ROOT_DIR, 'start-hidden.vbs');
    const supBat = path.join(ROOT_DIR, 'server-supervisor.bat');
    if (!fs.existsSync(hiddenVbs) && !fs.existsSync(supBat)) return 'missing-launcher';

    const wshOk = isWshEnabled() && fs.existsSync(hiddenVbs);
    const wscript = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'wscript.exe');
    const psExe = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const escapedDir = ROOT_DIR.replace(/'/g, "''");
    const escapedBat = supBat.replace(/'/g, "''");

    const ps = [
        "$ErrorActionPreference = 'Stop'",
        `$dir = '${escapedDir}'`,
        `$bat = '${escapedBat}'`,
        `$vbs = '${hiddenVbs.replace(/'/g, "''")}'`,
        '$hiddenPsArg = \'-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command "Start-Process cmd.exe -ArgumentList \'\'/c\'\',\'\'"\' + $bat + \'"\'\' -WorkingDirectory \'\'\' + $dir + \'\'\' -WindowStyle Hidden"\'',
        wshOk
            ? `$actExe = '${wscript.replace(/'/g, "''")}'; $actArg = '"' + $vbs + '"'`
            : `$actExe = '${psExe.replace(/'/g, "''")}'; $actArg = $hiddenPsArg`,
        `$logonTask = '${LOGON_TASK_NAME}'`,
        `$bootTask = '${BOOT_TASK_NAME}'`,
        '$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)',
        '$resLogon = "skipped"',
        '$resBoot = "not-admin"',
        '# --- Logon task: works for ANY user (no admin needed) ---',
        'try {',
        '  $existing = Get-ScheduledTask -TaskName $logonTask -ErrorAction SilentlyContinue',
        '  $needsWrite = $true',
        '  if ($existing -and $existing.Actions -and $existing.Actions.Count -gt 0) {',
        '    $a0 = $existing.Actions[0]',
        '    if ($a0.Execute -ieq $actExe -and "$($a0.Arguments)" -eq $actArg -and $existing.State -ne "Disabled") { $needsWrite = $false; $resLogon = "unchanged" }',
        '  }',
        '  if ($needsWrite) {',
        '    $action = New-ScheduledTaskAction -Execute $actExe -Argument $actArg -WorkingDirectory $dir',
        '    $trigger = New-ScheduledTaskTrigger -AtLogOn -User ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)',
        '    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -MultipleInstances IgnoreNew -StartWhenAvailable -Hidden',
        '    $principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited',
        '    Register-ScheduledTask -TaskName $logonTask -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null',
        '    $resLogon = "created"',
        '  }',
        '} catch { $resLogon = "err:" + $_.Exception.Message }',
        '# --- Boot task: Admin only ---',
        'if ($isAdmin) {',
        '  try {',
        '    $existingB = Get-ScheduledTask -TaskName $bootTask -ErrorAction SilentlyContinue',
        '    $needsBoot = $true',
        '    if ($existingB -and $existingB.Actions -and $existingB.Actions.Count -gt 0 -and "$($existingB.Actions[0].Arguments)" -eq $hiddenPsArg -and $existingB.State -ne "Disabled") {',
        '      $needsBoot = $false; $resBoot = "unchanged"',
        '    }',
        '    if ($needsBoot) {',
        `      $bAction = New-ScheduledTaskAction -Execute '${psExe.replace(/'/g, "''")}' -Argument $hiddenPsArg -WorkingDirectory $dir`,
        '      $bTrigger = New-ScheduledTaskTrigger -AtStartup',
        '      $bSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -MultipleInstances IgnoreNew -StartWhenAvailable -Hidden',
        '      $bPrincipal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest',
        '      Register-ScheduledTask -TaskName $bootTask -Action $bAction -Trigger $bTrigger -Settings $bSettings -Principal $bPrincipal -Force | Out-Null',
        '      $resBoot = "created"',
        '    }',
        '  } catch { $resBoot = "err:" + $_.Exception.Message }',
        '}',
        'Write-Output ("logon=" + $resLogon + ";boot=" + $resBoot)'
    ];

    try {
        const out = runHiddenPs(ps, 45000).trim();
        log(`ScheduledTask status: ${out}`);
        return out || 'ok';
    } catch (e) {
        log('ScheduledTask notice: ' + e.message);
        return 'error:' + e.message;
    }
}

function ensureWindowsAutostart() {
    if (process.platform !== 'win32') return { skipped: true, reason: 'not-windows' };
    return {
        wshEnabled: isWshEnabled(),
        startupEntry: ensureStartupEntry(),
        shortcuts: ensureShortcuts(),
        runKey: ensureRunKey(),
        scheduledTask: ensureScheduledTask()
    };
}

module.exports = {
    ensureWindowsAutostart,
    ensureStartupEntry,
    ensureShortcuts,
    ensureRunKey,
    ensureScheduledTask,
    isWshEnabled
};

// Manual run: node utils/windows_autostart.js
if (require.main === module) {
    const r = ensureWindowsAutostart();
    console.log('autostart:', JSON.stringify(r));
}
