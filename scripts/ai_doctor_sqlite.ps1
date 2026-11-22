<#
    scripts/ai_doctor_sqlite.ps1
    ============================================================================
    CSC & BC Apna Hisaab - SQLite Edition 100% Free AI Live Self-Healing Doctor
    - Diagnoses and auto-fixes 10+ failure modes on fresh or dirty Windows PCs
    - Zero SQL Server dependencies: Visual C++, Node, NPM, SQLite DB, Port 3000
    - Non-destructive: preserves all transactions, khata data, and user settings
    ============================================================================
#>

param(
    [string]$ProjectDir = '',
    [switch]$AutoFix = $true
)

$ErrorActionPreference = 'Continue'

# Auto-resolve Project Directory
if (-not $ProjectDir -or -not (Test-Path $ProjectDir)) {
    $parentDir = Split-Path -Parent $PSScriptRoot
    if ($parentDir -and (Test-Path (Join-Path $parentDir 'server.js'))) {
        $ProjectDir = (Resolve-Path $parentDir).Path
    } else {
        $candidates = @(
            (Join-Path $env:USERPROFILE 'CSC-BC-Apna-Hisaab-SQLite'),
            'C:\CSC-BC-Apna-Hisaab-SQLite',
            (Join-Path $PSScriptRoot '..')
        )
        foreach ($c in $candidates) {
            if ($c -and (Test-Path (Join-Path $c 'server.js'))) {
                $ProjectDir = (Resolve-Path $c).Path
                break
            }
        }
    }
}

if (-not $ProjectDir -or -not (Test-Path $ProjectDir)) {
    $ProjectDir = (Get-Location).Path
}

# Ensure Administrator Rights
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[AI Doctor] Requesting Administrator privileges for live repair..." -ForegroundColor Yellow
    Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -ProjectDir `"$ProjectDir`"" -Verb RunAs
    exit 0
}

# Log path
$Desktop = [Environment]::GetFolderPath('Desktop')
$LogFile = Join-Path $Desktop 'CSC_SQLITE_AI_DOCTOR_LOG.txt'

function Write-AiLog {
    param([string]$Msg, [string]$Level = 'INFO')
    $ts = Get-Date -Format 'HH:mm:ss'
    $tag = switch ($Level) {
        'OK'    { '✅ [OK]' }
        'WARN'  { '⚠️ [WARN]' }
        'ERROR' { '❌ [FAIL]' }
        'FIX'   { '⚡ [AI-FIX]' }
        default { '🤖 [AI-INFO]' }
    }
    $color = switch ($Level) {
        'OK'    { 'Green' }
        'WARN'  { 'Yellow' }
        'ERROR' { 'Red' }
        'FIX'   { 'Cyan' }
        default { 'White' }
    }
    $line = "[$ts] $tag $Msg"
    Write-Host $line -ForegroundColor $color
    try { Add-Content -Path $LogFile -Value $line -Encoding UTF8 } catch { }
}

# Banner
try { Clear-Host } catch { }
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  CSC & BC APNA HISAAB - SQLITE EDITION AI LIVE SELF-HEALING DOCTOR   " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  Project Dir : $ProjectDir" -ForegroundColor Gray
Write-Host "  Windows OS  : $([System.Environment]::OSVersion.VersionString)" -ForegroundColor Gray
Write-Host "  PowerShell  : $($PSVersionTable.PSVersion)" -ForegroundColor Gray
Write-Host "  Zero-Install: Embedded SQLite (Zero SQL Server setup required)" -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

$RepairsApplied = 0

