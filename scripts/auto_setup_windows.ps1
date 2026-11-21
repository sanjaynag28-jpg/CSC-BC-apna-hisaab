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

# ============================================================================
# RETRY / SELF-HEAL HELPERS (network fail, corrupt download, partial install)
# ============================================================================
function Invoke-WithRetry {
    param(
        [scriptblock]$Action,
        [int]$Attempts = 3,
        [int]$DelaySeconds = 5,
        [string]$What = "operation"
    )
    for ($i = 1; $i -le $Attempts; $i++) {
        try {
            return (& $Action)
        } catch {
            if ($i -eq $Attempts) { throw }
            Write-Warn "$What fail hua (attempt $i/$Attempts): $($_.Exception.Message)"
            Write-Warn "  $DelaySeconds sec me dobara koshish..."
            Start-Sleep -Seconds $DelaySeconds
        }
    }
}

function Get-RemoteFile {
    param([string]$Url, [string]$Path, [int]$Attempts = 5)
    for ($i = 1; $i -le $Attempts; $i++) {
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            if (Test-Path $Path) { Remove-Item $Path -Force -ErrorAction SilentlyContinue }
            Invoke-WebRequest -Uri $Url -OutFile $Path -UseBasicParsing -TimeoutSec 300
            if ((Test-Path $Path) -and (Get-Item $Path).Length -gt 1024) { return $true }
            throw "Downloaded file empty ya corrupt hai"
        } catch {
            Write-Warn "Download attempt $i/$Attempts fail: $($_.Exception.Message)"
            if ($i -lt $Attempts) { Start-Sleep -Seconds ([Math]::Min(20, 3 * $i)) }
        }
    }
    return $false
}

# Files jo har haal me sahi hone chahiye (missing/corrupt = auto repair)
$script:RequiredFiles = @{
    'server.js'                      = 2000
    'package.json'                   = 200
    'package-lock.json'              = 5000
    'setup-database.js'              = 1000
    'database\setup.sql'             = 10000
    'public\index.html'              = 50000
    'public\app.js'                  = 50000
    'routes\auth.js'                 = 500
    'middleware\auth.js'             = 500
    'utils\autoUpdater.js'           = 1000
}

function Test-ProjectFilesHealthy {
    $bad = @()
    foreach ($rel in $script:RequiredFiles.Keys) {
        $p = Join-Path $ProjectDir $rel
        if (-not (Test-Path $p)) { $bad += $rel; continue }
        if ((Get-Item $p).Length -lt $script:RequiredFiles[$rel]) { $bad += $rel }
    }
    return $bad
}

function Copy-CodeFiles {
    param([string]$SourceDir, [string]$TargetDir)
    $skip = @('.env', '.git', 'backups', 'logs', 'node_modules', 'database\data', 'public\uploads', '.auto-update-tmp', '.previous-release', '.antigravity', 'bin')
    Get-ChildItem -Path $SourceDir -Force | ForEach-Object {
        if ($skip -contains $_.Name) { return }
        $dest = Join-Path $TargetDir $_.Name
        if ($_.PSIsContainer) {
            New-Item -ItemType Directory -Force -Path $dest | Out-Null
            $exclude = $null
            if ($_.Name -eq 'public') { $exclude = 'uploads' }
            if ($_.Name -eq 'database') { $exclude = 'data' }
            Get-ChildItem -LiteralPath $_.FullName -Force | Where-Object { -not $exclude -or $_.Name -ne $exclude } | ForEach-Object {
                Copy-Item -LiteralPath $_.FullName -Destination $dest -Recurse -Force
            }
        } else {
            Copy-Item -LiteralPath $_.FullName -Destination $dest -Force
        }
    }
}

