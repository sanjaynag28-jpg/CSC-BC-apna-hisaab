param(
    [string]$ProjectDir = (Join-Path $env:USERPROFILE 'CSC-BC-Apna-Hisaab-SQLite'),
    [switch]$Force
)

$ErrorActionPreference = 'Continue'
$LogFile = Join-Path ([Environment]::GetFolderPath('Desktop')) 'FULL_UNINSTALL_LOG.txt'

function Log {
    param([string]$Msg, [string]$Color = 'Gray')
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Msg
    try { Add-Content -Path $LogFile -Value $line -Encoding UTF8 } catch { }
    Write-Host $line -ForegroundColor $Color
}

function Kill-ProjectProcesses {
    Log "Stopping project server / supervisor / background processes..." 'Cyan'

    foreach ($pNum in @(4000, 3000)) {
        try {
            $conns = Get-NetTCPConnection -LocalPort $pNum -State Listen -ErrorAction SilentlyContinue
            foreach ($c in $conns) {
                $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
                if ($p -and $p.ProcessName -ieq 'node') {
                    try { Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop; Log "  Killed node PID $($c.OwningProcess) (port $pNum)" 'DarkGray' } catch { }
                }
            }
        } catch { }
    }

    try {
        Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -and $_.CommandLine -like '*server-supervisor.bat*' } |
            ForEach-Object {
                try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop; Log "  Killed supervisor PID $($_.ProcessId)" 'DarkGray' } catch { }
            }
    } catch { }

    try {
        Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -and ($_.CommandLine -like "*$ProjectDir*" -or $_.CommandLine -like '*server.js*') } |
            ForEach-Object {
                try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop; Log "  Killed node PID $($_.ProcessId)" 'DarkGray' } catch { }
            }
    } catch { }

    try {
        Get-CimInstance Win32_Process -Filter "Name='wscript.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -and ($_.CommandLine -like '*start-hidden.vbs*' -or $_.CommandLine -like '*open-app.vbs*' -or $_.CommandLine -like "*$ProjectDir*") } |
            ForEach-Object {
                try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop; Log "  Killed wscript PID $($_.ProcessId)" 'DarkGray' } catch { }
            }
    } catch { }

    try { & pm2 delete cash-management 2>$null | Out-Null } catch { }
    Log "  Server processes stopped." 'DarkGray'
}

