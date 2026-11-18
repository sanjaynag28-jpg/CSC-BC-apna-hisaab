<#
  scripts/auto_setup_windows.ps1
  ============================================================================
  1-Click Full Automatic Setup Engine for CSC & BC Apna Hisaab (Windows)
  - Auto-installs Node.js LTS if missing (winget or direct MSI)
  - Auto-detects or auto-installs Microsoft SQL Server Express if missing
  - Auto-enables Mixed Mode auth & TCP/IP on local SQL Server
  - Auto-creates local SQL login + auto-generates .env (zero manual typing!)
  - Auto-installs npm dependencies + creates fresh database + starter seed data
  - Creates Desktop shortcut "CSC BC Apna Hisaab"
  - Starts server & opens http://localhost:3000 automatically
  ============================================================================
#>

$ErrorActionPreference = "Stop"
$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $ProjectDir

function Write-Step($num, $total, $msg) {
    Write-Host ""
    Write-Host "[$num/$total] $msg" -ForegroundColor Cyan
}

function Write-Ok($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  [!]  $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "  [X]  $msg" -ForegroundColor Red }

function Refresh-EnvPath {
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
}

function New-RandomString([int]$len, [string]$chars) {
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $bytes = New-Object byte[] $len
    $rng.GetBytes($bytes)
    $sb = New-Object System.Text.StringBuilder
    for ($i = 0; $i -lt $len; $i++) {
        [void]$sb.Append($chars[$bytes[$i] % $chars.Length])
    }
    return $sb.ToString()
}

function Find-NodeExe {
    Refresh-EnvPath
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $candidates = @(
        "C:\Program Files\nodejs\node.exe",
        "C:\Program Files (x86)\nodejs\node.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) {
            $env:Path = "$(Split-Path $c);$env:Path"
            return $c
        }
    }
    return $null
}