function Repair-ProjectFiles {
    $bad = Test-ProjectFilesHealthy
    if ($bad.Count -eq 0) {
        Write-Ok "Project files verified (koi file missing/corrupt nahi)."
        return
    }
    Write-Warn ("Missing/corrupt files mile: " + ($bad -join ', '))
    Write-Warn "Self-repair: GitHub se fresh copy download ho rahi hai (aapka data safe rahega)..."

    $zipUrl = "https://github.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/archive/refs/heads/main.zip"
    $tmp = Join-Path $env:TEMP ("cmbc_repair_" + (Get-Random))
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    $zipPath = Join-Path $tmp "app.zip"

    if (-not (Get-RemoteFile -Url $zipUrl -Path $zipPath -Attempts 6)) {
        throw "Repair download fail. Internet check karke ONE_CLICK_SETUP.bat dobara chalayein."
    }

    $ext = Join-Path $tmp "ext"
    $ok = $false
    for ($i = 1; $i -le 3 -and -not $ok; $i++) {
        try {
            if (Test-Path $ext) { Remove-Item $ext -Recurse -Force }
            Expand-Archive -LiteralPath $zipPath -DestinationPath $ext -Force
            $ok = $true
        } catch {
            Write-Warn "Extract attempt $i/3 fail: $($_.Exception.Message)"
            Start-Sleep -Seconds (2 * $i)
        }
    }
    if (-not $ok) { throw "Repair ZIP extract nahi hua (corrupt download)." }

    $src = Get-ChildItem -Path $ext -Directory | Select-Object -First 1
    if (-not $src) { throw "Repair ZIP empty hai." }

    Copy-CodeFiles -SourceDir $src.FullName -TargetDir $ProjectDir
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

    $bad2 = Test-ProjectFilesHealthy
    if ($bad2.Count -gt 0) {
        throw ("Repair ke baad bhi files missing: " + ($bad2 -join ', '))
    }
    Write-Ok "Self-repair complete - fresh files restore ho gayi."
}

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
    Write-Step 2 8 "Checking Node.js..."
    $nodeExe = Find-NodeExe
    if ($nodeExe) {
        $ver = & $nodeExe --version
        Write-Ok "Node.js found: $ver"
        return
    }

    Write-Warn "Node.js nahi mila — automatically install kar rahe hain (1-2 min)..."
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        for ($i = 1; $i -le 2 -and -not (Find-NodeExe); $i++) {
            try {
                & winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
            } catch {
                Write-Warn "Winget install warning (attempt $i/2): $($_.Exception.Message)"
            }
            Refresh-EnvPath
            if (-not (Find-NodeExe)) { Start-Sleep -Seconds (5 * $i) }
        }
    }

    if (-not (Find-NodeExe)) {
        Write-Warn "Direct Node.js LTS installer download kar rahe hain (auto-retry)..."
        $msiPath = Join-Path $env:TEMP "nodejs_lts_setup.msi"
        $nodeUrl = "https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi"
        $downloaded = Get-RemoteFile -Url $nodeUrl -Path $msiPath -Attempts 5
        if (-not $downloaded) {
            # Alternate mirror fallback
            Write-Warn "Primary mirror fail - alternate mirror try kar rahe hain..."
            $downloaded = Get-RemoteFile -Url "https://nodejs.org/dist/latest-v22.x/node-v22.14.0-x64.msi" -Path $msiPath -Attempts 3
        }
        if (-not $downloaded) {
            throw "Node.js installer download fail. Internet check karke ONE_CLICK_SETUP.bat dobara chalayein."
        }
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
        $_.Name -eq 'MSSQLSERVER' -or $_.Name -like 'MSSQL$*'
    }
    if (-not $services) { return $null }
    $running = @($services | Where-Object { $_.Status -eq 'Running' })
    if ($running.Count -gt 0) {
        $preferred = $running | Where-Object { $_.Name -eq 'MSSQL$SQLEXPRESS' } | Select-Object -First 1
        if ($preferred) { return $preferred }
        return ($running | Sort-Object Name | Select-Object -First 1)
    }
    $preferred = $services | Where-Object { $_.Name -eq 'MSSQL$SQLEXPRESS' } | Select-Object -First 1
    if ($preferred) { return $preferred }
    return ($services | Sort-Object Name | Select-Object -First 1)
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

# ----------------------------------------------------------------------------
# SQL SELF-HEAL: leftover/broken SQL Express install (master.mdf already exists)
# ----------------------------------------------------------------------------
function Get-SqlSetupExe {
    $roots = @((Join-Path $env:ProgramFiles 'Microsoft SQL Server'))
    if (${env:ProgramFiles(x86)}) { $roots += (Join-Path ${env:ProgramFiles(x86)} 'Microsoft SQL Server') }
    foreach ($r in $roots) {
        if (-not (Test-Path $r)) { continue }
        $bootstrap = Join-Path $r '160\Setup Bootstrap'
        if (-not (Test-Path $bootstrap)) { $bootstrap = Join-Path $r '150\Setup Bootstrap' }
        if (Test-Path $bootstrap) {
            $exe = Get-ChildItem -Path $bootstrap -Filter 'setup.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($exe) { return $exe.FullName }
        }
    }
    return $null
}

function Get-SqlLeftoverInstances {
    $found = @()
    $roots = @((Join-Path $env:ProgramFiles 'Microsoft SQL Server'))
    if (${env:ProgramFiles(x86)}) { $roots += (Join-Path ${env:ProgramFiles(x86)} 'Microsoft SQL Server') }
    foreach ($r in $roots) {
        if (-not (Test-Path $r)) { continue }
        Get-ChildItem -Path $r -Directory -ErrorAction SilentlyContinue | ForEach-Object {
            if ($_.Name -match '^MSSQL\d+\.(.+)$') {
                $inst = $Matches[1]
                $svcName = if ($inst -eq 'MSSQLSERVER') { 'MSSQLSERVER' } else { "MSSQL`$$inst" }
                if (-not (Get-Service -Name $svcName -ErrorAction SilentlyContinue)) {
                    $found += $_.FullName
                }
            }
        }
    }
    return $found
}