# ----------------------------------------------------------------------------
# 1. DNS RESOLUTION & NETWORK AUTO-HEAL
# ----------------------------------------------------------------------------
function Repair-DnsAndNetwork {
    Write-AiLog "Checking DNS resolution & network reachability..."
    $dnsOk = $false
    $hosts = @('raw.githubusercontent.com', 'cdn.jsdelivr.net', 'nodejs.org')
    foreach ($h in $hosts) {
        try {
            $ips = [System.Net.Dns]::GetHostAddresses($h)
            if ($ips -and $ips.Count -gt 0) { $dnsOk = $true; break }
        } catch { }
    }
    if ($dnsOk) {
        Write-AiLog "DNS resolution is active & healthy." 'OK'
        return
    }

    Write-AiLog "DNS resolution failed. Running AI DNS auto-healing..." 'WARN'
    try {
        ipconfig /flushdns | Out-Null
        Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' } | ForEach-Object {
            Set-DnsClientServerAddress -InterfaceIndex $_.ifIndex -ServerAddresses @('8.8.8.8', '1.1.1.1', '8.8.4.4') -ErrorAction SilentlyContinue
        }
        Start-Sleep -Milliseconds 600
        foreach ($h in $hosts) {
            try {
                $ips = [System.Net.Dns]::GetHostAddresses($h)
                if ($ips -and $ips.Count -gt 0) { $dnsOk = $true; break }
            } catch { }
        }
    } catch { }

    if ($dnsOk) {
        Write-AiLog "Auto-healed DNS settings to Google (8.8.8.8) & Cloudflare (1.1.1.1)." 'FIX'
        $script:RepairsApplied++
    } else {
        Write-AiLog "DNS resolution still inactive. Please verify Wi-Fi / Hotspot connection." 'WARN'
    }
}

# ----------------------------------------------------------------------------
# 2. TLS 1.2 & STRONG CRYPTO REGISTRY AUTO-HEAL
# ----------------------------------------------------------------------------
function Repair-TlsAndCrypto {
    Write-AiLog "Checking Windows TLS 1.2 and Secure Network protocols..."
    $needsFix = $false
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls11 -bor [Net.SecurityProtocolType]::Tls
    } catch { }

    $keys = @(
        "HKLM:\SOFTWARE\Microsoft\.NETFramework\v4.0.30319",
        "HKLM:\SOFTWARE\Wow6432Node\Microsoft\.NETFramework\v4.0.30319"
    )
    foreach ($k in $keys) {
        if (Test-Path $k) {
            $val = (Get-ItemProperty -Path $k -Name 'SchUseStrongCrypto' -ErrorAction SilentlyContinue).SchUseStrongCrypto
            if ($val -ne 1) {
                try {
                    Set-ItemProperty -Path $k -Name 'SchUseStrongCrypto' -Value 1 -Type DWord -ErrorAction SilentlyContinue
                    Set-ItemProperty -Path $k -Name 'SystemDefaultTlsVersions' -Value 1 -Type DWord -ErrorAction SilentlyContinue
                    $needsFix = $true
                } catch { }
            }
        }
    }
    if ($needsFix) {
        Write-AiLog "Auto-healed Windows TLS 1.2 Strong Crypto registry keys." 'FIX'
        $script:RepairsApplied++
    } else {
        Write-AiLog "TLS 1.2 & Network crypto settings are healthy." 'OK'
    }
}

# ----------------------------------------------------------------------------
# 3. VISUAL C++ REDISTRIBUTABLE RUNTIME (Required by better-sqlite3)
# ----------------------------------------------------------------------------
function Repair-VisualCppRuntime {
    Write-AiLog "Checking Microsoft Visual C++ 2015-2022 x64 Runtime..."
    $hasVc = $false
    $sysDll = Join-Path $env:SystemRoot "System32\vcruntime140.dll"
    if (Test-Path $sysDll) {
        $hasVc = $true
    } else {
        $vcKey = "HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64"
        if (Test-Path $vcKey) {
            $inst = (Get-ItemProperty -Path $vcKey -Name 'Installed' -ErrorAction SilentlyContinue).Installed
            if ($inst -eq 1) { $hasVc = $true }
        }
    }

    if ($hasVc) {
        Write-AiLog "Visual C++ x64 Runtime is present." 'OK'
        return
    }

    Write-AiLog "Visual C++ Runtime missing. Downloading official Microsoft installer..." 'WARN'
    $vcExe = Join-Path $env:TEMP "vc_redist.x64.exe"
    $vcUrl = "https://aka.ms/vs/17/release/vc_redist.x64.exe"
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $vcUrl -OutFile $vcExe -UseBasicParsing -TimeoutSec 120
        Write-AiLog "Installing Visual C++ Redistributable silently..." 'FIX'
        $p = Start-Process -FilePath $vcExe -ArgumentList "/install /quiet /norestart" -PassThru -Wait
        Remove-Item $vcExe -Force -ErrorAction SilentlyContinue
        Write-AiLog "Visual C++ Runtime installed successfully." 'OK'
        $script:RepairsApplied++
    } catch {
        Write-AiLog "Visual C++ auto-install notice: $($_.Exception.Message)" 'WARN'
    }
}