function Ensure-NodeJs {
    Write-Step 1 6 "Checking Node.js..."
    $nodeExe = Find-NodeExe
    if ($nodeExe) {
        $ver = & $nodeExe --version
        Write-Ok "Node.js found: $ver"
        return
    }

    Write-Warn "Node.js nahi mila — automatically install kar rahe hain (1-2 min)..."
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        try {
            & winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
            Refresh-EnvPath
        } catch {
            Write-Warn "Winget install warning: $($_.Exception.Message)"
        }
    }

    if (-not (Find-NodeExe)) {
        Write-Warn "Direct Node.js LTS installer download kar rahe hain..."
        $msiPath = Join-Path $env:TEMP "nodejs_lts_setup.msi"
        $nodeUrl = "https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi"
        Invoke-WebRequest -Uri $nodeUrl -OutFile $msiPath -UseBasicParsing
        Start-Process msiexec.exe -ArgumentList "/i `"$msiPath`" /qn /norestart" -Wait
        Remove-Item $msiPath -Force -ErrorAction SilentlyContinue
        Refresh-EnvPath
    }

    $nodeExe = Find-NodeExe
    if (-not $nodeExe) {
        throw "Node.js install nahi ho paya. Kripya https://nodejs.org se install karke dobara ONE_CLICK_SETUP.bat chalayein."
    }
    Write-Ok "Node.js successfully installed: $(& $nodeExe --version)"
}

function Get-LocalSqlService {
    $services = Get-Service -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -eq 'MSSQL$SQLEXPRESS' -or
        $_.Name -eq 'MSSQLSERVER' -or
        $_.Name -like 'MSSQL$SQLEXPRESS*'
    }
    if ($services) {
        $preferred = $services | Where-Object { $_.Name -eq 'MSSQL$SQLEXPRESS' } | Select-Object -First 1
        if ($preferred) { return $preferred }
        return ($services | Select-Object -First 1)
    }
    return $null
}

function Get-InstanceServerName($svc) {
    if ($svc.Name -eq 'MSSQLSERVER') { return 'localhost' }
    $inst = $svc.Name -replace '^MSSQL\$', ''
    return "localhost\$inst"
}

function Test-SqlConnection([string]$connStr) {
    try {
        $conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
        $conn.Open()
        $conn.Close()
        return $true
    } catch {
        return $false
    }
}

function Parse-DotEnv([string]$envPath) {
    $map = @{}
    if (-not (Test-Path $envPath)) { return $map }
    foreach ($line in (Get-Content $envPath -ErrorAction SilentlyContinue)) {
        $t = $line.Trim()
        if (-not $t -or $t.StartsWith("#")) { continue }
        $idx = $t.IndexOf("=")
        if ($idx -gt 0) {
            $k = $t.Substring(0, $idx).Trim()
            $v = $t.Substring($idx + 1).Trim().Trim('"').Trim("'")
            $map[$k] = $v
        }
    }
    return $map
}

function Enable-SqlTcpAndMixedMode($svc) {
    $instName = if ($svc.Name -eq 'MSSQLSERVER') { 'MSSQLSERVER' } else { $svc.Name -replace '^MSSQL\$', '' }
    $instMapPath = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL"
    if (-not (Test-Path $instMapPath)) { return $false }

    $instId = (Get-ItemProperty -Path $instMapPath -Name $instName -ErrorAction SilentlyContinue).$instName
    if (-not $instId) { return $false }

    $changed = $false
    $mssqlKey = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\$instId\MSSQLServer"
    if (Test-Path $mssqlKey) {
        $curMode = (Get-ItemProperty -Path $mssqlKey -Name LoginMode -ErrorAction SilentlyContinue).LoginMode
        if ($curMode -ne 2) {
            Set-ItemProperty -Path $mssqlKey -Name LoginMode -Value 2 -Type DWord
            $changed = $true
        }
    }

    $tcpKey = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\$instId\MSSQLServer\SuperSocketNetLib\Tcp"
    if (Test-Path $tcpKey) {
        $curTcp = (Get-ItemProperty -Path $tcpKey -Name Enabled -ErrorAction SilentlyContinue).Enabled
        if ($curTcp -ne 1) {
            Set-ItemProperty -Path $tcpKey -Name Enabled -Value 1 -Type DWord
            $changed = $true
        }
    }

    if ($changed) {
        Write-Ok "SQL Server Mixed Mode & TCP/IP enabled — restarting SQL service..."
        Restart-Service -Name $svc.Name -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 3
    }

    # Also start SQL Browser so named instance (SQLEXPRESS) resolves cleanly over TCP
    $browser = Get-Service -Name "SQLBrowser" -ErrorAction SilentlyContinue
    if ($browser) {
        try {
            Set-Service -Name "SQLBrowser" -StartupType Automatic -ErrorAction SilentlyContinue
            if ($browser.Status -ne 'Running') { Start-Service -Name "SQLBrowser" -ErrorAction SilentlyContinue }
        } catch { }
    }
    return $changed
}

function Ensure-SqlServerAndEnv {
    Write-Step 2 6 "Checking SQL Server Express & Configuration (.env)..."

    $envPath = Join-Path $ProjectDir ".env"
    if (Test-Path $envPath) {
        $cfg = Parse-DotEnv $envPath
        if ($cfg["DB_SERVER"] -and $cfg["DB_USER"] -and $cfg["DB_PASSWORD"]) {
            $testConn = "Server=$($cfg['DB_SERVER']);Database=master;User Id=$($cfg['DB_USER']);Password=$($cfg['DB_PASSWORD']);TrustServerCertificate=True;Connection Timeout=5;"
            if (Test-SqlConnection $testConn) {
                Write-Ok "Existing .env verified & connected to SQL Server ($($cfg['DB_SERVER']))."
                return
            }
        }
    }

    $svc = Get-LocalSqlService
    if (-not $svc) {
        Write-Warn "SQL Server Express nahi mila — automatically download & install kar rahe hain (3-5 min lag sakte hain)..."
        $winget = Get-Command winget -ErrorAction SilentlyContinue
        if ($winget) {
            try {
                & winget install -e --id Microsoft.SQLServer.2022.Express --silent --accept-package-agreements --accept-source-agreements
            } catch {
                Write-Warn "Winget SQL Express notice: $($_.Exception.Message)"
            }
        }
        Start-Sleep -Seconds 5
        $svc = Get-LocalSqlService

        if (-not $svc) {
            Write-Warn "Official Microsoft SQL Server Express web installer download kar rahe hain..."
            $sqlExe = Join-Path $env:TEMP "SQL2022-SSEI-Expr.exe"
            Invoke-WebRequest -Uri "https://go.microsoft.com/fwlink/p/?linkid=2216019" -OutFile $sqlExe -UseBasicParsing
            Start-Process -FilePath $sqlExe -ArgumentList "/Action=Install /Quiet /IACCEPTSQLSERVERLICENSETERMS /Features=SQLENGINE /InstanceName=SQLEXPRESS /SecurityMode=SQL /SAPWD=CashMgmt#2026!" -Wait
            Remove-Item $sqlExe -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 5
            $svc = Get-LocalSqlService
        }
    }

    if (-not $svc) {
        throw "SQL Server Express install/detect nahi ho paya. Kripya SQL Server Express install karke ONE_CLICK_SETUP.bat dobara chalayein."
    }

    # Ensure SQL Server service is running
    try { Set-Service -Name $svc.Name -StartupType Automatic -ErrorAction SilentlyContinue } catch { }
    if ($svc.Status -ne 'Running') {
        Write-Ok "Starting SQL Server service ($($svc.Name))..."
        Start-Service -Name $svc.Name
        Start-Sleep -Seconds 3
    }

    # Enable Mixed Mode & TCP/IP automatically
    try { Enable-SqlTcpAndMixedMode $svc | Out-Null } catch {
        Write-Warn "Registry check note: $($_.Exception.Message)"
    }

    $serverName = Get-InstanceServerName $svc
    Write-Ok "SQL Server active: $serverName"

    # Auto-provision dedicated app SQL login using Windows Integrated Auth (zero manual password typing!)
    $appUser = "cmbc_user"
    $appPass = "CmBc@" + (New-RandomString 12 "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789")
    $jwtSecret = New-RandomString 64 "0123456789abcdef"

    $winConnStr = "Server=$serverName;Database=master;Integrated Security=True;TrustServerCertificate=True;Connection Timeout=15;"
    $provisioned = $false
    try {
        $conn = New-Object System.Data.SqlClient.SqlConnection($winConnStr)
        $conn.Open()
        $cmd = $conn.CreateCommand()
        $safePass = $appPass.Replace("'", "''")
        $cmd.CommandText = @"
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'$appUser')
BEGIN
    CREATE LOGIN [$appUser] WITH PASSWORD = N'$safePass', CHECK_POLICY = OFF, CHECK_EXPIRATION = OFF;
END
ELSE
BEGIN
    ALTER LOGIN [$appUser] WITH PASSWORD = N'$safePass', CHECK_POLICY = OFF, CHECK_EXPIRATION = OFF;
    ALTER LOGIN [$appUser] ENABLE;
END
ALTER SERVER ROLE [sysadmin] ADD MEMBER [$appUser];
"@
        [void]$cmd.ExecuteNonQuery()
        $conn.Close()
        $provisioned = $true
        Write-Ok "SQL login '$appUser' automatically configured."
    } catch {
        Write-Warn "Windows Auth auto-login note: $($_.Exception.Message)"
    }

    if (-not $provisioned) {
        # Fallback: check if standard sa password from silent install works
        $fallbackTest = "Server=$serverName;Database=master;User Id=sa;Password=CashMgmt#2026!;TrustServerCertificate=True;Connection Timeout=8;"
        if (Test-SqlConnection $fallbackTest) {
            $appUser = "sa"
            $appPass = "CashMgmt#2026!"
            $provisioned = $true
        }
    }

    if (-not $provisioned) {
        throw "SQL Server se auto-login set nahi ho paya. Kripya ONE_CLICK_SETUP.bat par Right-Click -> 'Run as Administrator' karein."
    }

    # Write fresh .env cleanly
    $envContent = @"
PORT=3000
HOST=0.0.0.0
DB_SERVER=$serverName
DB_NAME=CashManagement
DB_USER=$appUser
DB_PASSWORD=$appPass
JWT_SECRET=$jwtSecret
AUTO_UPDATE_DISABLED=false
"@
    Set-Content -Path $envPath -Value $envContent -Encoding UTF8
    Write-Ok ".env automatically generated (AUTO_UPDATE enabled)."
}

function Install-Dependencies {
    Write-Step 3 6 "Installing Node.js dependencies (npm install)..."
    & npm.cmd install --omit=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
        throw "npm install failed. Check internet connection and retry."
    }
    Write-Ok "Dependencies installed successfully."
}

function Setup-Database {
    Write-Step 4 6 "Creating Database, Tables, Stored Procedures & Starter Data..."
    & node setup-database.js
    if ($LASTEXITCODE -ne 0) {
        throw "Database setup failed. Check SQL Server service and retry."
    }
    Write-Ok "Database ready (24 tables, 5 stored procedures, starter admin/accounts/categories/services)!"
}

function Create-DesktopShortcut {
    Write-Step 5 6 "Creating Desktop Shortcut..."
    try {
        $desktop = [Environment]::GetFolderPath("Desktop")
        $shortcutPath = Join-Path $desktop "CSC BC Apna Hisaab.lnk"
        $wsh = New-Object -ComObject WScript.Shell
        $sc = $wsh.CreateShortcut($shortcutPath)
        $sc.TargetPath = Join-Path $ProjectDir "START.bat"
        $sc.WorkingDirectory = $ProjectDir
        $sc.Description = "CSC & BC Apna Hisaab - Cash Management System (Auto-Updating)"
        $sc.Save()
        Write-Ok "Desktop shortcut created: CSC BC Apna Hisaab"
    } catch {
        Write-Warn "Shortcut skipped: $($_.Exception.Message)"
    }
}

function Launch-App {
    Write-Step 6 6 "Starting Server & Opening Browser..."
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c title CSC BC Apna Hisaab Server && node server.js" -WorkingDirectory $ProjectDir
    Start-Sleep -Seconds 4
    Start-Process "http://localhost:3000"
    Write-Ok "App is LIVE at http://localhost:3000 !"
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================
try {
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "   CSC & BC APNA HISAAB - 1-CLICK COMPLETE AUTO SETUP" -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Green

    Ensure-NodeJs
    Ensure-SqlServerAndEnv
    Install-Dependencies
    Setup-Database
    Create-DesktopShortcut
    Launch-App

    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "   SETUP 100% COMPLETE! PROJECT READY TO USE!" -ForegroundColor Green
    Write-Host "   URL:   http://localhost:3000" -ForegroundColor White
    Write-Host "   Login: admin / admin123 (Localhost auto-login active)" -ForegroundColor White
    Write-Host "   Auto-Update: ON (Har launch par silent update hoga)" -ForegroundColor White
    Write-Host "============================================================" -ForegroundColor Green
    exit 0
} catch {
    Write-Host ""
    Write-Err "Setup Error: $($_.Exception.Message)"
    exit 1
}