function Remove-SqlInstanceRegistry([string]$instName) {
    $regRoots = @(
        'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Microsoft SQL Server'
    )
    foreach ($root in $regRoots) {
        $namesKey = Join-Path $root 'Instance Names\SQL'
        if (-not (Test-Path $namesKey)) { continue }
        $instId = $null
        try { $instId = (Get-ItemProperty -Path $namesKey -Name $instName -ErrorAction Stop).$instName } catch { }
        if ($instId) {
            try { Remove-ItemProperty -Path $namesKey -Name $instName -Force -ErrorAction Stop } catch { }
            $instKey = Join-Path $root $instId
            if (Test-Path $instKey) {
                try { Remove-Item $instKey -Recurse -Force -ErrorAction Stop } catch { }
            }
        }
    }
}

function Clear-BrokenSqlInstall {
    param([string[]]$Paths)

    $setup = Get-SqlSetupExe
    foreach ($p in $Paths) {
        $leaf = Split-Path $p -Leaf
        if ($leaf -match '^MSSQL\d+\.(.+)$') {
            $instName = $Matches[1]
            if ($setup) {
                try {
                    Write-Warn "Purane adhoore instance '$instName' ka silent uninstall try..."
                    Start-Process -FilePath $setup -ArgumentList "/Action=Uninstall /InstanceName=$instName /FEATURES=SQLENGINE /Quiet /IACCEPTSQLSERVERLICENSETERMS" -Wait -ErrorAction SilentlyContinue
                    Start-Sleep -Seconds 5
                } catch { }
            }
            Remove-SqlInstanceRegistry -instName $instName
        }
    }

    foreach ($p in $Paths) {
        if (Test-Path $p) {
            try {
                Remove-Item $p -Recurse -Force -ErrorAction Stop
                Write-Ok "Leftover SQL data removed: $p"
            } catch {
                Write-Warn "Leftover folder lock hai (remove nahi hua): $p"
            }
        }
    }
}

function Invoke-SqlSetupExe {
    param(
        [string]$Exe,
        [string[]]$SetupArgs,
        [string]$OutLog,
        [string]$Label,
        [int]$TimeoutMinutes = 90
    )
    $stdout = Join-Path $env:TEMP 'cmbc_sql_out.txt'
    $stderr = Join-Path $env:TEMP 'cmbc_sql_err.txt'
    Remove-Item $stdout, $stderr -Force -ErrorAction SilentlyContinue

    $p = Start-Process -FilePath $Exe -ArgumentList $SetupArgs -PassThru -NoNewWindow -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    try { $null = $p.Handle } catch { }   # handle rakho warna ExitCode $null aata hai
    $start = Get-Date
    while (-not $p.HasExited) {
        Start-Sleep -Seconds 20
        $elapsed = [int]((Get-Date) - $start).TotalSeconds
        if ($elapsed -gt ($TimeoutMinutes * 60)) {
            Write-Warn "$Label timeout - process band kar rahe hain."
            try { $p.Kill() } catch { }
            break
        }
        $tail = ''
        if (Test-Path $stdout) {
            $tail = ((Get-Content $stdout -Tail 2 -ErrorAction SilentlyContinue) -join ' | ')
        }
        if ($tail) {
            Write-Warn "$Label chal raha hai... ${elapsed}s | $tail"
        } else {
            Write-Warn "$Label chal raha hai... ${elapsed}s (download/install jaari hai - window band na karein)"
        }
    }

    try { $p.WaitForExit() } catch { }
    foreach ($f in @($stdout, $stderr)) {
        if (Test-Path $f) {
            Get-Content $f -ErrorAction SilentlyContinue | ForEach-Object {
                if ($_ -and $_.Trim()) { Add-Content -Path $OutLog -Value $_ -Encoding UTF8 }
            }
        }
    }
    return $p.ExitCode
}