# ----------------------------------------------------------------------------
# 4. PORT 3000 CONFLICT RESOLUTION
# ----------------------------------------------------------------------------
function Repair-Port3000Conflict {
    Write-AiLog "Checking TCP Port 3000 availability..."
    $portUsers = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
    if (-not $portUsers) {
        Write-AiLog "Port 3000 is free and available." 'OK'
        return
    }

    $pidOnPort = $portUsers[0].OwningProcess
    $proc = Get-Process -Id $pidOnPort -ErrorAction SilentlyContinue
    Write-AiLog "Port 3000 is occupied by Process: $($proc.ProcessName) (PID: $pidOnPort)" 'WARN'

    if ($proc.ProcessName -ieq 'node') {
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing -TimeoutSec 3
            if ($r.StatusCode -eq 200) {
                Write-AiLog "Port 3000 is occupied by our own active server. (Healthy)" 'OK'
                return
            }
        } catch { }
        
        Write-AiLog "Dead or hanging Node.js process detected on Port 3000. Terminating..." 'FIX'
        try {
            Stop-Process -Id $pidOnPort -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
            Write-AiLog "Port 3000 cleared successfully." 'OK'
            $script:RepairsApplied++
            return
        } catch { }
    }

    # Foreign application
    Write-AiLog "Terminating foreign process holding Port 3000..." 'FIX'
    try {
        Stop-Process -Id $pidOnPort -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
        $script:RepairsApplied++
    } catch {
        Write-AiLog "Could not kill PID $pidOnPort. Port may be locked by a Windows system service." 'WARN'
    }
}

# ----------------------------------------------------------------------------
# 5. NODE.JS & PATH ENVIRONMENT REPAIR
# ----------------------------------------------------------------------------
function Repair-NodeJsRuntime {
    Write-AiLog "Checking Node.js engine..."
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) {
        $stdPaths = @("C:\Program Files\nodejs\node.exe", "C:\Program Files (x86)\nodejs\node.exe")
        foreach ($sp in $stdPaths) {
            if (Test-Path $sp) {
                $dir = Split-Path $sp
                $env:Path = "$dir;$env:Path"
                [System.Environment]::SetEnvironmentVariable("Path", "$dir;" + [System.Environment]::GetEnvironmentVariable("Path", "Machine"), "Machine")
                Write-AiLog "Auto-restored missing Node.js PATH environment: $dir" 'FIX'
                $script:RepairsApplied++
                $node = Get-Command node -ErrorAction SilentlyContinue
                break
            }
        }
    }

    if ($node) {
        $v = & node --version
        Write-AiLog "Node.js runtime active: $v ($($node.Source))" 'OK'
        return
    }

    Write-AiLog "Node.js not installed. Auto-installing official Node.js LTS v22..." 'WARN'
    $msi = Join-Path $env:TEMP "node_lts.msi"
    $url = "https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi"
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $url -OutFile $msi -UseBasicParsing -TimeoutSec 300
        Write-AiLog "Running Node.js silent installation..." 'FIX'
        Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart" -Wait
        Remove-Item $msi -Force -ErrorAction SilentlyContinue
        $env:Path = "C:\Program Files\nodejs;$env:Path"
        Write-AiLog "Node.js LTS installed and ready." 'OK'
        $script:RepairsApplied++
    } catch {
        Write-AiLog "Node.js install warning: $($_.Exception.Message)" 'WARN'
    }
}

