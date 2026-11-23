param(
    [string]$ProjectDir = (Join-Path $env:USERPROFILE 'CSC-BC-Apna-Hisaab'),
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
    Log "Stopping project server / background processes..." 'Cyan'

    # 1) Port 3000 par jo bhi listen kar raha hai use band karo
    try {
        $conns = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
        foreach ($c in $conns) {
            try { Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop; Log "  Killed PID $($c.OwningProcess) (port 3000)" 'DarkGray' } catch { }
        }
    } catch { }

    # 2) Project folder se chalne wale node.exe band karo
    try {
        Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -and $_.CommandLine -like "*$ProjectDir*" } |
            ForEach-Object {
                try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop; Log "  Killed node PID $($_.ProcessId)" 'DarkGray' } catch { }
            }
    } catch { }

    # 3) start-hidden.vbs chalane wale wscript band karo
    try {
        Get-CimInstance Win32_Process -Filter "Name='wscript.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -and ($_.CommandLine -like '*start-hidden.vbs*' -or $_.CommandLine -like "*$ProjectDir*") } |
            ForEach-Object {
                try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop; Log "  Killed wscript PID $($_.ProcessId)" 'DarkGray' } catch { }
            }
    } catch { }

    # 4) pm2 se chala ho to band karo
    try { & pm2 delete cash-management 2>$null | Out-Null } catch { }
    Log "  Server processes stopped." 'DarkGray'
}

function Remove-AutoStartEntries {
    Log "Removing auto-start (scheduled task, startup entry, Run key)..." 'Cyan'

    # Scheduled tasks (canonical + legacy typo names)
    foreach ($t in @('CSC BC Apna Hisaab Server', 'CSC BC Apna Hissab Server', 'CSC BC Apna Hissab Server (Login)', 'CSC BC Apna Hisaab Server (Login)')) {
        schtasks /Query /TN "$t" > $null 2>&1
        if ($LASTEXITCODE -eq 0) {
            schtasks /Delete /TN "$t" /F > $null 2>&1
            Log "  Scheduled task removed: $t" 'DarkGray'
        }
    }

    # Startup folder VBS
    $startup = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\CSC BC Apna Hisaab (Auto).vbs'
    if (Test-Path $startup) {
        try { Remove-Item $startup -Force -ErrorAction Stop; Log "  Startup entry removed." 'DarkGray' } catch { Log "  [!] Startup entry locked: $startup" 'Yellow' }
    }

    # HKCU Run key (dono spelling cover)
    try {
        Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'CSC BC Apna Hissab' -ErrorAction SilentlyContinue
        Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'CSC BC Apna Hisaab' -ErrorAction SilentlyContinue
        Log "  Run key entries removed." 'DarkGray'
    } catch { }
}

function Remove-Shortcuts {
    Log "Removing desktop & start-menu shortcuts..." 'Cyan'
    $paths = @(
        (Join-Path ([Environment]::GetFolderPath('Desktop')) 'CSC BC Apna Hisaab.lnk'),
        (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\CSC BC Apna Hisaab.lnk')
    )
    foreach ($p in $paths) {
        if (Test-Path $p) {
            try { Remove-Item $p -Force -ErrorAction Stop; Log "  Shortcut removed: $p" 'DarkGray' } catch { Log "  [!] Shortcut locked: $p" 'Yellow' }
        }
    }
}

function Remove-FirewallRule {
    Log "Removing firewall rule (port 3000)..." 'Cyan'
    netsh advfirewall firewall delete rule name="CSC BC Apna Hisaab (Port 3000)" > $null 2>&1
    Log "  Firewall rule removed (if existed)." 'DarkGray'
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

    if (-not $Force) {
        $ans = Read-Host "Database 'CashManagement' bhi DELETE karein? (fresh start ke liye Y recommend) [Y/N]"
        if ($ans -notmatch '^(y|yes)$') { Log "  Database skip kiya gaya (aapne N diya)." 'Yellow'; return }
    }

    $candidates = @()
    if ($ServerName) { $candidates += $ServerName }
    $candidates += @('localhost', 'localhost\SQLEXPRESS', 'localhost\CMBCSQL', "$env:COMPUTERNAME\SQLEXPRESS", "$env:COMPUTERNAME\CMBCSQL")

    foreach ($srv in ($candidates | Select-Object -Unique)) {
        try {
            $connStr = "Server=$srv;Database=master;Integrated Security=True;TrustServerCertificate=True;Connection Timeout=8;"
            $conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
            $conn.Open()
            $cmd = $conn.CreateCommand()
            $cmd.CommandText = @"
IF DB_ID(N'CashManagement') IS NOT NULL
BEGIN
    ALTER DATABASE [CashManagement] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [CashManagement];
END
IF EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'cmbc_user')
    DROP LOGIN [cmbc_user];
"@
            [void]$cmd.ExecuteNonQuery()
            $conn.Close()
            Log "  Database 'CashManagement' + login 'cmbc_user' deleted ($srv)." 'Green'
            return
        } catch { }
    }
    Log "  [!] SQL Server se connect nahi hua - database skip. (SQL manually band/installed nahi hua to koi baat nahi)" 'Yellow'
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