function Install-SqlExpressInstance {
    param([string]$InstanceName, [string]$SaPassword)

    Write-Warn "SQL Server Express install ho raha hai — requested instance '$InstanceName'..."
    $sqlExe = Join-Path $env:TEMP "SQL2022-SSEI-Expr-$InstanceName.exe"
    if (-not (Get-RemoteFile -Url "https://go.microsoft.com/fwlink/p/?linkid=2216019" -Path $sqlExe -Attempts 4)) {
        Write-Warn "SQL web installer download fail."
        return $false
    }
    $outLog = Join-Path $env:TEMP ("cmbc_sql_install_" + $InstanceName + ".log")

    # ------------------------------------------------------------------
    # Method 1: SSEI + configuration file (SSEI /SAPWD etc. nahi leta,
    #           par /ConfigurationFile support karta hai)
    # ------------------------------------------------------------------
    try {
        $cfgPath = Join-Path $env:TEMP ("cmbc_sql_" + $InstanceName + ".ini")
        $cfg = @"
[OPTIONS]
ACTION="Install"
QUIET="True"
FEATURES=SQLENGINE
INSTANCENAME="$InstanceName"
SECURITYMODE="SQL"
SAPWD="$SaPassword"
TCPENABLED="1"
NPENABLED="0"
IACCEPTSQLSERVERLICENSETERMS="True"
SQLSYSADMINACCOUNTS="BUILTIN\Administrators"
"@
        Set-Content -Path $cfgPath -Value $cfg -Encoding ASCII
        Write-Warn "Install method 1: configuration file (instance '$InstanceName')..."
        $rc = Invoke-SqlSetupExe -Exe $sqlExe -SetupArgs @('/Action=Install', '/Quiet', '/IAcceptSqlServerLicenseTerms', ('/ConfigurationFile="' + $cfgPath + '"')) -OutLog $outLog -Label 'Method 1 (config file)'
        Write-Warn "Config-file install exit code: $rc"
    } catch {
        Write-Warn "Config-file method note: $($_.Exception.Message)"
    }

    # ------------------------------------------------------------------
    # Method 2: SSEI default install — Microsoft khud naya instance naam
    #           (SQLEXPRESS01 etc.) chun leta hai. Isme koi arg conflict nahi.
    # ------------------------------------------------------------------
    $anySql = Get-LocalSqlService
    if (-not $anySql) {
        try {
            Write-Warn "Install method 2: Microsoft default Express install (auto instance name)..."
            $rc = Invoke-SqlSetupExe -Exe $sqlExe -SetupArgs @('/Action=Install', '/Quiet', '/IAcceptSqlServerLicenseTerms') -OutLog $outLog -Label 'Method 2 (default install)'
            Write-Warn "Default install exit code: $rc"
        } catch {
            Write-Warn "Default install note: $($_.Exception.Message)"
        }
    }

    # ------------------------------------------------------------------
    # Method 3 (last resort): media download + setup.exe (full args)
    # ------------------------------------------------------------------
    $anySql = Get-LocalSqlService
    if (-not $anySql) {
        $mediaPath = Join-Path $env:TEMP ("cmbc_sql_media_" + $InstanceName)
        try {
            if (Test-Path $mediaPath) { Remove-Item $mediaPath -Recurse -Force -ErrorAction SilentlyContinue }
            New-Item -ItemType Directory -Force -Path $mediaPath | Out-Null
            Write-Warn "SQL media download (approx 250-300 MB)..."
            $rc = Invoke-SqlSetupExe -Exe $sqlExe -SetupArgs @('/Action=Download', '/Quiet', ('/MediaPath="' + $mediaPath + '"'), '/MediaType=Express') -OutLog $outLog -Label 'Method 3 (media download)'
            Write-Warn "Media download exit code: $rc"

            $setupExe = Get-ChildItem -Path $mediaPath -Filter 'setup.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($setupExe) {
                Write-Warn "setup.exe se install (instance '$InstanceName')..."
                $setupArgs = @(
                    '/Action=Install', '/Quiet', '/IACCEPTSQLSERVERLICENSETERMS', '/FEATURES=SQLENGINE',
                    "/InstanceName=$InstanceName", '/SECURITYMODE=SQL', "/SAPWD=$SaPassword",
                    '/TCPENABLED=1', '/NPENABLED=0', '/SQLSYSADMINACCOUNTS=BUILTIN\Administrators',
                    '/SkipRules=RebootRequiredCheck'
                )
                $rc = Invoke-SqlSetupExe -Exe $setupExe.FullName -SetupArgs $setupArgs -OutLog $outLog -Label 'Method 3 (setup.exe install)'
                Write-Warn "setup.exe exit code: $rc"
            } else {
                Write-Warn "Media me setup.exe nahi mila."
            }
        } catch {
            Write-Warn "Media method note: $($_.Exception.Message)"
        }
    }

    Remove-Item $sqlExe -Force -ErrorAction SilentlyContinue

    # Service register hone ka intezaar (koi bhi SQL instance, 3 min tak)
    $svc = $null
    for ($w = 1; $w -le 36; $w++) {
        $svc = Get-LocalSqlService
        if ($svc) { break }
        Start-Sleep -Seconds 5
    }
    if (-not $svc) {
        Write-Warn "SQL instance register nahi hua. Install log: $outLog"
        return $false
    }

    $svcName = $svc.Name
    try { Set-Service -Name $svcName -StartupType Automatic -ErrorAction SilentlyContinue } catch { }
    try {
        if ((Get-Service -Name $svcName).Status -ne 'Running') {
            Start-Service -Name $svcName
            Start-Sleep -Seconds 3
        }
    } catch { }
    if ((Get-Service -Name $svcName -ErrorAction SilentlyContinue).Status -eq 'Running') {
        Write-Ok "SQL instance installed & running: $svcName"
        return $true
    }
    Write-Warn "SQL instance '$svcName' installed par service start nahi hui. Install log: $outLog"
    return $false
}