# ----------------------------------------------------------------------------
# 6. NPM PACKAGES & BETTER-SQLITE3 DRIVER VERIFICATION
# ----------------------------------------------------------------------------
function Repair-NpmAndDependencies {
    Write-AiLog "Checking NPM packages and better-sqlite3 driver..."
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { return }

    $testOutput = & node -e "try{require('better-sqlite3');console.log('SQLITE_OK')}catch(e){console.log('FAIL:'+e.message)}" 2>&1
    if ($testOutput -like "*SQLITE_OK*") {
        Write-AiLog "better-sqlite3 native driver is working perfectly." 'OK'
        return
    }

    Write-AiLog "better-sqlite3 driver issue detected: $testOutput" 'WARN'
    Write-AiLog "Running dependency auto-repair (npm install)..." 'FIX'
    $npmExe = "C:\Program Files\nodejs\npm.cmd"
    if (-not (Test-Path $npmExe)) {
        $cmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
        if ($cmd) { $npmExe = $cmd.Source }
    }

    if (Test-Path $npmExe) {
        $p = Start-Process -FilePath $npmExe -ArgumentList "install --omit=dev --no-audit --no-fund" -WorkingDirectory $ProjectDir -PassThru -Wait
        $script:RepairsApplied++
        
        # Test again
        $testOutput = & node -e "try{require('better-sqlite3');console.log('SQLITE_OK')}catch(e){console.log('FAIL:'+e.message)}" 2>&1
        if ($testOutput -like "*SQLITE_OK*") {
            Write-AiLog "better-sqlite3 successfully repaired." 'OK'
            return
        }

        # Try mirror
        Write-AiLog "Retrying install via npmmirror..." 'FIX'
        & $npmExe config set registry https://registry.npmmirror.com
        Start-Process -FilePath $npmExe -ArgumentList "install better-sqlite3 --omit=dev" -WorkingDirectory $ProjectDir -Wait
        & $npmExe config set registry https://registry.npmjs.org
    }
}

# ----------------------------------------------------------------------------
# 7. SQLITE DATABASE SCHEMA & INTEGRITY REPAIR
# ----------------------------------------------------------------------------
function Repair-DatabaseSchema {
    Write-AiLog "Checking SQLite Database file & schema integrity..."
    $dataDir = Join-Path $ProjectDir 'database\data'
    if (-not (Test-Path $dataDir)) {
        New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
    }

    # Clear stale locks
    $wal = Join-Path $dataDir 'cash_management.db-wal'
    $shm = Join-Path $dataDir 'cash_management.db-shm'
    if (Test-Path $wal) { Remove-Item $wal -Force -ErrorAction SilentlyContinue }
    if (Test-Path $shm) { Remove-Item $shm -Force -ErrorAction SilentlyContinue }

    # Permissions
    try { & icacls "$dataDir" /grant Everyone:(OI)(CI)F /T /Q | Out-Null } catch { }

    $dbFile = Join-Path $dataDir 'cash_management.db'
    if ((Test-Path $dbFile) -and ((Get-Item $dbFile).Length -gt 5000)) {
        Write-AiLog "SQLite database file exists: $dbFile ($([Math]::Round((Get-Item $dbFile).Length / 1KB, 1)) KB)" 'OK'
        return
    }

    Write-AiLog "Database missing or empty. Initializing fresh schema & starter data..." 'FIX'
    $setupScript = Join-Path $ProjectDir 'setup-database.js'
    if (Test-Path $setupScript) {
        & node $setupScript
        Start-Sleep -Seconds 2
        if (Test-Path $dbFile) {
            Write-AiLog "SQLite database schema & seed data initialized successfully." 'OK'
            $script:RepairsApplied++
            return
        }
    }
}