function Remove-AutoStartEntries {
    Log "Removing auto-start (scheduled task, startup entry, Run key)..." 'Cyan'

    foreach ($t in @('CSC BC Apna Hisaab Server', 'CSC BC Apna Hissab Server', 'CSC BC Apna Hissab Server (Login)', 'CSC BC Apna Hisaab Server (Login)', 'CSC BC Apna Hisaab SQLite')) {
        schtasks /Query /TN "$t" > $null 2>&1
        if ($LASTEXITCODE -eq 0) {
            schtasks /Delete /TN "$t" /F > $null 2>&1
            Log "  Scheduled task removed: $t" 'DarkGray'
        }
    }

    foreach ($vbsName in @('CSC BC Apna Hisaab SQLite (Auto).vbs', 'CSC BC Apna Hisaab (Auto).vbs')) {
        $startup = Join-Path $env:APPDATA ("Microsoft\Windows\Start Menu\Programs\Startup\" + $vbsName)
        if (Test-Path -LiteralPath $startup) {
            try { Remove-Item -LiteralPath $startup -Force -ErrorAction Stop; Log "  Startup entry removed: $vbsName" 'DarkGray' } catch { Log "  [!] Startup entry locked: $startup" 'Yellow' }
        }
    }

    try {
        foreach ($rk in @('CSC BC Apna Hissab', 'CSC BC Apna Hisaab', 'CSC BC Apna Hisaab SQLite')) {
            Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name $rk -ErrorAction SilentlyContinue
        }
        Log "  Run key entries removed." 'DarkGray'
    } catch { }
}

function Remove-Shortcuts {
    Log "Removing desktop & start-menu shortcuts..." 'Cyan'
    $names = @('CSC & BC Apna Hisaab (SQLite).lnk', 'CSC BC Apna Hisaab (SQLite).lnk', 'CSC BC Apna Hisaab.lnk')
    foreach ($n in $names) {
        foreach ($dir in @([Environment]::GetFolderPath('Desktop'), (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'))) {
            if (-not $dir) { continue }
            $p = Join-Path $dir $n
            if (Test-Path -LiteralPath $p) {
                try { Remove-Item -LiteralPath $p -Force -ErrorAction Stop; Log "  Shortcut removed: $p" 'DarkGray' } catch { }
            }
        }
    }
}

function Remove-FirewallRule {
    Log "Removing firewall rules (Port 4000 / 3000 / Node.js)..." 'Cyan'
    foreach ($r in @(
        'CSC BC Apna Hisaab SQLite (Port 4000)',
        'CSC BC Apna Hisaab SQLite Out (Port 4000)',
        'CSC BC Apna Hisaab Node.js Runtime',
        'CSC BC Apna Hisaab Node.js Runtime Out',
        'CSC BC Apna Hisaab (Port 3000)'
    )) {
        netsh advfirewall firewall delete rule name="$r" > $null 2>&1
    }
    Log "  Firewall rules removed." 'DarkGray'
}

function Read-DbServer {
    $envPath = Join-Path $ProjectDir '.env'
    if (Test-Path $envPath) {
        foreach ($line in (Get-Content $envPath -ErrorAction SilentlyContinue)) {
            $t = $line.Trim()
            if ($t -match '^DB_SERVER\s*=\s*(.+)$') { return $Matches[1].Trim().Trim('"').Trim("'") }
        }
    }
    return $null
}

function Remove-Database {
    param([string]$ServerName)

    $dbDir = Join-Path $ProjectDir 'database\data'
    if (Test-Path -LiteralPath $dbDir) {
        if (-not $Force) {
            $ans = Read-Host "SQLite Database folder ('database\data') bhi DELETE karein? (aapka sara hisaab-kitaab delete ho jayega!) [Y/N]"
            if ($ans -notmatch '^(y|yes)$') { Log "  SQLite database surakshit rakha gaya (aapne N diya)." 'Yellow'; return }
        }
        try {
            Remove-Item -LiteralPath $dbDir -Recurse -Force -ErrorAction Stop
            Log "  SQLite database folder deleted ($dbDir)." 'Green'
        } catch {
            Log "  [!] Database delete warning: $($_.Exception.Message)" 'Yellow'
        }
        return
    }
    Log "  Koi local SQLite database file nahi mili." 'DarkGray'
}

function Remove-ProjectFolder {
    Log "Deleting project folder: $ProjectDir" 'Cyan'
    if (-not (Test-Path $ProjectDir)) { Log "  Folder already missing." 'DarkGray'; return }

    $ok = $false
    for ($i = 1; $i -le 3 -and -not $ok; $i++) {
        try {
            Remove-Item -LiteralPath $ProjectDir -Recurse -Force -ErrorAction Stop
            $ok = $true
        } catch {
            Log "  Delete attempt $i/3 fail: $($_.Exception.Message)" 'Yellow'
            Start-Sleep -Seconds 3
        }
    }
    if ($ok) { Log "  Project folder deleted." 'Green' }
    else {
        Log "  [!] Folder abhi locked hai. PC restart karke FULL_UNINSTALL.bat dobara chalayein." 'Red'
        Log "      (ya manually delete karein: $ProjectDir)" 'Red'
    }
}

function Remove-TempFiles {
    Log "Cleaning temp installer files..." 'Cyan'
    Get-ChildItem -Path $env:TEMP -Filter 'cmbc_*' -Force -ErrorAction SilentlyContinue | ForEach-Object {
        try { Remove-Item $_.FullName -Recurse -Force -ErrorAction Stop } catch { }
    }
    Log "  Temp cleaned." 'DarkGray'
}

# ============================ MAIN ============================
Write-Host ""
Write-Host "======================================================================" -ForegroundColor Red
Write-Host "   CSC & BC APNA HISAAB - FULL UNINSTALL (100% Clean Reset)" -ForegroundColor Red
Write-Host "======================================================================" -ForegroundColor Red
Write-Host ""
Write-Host "  Yeh tool poori tarah clean karega:" -ForegroundColor White
Write-Host "   - Server / background processes band" -ForegroundColor White
Write-Host "   - Auto-start (scheduled task, startup, Run key) hataega" -ForegroundColor White
Write-Host "   - Desktop / Start Menu shortcuts hataega" -ForegroundColor White
Write-Host "   - Firewall rule hataega" -ForegroundColor White
Write-Host "   - SQL 'CashManagement' database delete (poochhega)" -ForegroundColor White
Write-Host "   - Project folder delete: $ProjectDir" -ForegroundColor White
Write-Host ""
Write-Host "  Iske baad aap FRESH install kar sakte hain (INSTALL_FROM_GITHUB.bat)." -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Red
Write-Host ""

if (-not $Force) {
    $confirm = Read-Host "SAB KUCH DELETE KARNA HAI? Pukka ho to type karein: YES"
    if ($confirm -ne 'YES') { Log "Cancelled (aapne YES type nahi kiya). Kuch delete nahi hua." 'Yellow'; exit 0 }
    Write-Host ""
}

try {
    Kill-ProjectProcesses
    Remove-AutoStartEntries
    Remove-Shortcuts
    Remove-FirewallRule
    Remove-Database -ServerName (Read-DbServer)
    Remove-ProjectFolder
    Remove-TempFiles
    Write-Host ""
    Write-Host "======================================================================" -ForegroundColor Green
    Write-Host "   UNINSTALL 100% COMPLETE - ab fresh install kar sakte hain." -ForegroundColor Green
    Write-Host "   Next: INSTALL_FROM_GITHUB.bat (ya CLEAN_FRESH_INSTALL.bat) chalayein." -ForegroundColor Green
    Write-Host "   Log: $LogFile" -ForegroundColor White
    Write-Host "======================================================================" -ForegroundColor Green
    exit 0
} catch {
    Log ("FATAL: " + $_.Exception.Message) 'Red'
    exit 1
}