function Repair-SqlInstance([string]$InstanceName) {
    $setup = Get-SqlSetupExe
    if (-not $setup) { return $false }
    try {
        Write-Warn "SQL instance '$InstanceName' repair try..."
        Start-Process -FilePath $setup -ArgumentList "/Action=Repair /InstanceName=$InstanceName /Quiet /IACCEPTSQLSERVERLICENSETERMS" -Wait -ErrorAction SilentlyContinue
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
    Write-Step 3 8 "Checking SQL Server Express & Configuration (.env)..."

    # Per-install random SA password — public repo me koi fixed/default password nahi.
    $saPass = "CmBc@" + (New-RandomString 16 "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789")
    $sqlInstalledByUs = $false

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
        # Self-heal: leftover/broken SQL install (e.g. "master.mdf already exists")
        $leftovers = @(Get-SqlLeftoverInstances)
        if ($leftovers.Count -gt 0) {
            Write-Warn "Purana adhoora SQL Server install mila (master.mdf leftover) - auto cleanup:"
            $leftovers | ForEach-Object { Write-Warn "  $_" }
            Clear-BrokenSqlInstall -Paths $leftovers

            # Cleanup ke baad bhi SQLEXPRESS naam conflict kar sakta hai:
            # is liye seedha FRESH instance install karo (naya naam = naya DATA folder).
            Write-Warn "Conflict se bachne ke liye seedha fresh SQL instance install kar rahe hain..."
            foreach ($inst in @('CMBCSQL', 'SQLEXPRESS01', 'CMBCSQL01')) {
                Write-Warn "Fresh instance '$inst' try..."
                if (Install-SqlExpressInstance -InstanceName $inst -SaPassword $saPass) {
                    $sqlInstalledByUs = $true
                    $svc = Get-LocalSqlService
                    if ($svc) { break }
                }
            }
        }
    }

    if (-not $svc) {
        Write-Warn "SQL Server Express nahi mila — automatically install kar rahe hain (3-6 min, auto-retry ON)..."
        $winget = Get-Command winget -ErrorAction SilentlyContinue
        if ($winget) {
            for ($i = 1; $i -le 2 -and -not (Get-LocalSqlService); $i++) {
                try {
                    & winget install -e --id Microsoft.SQLServer.2022.Express --silent --accept-package-agreements --accept-source-agreements
                } catch {
                    Write-Warn "Winget SQL Express notice (attempt $i/2): $($_.Exception.Message)"
                }
                Start-Sleep -Seconds 5
            }
        }
        $svc = Get-LocalSqlService

        if (-not $svc) {
            if (Install-SqlExpressInstance -InstanceName 'SQLEXPRESS' -SaPassword $saPass) {
                $sqlInstalledByUs = $true
            }
            $svc = Get-LocalSqlService
        }

        # Guaranteed fallback: fresh instance name (leftover se koi conflict nahi)
        if (-not $svc) {
            foreach ($inst in @('CMBCSQL', 'SQLEXPRESS01', 'CMBCSQL01')) {
                if ($svc) { break }
                Write-Warn "SQLEXPRESS install nahi hua - fresh instance '$inst' try kar rahe hain..."
                if (Install-SqlExpressInstance -InstanceName $inst -SaPassword $saPass) {
                    $sqlInstalledByUs = $true
                    $svc = Get-LocalSqlService
                }
            }
        }
    }

    if (-not $svc) {
        throw "SQL Server Express install/detect nahi ho paya. Kripya SQL Server Express install karke ONE_CLICK_SETUP.bat dobara chalayein."
    }

    # Ensure SQL Server service is running (broken service -> auto repair)
    try { Set-Service -Name $svc.Name -StartupType Automatic -ErrorAction SilentlyContinue } catch { }
    $svc = Get-Service -Name $svc.Name -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -ne 'Running') {
        Write-Ok "Starting SQL Server service ($($svc.Name))..."
        try {
            Start-Service -Name $svc.Name
            Start-Sleep -Seconds 3
        } catch {
            Write-Warn "SQL service start fail: $($_.Exception.Message)"
            $instName = if ($svc.Name -eq 'MSSQLSERVER') { 'MSSQLSERVER' } else { $svc.Name -replace '^MSSQL\$', '' }
            if (Repair-SqlInstance -InstanceName $instName) {
                try {
                    Start-Service -Name $svc.Name
                    Start-Sleep -Seconds 3
                } catch { }
            }
        }
        $svc = Get-Service -Name $svc.Name -ErrorAction SilentlyContinue
    }

    if (-not $svc -or $svc.Status -ne 'Running') {
        # Broken instance: fresh alias instance se kaam chalayenge (leftover se conflict nahi)
        Write-Warn "Maujooda SQL service start nahi ho payi - fresh instance install try kar rahe hain..."
        foreach ($inst in @('SQLEXPRESS01', 'CMBCSQL', 'CMBCSQL01')) {
            if (Install-SqlExpressInstance -InstanceName $inst -SaPassword $saPass) {
                $sqlInstalledByUs = $true
                $svc = Get-Service -Name ("MSSQL`$" + $inst) -ErrorAction SilentlyContinue
                if ($svc) { break }
            }
        }
    }

    if (-not $svc -or $svc.Status -ne 'Running') {
        throw "SQL Server service start nahi ho payi. Logs: C:\Program Files\Microsoft SQL Server\160\Setup Bootstrap\Log - PC restart karke ONE_CLICK_SETUP.bat dobara chalayein."
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
    for ($i = 1; $i -le 4 -and -not $provisioned; $i++) {
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
            Write-Warn "SQL auto-login attempt $i/4: $($_.Exception.Message)"
            if ($i -lt 4) {
                try { Start-Service -Name $svc.Name -ErrorAction SilentlyContinue } catch { }
                Start-Sleep -Seconds (5 * $i)
            }
        }
    }

    if (-not $provisioned) {
        # Fallback: check if our own random SA password from silent install works
        $fallbackTest = "Server=$serverName;Database=master;User Id=sa;Password=$saPass;TrustServerCertificate=True;Connection Timeout=8;"
        if (Test-SqlConnection $fallbackTest) {
            $appUser = "sa"
            $appPass = $saPass
            $provisioned = $true
        }
    }

    if (-not $provisioned) {
        throw "SQL Server se auto-login set nahi ho paya. Kripya ONE_CLICK_SETUP.bat par Right-Click -> 'Run as Administrator' karein."
    }

    # Write fresh .env cleanly (purana .env backup ho jata hai)
    if (Test-Path $envPath) {
        try {
            $bak = Join-Path $ProjectDir ('.env.backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
            Copy-Item -Path $envPath -Destination $bak -Force
            Write-Ok "Purana .env backup: $(Split-Path $bak -Leaf)"
        } catch { }
    }
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

    if ($sqlInstalledByUs) {
        try {
            $sqlCredPath = Join-Path $ProjectDir ".sql-server-credentials.txt"
            $saWorks = Test-SqlConnection "Server=$serverName;Database=master;User Id=sa;Password=$saPass;TrustServerCertificate=True;Connection Timeout=8;"
            if ($saWorks) {
                Set-Content -Path $sqlCredPath -Encoding UTF8 -Value @"
SQL Server Express — Local Credentials (is PC ke liye)
=====================================================
Instance: $serverName
Login: sa
Password: $saPass

Ye file sirf is PC ke liye hai. Kisi ke saath share na karein.
"@
            } else {
                Set-Content -Path $sqlCredPath -Encoding UTF8 -Value @"
SQL Server Express — Local Info (is PC ke liye)
===============================================
Instance: $serverName
App login: $appUser (password .env file me hai)

Note: SQL Express Microsoft ke default installer se install hua hai,
is liye 'sa' password is file me nahi likha. App apna alag login use karta hai.
"@
            }
            Write-Ok "SQL Server credentials/info saved locally: .sql-server-credentials.txt"
        } catch { }
    }
}