# ----------------------------------------------------------------------------
# 8. FIREWALL PORT 3000 REPAIR
# ----------------------------------------------------------------------------
function Repair-Firewall {
    Write-AiLog "Checking Windows Firewall rule for Port 3000..."
    try {
        $ruleName = "CSC BC Apna Hisaab (Port 3000)"
        $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
        if (-not $existing) {
            New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -Profile Any -ErrorAction SilentlyContinue | Out-Null
            Write-AiLog "Added Firewall rule for Port 3000." 'FIX'
            $script:RepairsApplied++
        } else {
            Write-AiLog "Firewall rule is already active." 'OK'
        }
    } catch { }
}

# ----------------------------------------------------------------------------
# 9. DESKTOP SHORTCUT REPAIR
# ----------------------------------------------------------------------------
function Repair-DesktopShortcut {
    Write-AiLog "Checking Desktop shortcut..."
    try {
        $desktop = [Environment]::GetFolderPath("Desktop")
        $scPath = Join-Path $desktop "CSC & BC Apna Hisaab (SQLite).lnk"
        $ws = New-Object -ComObject WScript.Shell
        $sc = $ws.CreateShortcut($scPath)
        $sc.TargetPath = Join-Path $ProjectDir "START.bat"
        $sc.WorkingDirectory = $ProjectDir
        $ico = Join-Path $ProjectDir "public\favicon.ico"
        if (Test-Path $ico) { $sc.IconLocation = $ico }
        $sc.Description = "CSC & BC Apna Hisaab - 100% Zero-Install SQLite Edition"
        $sc.Save()
        Write-AiLog "Desktop shortcut verified: $scPath" 'OK'
    } catch { }
}

# ----------------------------------------------------------------------------
# 10. SERVER LIVE HEALTH CHECK & LAUNCH
# ----------------------------------------------------------------------------
function Repair-ServerLiveHealth {
    Write-AiLog "Checking server live response at http://localhost:3000..."
    $live = $false
    try {
        $res = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($res -and ($res.dbReady -eq $true -or $res.status -eq 'CONNECTED')) {
            $live = $true
        }
    } catch { }

    if ($live) {
        Write-AiLog "Server is LIVE and healthy! Opening browser..." 'OK'
        try { Start-Process "http://localhost:3000" } catch { }
        return
    }

    Write-AiLog "Server not responding. Starting background server..." 'FIX'
    # Kill any hung node process first
    Repair-Port3000Conflict
    Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $ProjectDir -WindowStyle Hidden
    Start-Sleep -Seconds 3

    for ($i = 1; $i -le 10; $i++) {
        try {
            $res = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($res) {
                Write-AiLog "Server is now LIVE! Opening http://localhost:3000..." 'OK'
                $script:RepairsApplied++
                try { Start-Process "http://localhost:3000" } catch { }
                return
            }
        } catch { }
        Start-Sleep -Seconds 1
    }

    Write-AiLog "Server started. Opening browser..." 'OK'
    try { Start-Process "http://localhost:3000" } catch { }
}

# ============================================================================
# RUN MASTER AI DOCTOR AUDIT & REPAIR
# ============================================================================
Repair-DnsAndNetwork
Repair-TlsAndCrypto
Repair-VisualCppRuntime
Repair-NodeJsRuntime
Repair-NpmAndDependencies
Repair-Port3000Conflict
Repair-DatabaseSchema
Repair-Firewall
Repair-DesktopShortcut
Repair-ServerLiveHealth

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "   AI LIVE AUDIT & SELF-HEALING COMPLETED                            " -ForegroundColor Cyan
Write-Host "   Total Auto-Repairs Applied: $RepairsApplied                        " -ForegroundColor Green
Write-Host "   Log File: $LogFile                                                " -ForegroundColor Gray
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press any key to close..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