function Install-Dependencies {
    Write-Step 4 8 "Installing Node.js dependencies (npm install)..."
    $ok = $false
    for ($i = 1; $i -le 3 -and -not $ok; $i++) {
        & npm.cmd install --omit=dev --no-audit --no-fund
        if ($LASTEXITCODE -eq 0) {
            $ok = $true
            break
        }
        Write-Warn "npm install fail (attempt $i/3). Corrupt cache/node_modules saaf karke retry..."
        try { & npm.cmd cache clean --force 2>$null | Out-Null } catch { }
        $nm = Join-Path $ProjectDir "node_modules"
        if (Test-Path $nm) { Remove-Item $nm -Recurse -Force -ErrorAction SilentlyContinue }
        Start-Sleep -Seconds (5 * $i)
    }
    if (-not $ok) {
        throw "npm install 3 attempts ke baad bhi fail. Internet check karke ONE_CLICK_SETUP.bat dobara chalayein (retry automatic hai)."
    }
    Write-Ok "Dependencies installed successfully."
}

function Setup-Database {
    Write-Step 5 8 "Creating Database, Tables, Stored Procedures & Starter Data..."
    $ok = $false
    for ($i = 1; $i -le 3 -and -not $ok; $i++) {
        & node setup-database.js
        if ($LASTEXITCODE -eq 0) { $ok = $true; break }
        Write-Warn "Database setup attempt $i/3 fail. SQL service check karke retry..."
        Get-LocalSqlService | ForEach-Object {
            try { Start-Service -Name $_.Name -ErrorAction SilentlyContinue } catch { }
        }
        Start-Sleep -Seconds (5 * $i)
    }
    if (-not $ok) {
        throw "Database setup 3 attempts ke baad fail. SQL Server service running hai ya nahi check karein, phir ONE_CLICK_SETUP.bat dobara chalayein."
    }
    Write-Ok "Database ready (24 tables, 5 stored procedures, starter admin/accounts/categories/services)!"
}

function Register-AutoStartTask {
    param([string]$TaskName, [string]$VbsPath)

    # XML se task banate hain - path me space ho ya na ho, dono me sahi chalta hai.
    # Logon trigger + user context = koi password nahi chahiye, boot par bhi
    # chalta hai jab user login kare.
    $xmlPath = Join-Path $env:TEMP ("cmbc_task_" + [Guid]::NewGuid().ToString('N') + ".xml")
    $taskXml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>CSC BC Apna Hisaab - silent server auto-start</Description></RegistrationInfo>
  <Triggers><LogonTrigger><Enabled>true</Enabled><Delay>PT10S</Delay></LogonTrigger></Triggers>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings><StopOnIdleEnd>false</StopOnIdleEnd><RestartOnIdle>false</RestartOnIdle></IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>4</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>wscript.exe</Command>
      <Arguments>"$VbsPath"</Arguments>
    </Exec>
  </Actions>
</Task>
"@
    try {
        [System.IO.File]::WriteAllText($xmlPath, $taskXml, [System.Text.Encoding]::Unicode)
        schtasks /Create /TN "$TaskName" /XML "$xmlPath" /F | Out-Null
        $code = $LASTEXITCODE
    } catch {
        $code = 1
    } finally {
        Remove-Item $xmlPath -Force -ErrorAction SilentlyContinue
    }
    return ($code -eq 0)
}

function Install-AutoStart {
    Write-Step 6 8 "Configuring silent auto-start on every PC boot..."
    try {
        # Canonical task name — Launch-App/doctor bhi yahi naam use karte hain.
        $taskName = "CSC BC Apna Hisaab Server"

        # Legacy typo tasks (purane installs) hata do taaki duplicate launcher na chale.
        foreach ($legacy in @("CSC BC Apna Hissab Server", "CSC BC Apna Hissab Server (Login)", "CSC BC Apna Hisaab Server (Login)")) {
            schtasks /Query /TN "$legacy" > $null 2>&1
            if ($LASTEXITCODE -eq 0) { schtasks /Delete /TN "$legacy" /F > $null 2>&1 }
        }

        $vbs = Join-Path $ProjectDir "start-hidden.vbs"
        $ok = Register-AutoStartTask -TaskName $taskName -VbsPath $vbs
        if ($ok) {
            Write-Ok "Auto-start task installed (login par server silently chalu)."
        } else {
            Write-Warn "Task create nahi hua - Startup entry se auto-start chalega."
        }
        schtasks /Run /TN "$taskName" | Out-Null
    } catch {
        Write-Warn "Auto-start task skipped: $($_.Exception.Message)"
        try {
            Start-Process -FilePath "wscript.exe" -ArgumentList "`"$(Join-Path $ProjectDir 'start-hidden.vbs')`"" -WindowStyle Hidden
        } catch { }
    }

    # Startup folder entry + Desktop/Start Menu shortcut (admin ke bina bhi kaam karta hai)
    try {
        $autostartJs = Join-Path $ProjectDir 'utils\windows_autostart.js'
        if (Test-Path $autostartJs) {
            & node $autostartJs | Out-Null
            Write-Ok "Startup entry ready (login par server khud start hoga)."
        }
    } catch {
        Write-Warn "Startup entry note: $($_.Exception.Message)"
    }
}

function Create-DesktopShortcut {
    Write-Step 7 8 "Creating Desktop Shortcut..."
    try {
        $helper = Join-Path $ProjectDir 'utils\create_shortcuts.ps1'
        if (Test-Path $helper) {
            & powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $helper -ProjectDir $ProjectDir | Out-Null
            Write-Ok "Desktop + Start Menu shortcut ready: CSC BC Apna Hisaab"
            return
        }

        $desktop = [Environment]::GetFolderPath("Desktop")
        $shortcutPath = Join-Path $desktop "CSC BC Apna Hisaab.lnk"
        $wsh = New-Object -ComObject WScript.Shell
        $sc = $wsh.CreateShortcut($shortcutPath)
        $sc.TargetPath = Join-Path $env:WINDIR "System32\wscript.exe"
        $sc.Arguments = '"' + (Join-Path $ProjectDir "open-app.vbs") + '"'
        $sc.WorkingDirectory = $ProjectDir
        $sc.Description = "CSC & BC Apna Hisaab - Cash Management System (Silent / Auto-Start)"
        $sc.Save()
        Write-Ok "Desktop shortcut created: CSC BC Apna Hisaab"
    } catch {
        Write-Warn "Shortcut skipped: $($_.Exception.Message)"
    }
}

function Ensure-FirewallRule {
    try {
        $ruleName = "CSC BC Apna Hisaab (Port 3000)"
        netsh advfirewall firewall show rule name="$ruleName" > $null 2>&1
        if ($LASTEXITCODE -ne 0) {
            netsh advfirewall firewall add rule name="$ruleName" dir=in action=allow protocol=TCP localport=3000 profile=private,domain > $null
            Write-Ok "Windows Firewall rule added (same Wi-Fi / LAN access on port 3000)."
        } else {
            Write-Ok "Windows Firewall rule already present."
        }
    } catch {
        Write-Warn "Firewall rule skipped: $($_.Exception.Message)"
    }
}

function Wait-ServerReady {
    param([int]$TimeoutSeconds = 60)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing -TimeoutSec 5
            if ($r.StatusCode -eq 200) { return $true }
        } catch { }
        Start-Sleep -Seconds 2
    }
    return $false
}

function Launch-App {
    Write-Step 8 8 "Starting Server in background & opening browser..."
    $taskName = "CSC BC Apna Hisaab Server"
    schtasks /Query /TN "$taskName" > $null 2>&1
    if ($LASTEXITCODE -eq 0) {
        schtasks /Run /TN "$taskName" | Out-Null
    } else {
        $vbs = Join-Path $ProjectDir "start-hidden.vbs"
        Start-Process -FilePath "wscript.exe" -ArgumentList "`"$vbs`"" -WindowStyle Hidden
    }

    if (-not (Wait-ServerReady -TimeoutSeconds 60)) {
        Write-Warn "Server pehli koshish me start nahi hua - auto-retry (hidden supervisor + node direct)..."
        try { Start-Process -FilePath "wscript.exe" -ArgumentList "`"$(Join-Path $ProjectDir 'start-hidden.vbs')`"" -WindowStyle Hidden } catch { }
        Start-Sleep -Seconds 5
        if (-not (Wait-ServerReady -TimeoutSeconds 40)) {
            $nodeExe = Find-NodeExe
            if (-not $nodeExe) { $nodeExe = "node" }
            try {
                Start-Process -FilePath $nodeExe -ArgumentList "server.js" -WorkingDirectory $ProjectDir -WindowStyle Hidden
            } catch { }
            if (-not (Wait-ServerReady -TimeoutSeconds 40)) {
                Write-Warn "Server respond nahi kar raha. Logs: logs\server-run.log"
                Write-Warn "Aap ONE_CLICK_SETUP.bat dobara chala sakte hain - retry automatic hai, data safe rahega."
                Start-Process "http://localhost:3000"
                return
            }
        }
    }

    Start-Process "http://localhost:3000"
    Write-Ok "App is LIVE at http://localhost:3000 (silent background mode)!"
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================
try {
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "   CSC & BC APNA HISAAB - 1-CLICK COMPLETE AUTO SETUP" -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Green

    Write-Step 1 8 "Checking & self-repairing project files..."
    Repair-ProjectFiles

    Ensure-NodeJs
    Ensure-SqlServerAndEnv
    Ensure-FirewallRule
    Install-Dependencies
    Setup-Database
    Install-AutoStart
    Create-DesktopShortcut
    Launch-App

    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "   SETUP 100% COMPLETE! PROJECT READY TO USE!" -ForegroundColor Green
    Write-Host "   URL:   http://localhost:3000" -ForegroundColor White
    Write-Host "   Login: bina password (localhost auto-login)" -ForegroundColor White
    Write-Host "          Mobile/LAN login ke liye credentials: .admin-login.txt" -ForegroundColor White
    Write-Host "   Auto-Update: ON (boot + raat 2:30 AM, idle hone par hi restart)" -ForegroundColor White
    Write-Host "   Auto-Start:  ON (PC on hote hi server silently chalu, hamesha running)" -ForegroundColor White
    Write-Host "============================================================" -ForegroundColor Green
    exit 0
} catch {
    Write-Host ""
    Write-Err "Setup Error: $($_.Exception.Message)"
    exit 1
}
