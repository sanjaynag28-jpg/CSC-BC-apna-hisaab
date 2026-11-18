param(
    [string]$InstanceName = 'CMBCSQL'
)

$ErrorActionPreference = 'Continue'
$Desktop = [Environment]::GetFolderPath('Desktop')
$LogPath = Join-Path $Desktop 'SQL_FIX_LOG.txt'

function Write-Log {
    param([string]$Message, [string]$Level = 'INFO')
    $line = "[{0}] [{1}] {2}" -f (Get-Date -Format 'HH:mm:ss'), $Level, $Message
    Write-Host $line
    try { Add-Content -Path $LogPath -Value $line -Encoding UTF8 } catch { }
}

try { Remove-Item $LogPath -Force -ErrorAction SilentlyContinue } catch { }

Write-Log '================================================================='
Write-Log ' CSC & BC APNA HISAAB - SQL SERVER SELF-REPAIR TOOL'
Write-Log '================================================================='
Write-Log ("OS: " + [System.Environment]::OSVersion.VersionString)
Write-Log ("PowerShell: " + $PSVersionTable.PSVersion)
Write-Log ("User: " + $env:USERNAME)
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Log ("Administrator: " + $isAdmin)
if (-not $isAdmin) {
    Write-Log 'Administrator rights nahi hain. File par Right-Click -> Run as administrator karein.' 'ERROR'
    Write-Log ("LOG FILE: " + $LogPath)
    Read-Host 'Enter dabayein band karne ke liye'
    exit 1
}

function Invoke-SqlSetup {
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
    $start = Get-Date
    while (-not $p.HasExited) {
        Start-Sleep -Seconds 20
        $elapsed = [int]((Get-Date) - $start).TotalSeconds
        if ($elapsed -gt ($TimeoutMinutes * 60)) {
            Write-Log ("  " + $Label + " timeout - process band kar rahe hain.") 'WARN'
            try { $p.Kill() } catch { }
            break
        }
        $tail = ''
        if (Test-Path $stdout) {
            $tail = ((Get-Content $stdout -Tail 2 -ErrorAction SilentlyContinue) -join ' | ')
        }
        if ($tail) {
            Write-Log ("  " + $Label + " chal raha hai... " + $elapsed + "s | " + $tail)
        } else {
            Write-Log ("  " + $Label + " chal raha hai... " + $elapsed + "s (download/install jaari hai - window band na karein)")
        }
    }

    foreach ($f in @($stdout, $stderr)) {
        if (Test-Path $f) {
            Get-Content $f -ErrorAction SilentlyContinue | ForEach-Object {
                if ($_ -and $_.Trim()) { Add-Content -Path $OutLog -Value $_ -Encoding UTF8 }
            }
        }
    }
    return $p.ExitCode
}

# ---------------------------------------------------------------------------
# 1) DIAGNOSTICS
# ---------------------------------------------------------------------------
Write-Log '--- 1) Diagnostics ---'
$sqlServices = @(Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'MSSQLSERVER' -or $_.Name -like 'MSSQL$*' })
if ($sqlServices.Count -eq 0) {
    Write-Log 'SQL Server service: koi nahi mili (fresh install chahiye)'
} else {
    foreach ($s in $sqlServices) { Write-Log ("Service: " + $s.Name + " | " + $s.Status + " | " + $s.StartType) }
}

$roots = @((Join-Path $env:ProgramFiles 'Microsoft SQL Server'))
if (${env:ProgramFiles(x86)}) { $roots += (Join-Path ${env:ProgramFiles(x86)} 'Microsoft SQL Server') }
$instanceDirs = @()
foreach ($r in $roots) {
    if (-not (Test-Path $r)) { continue }
    Get-ChildItem -Path $r -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_.Name -match '^MSSQL\d+\.(.+)$') {
            $inst = $Matches[1]
            $master = Join-Path $_.FullName 'MSSQL\DATA\master.mdf'
            Write-Log ("Instance folder: " + $_.Name + " | master.mdf: " + (Test-Path $master))
            $instanceDirs += [pscustomobject]@{ Instance = $inst; Path = $_.FullName }
        }
    }
}

$instKey = 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL'
if (Test-Path $instKey) {
    $props = Get-ItemProperty -Path $instKey -ErrorAction SilentlyContinue
    foreach ($p in $props.PSObject.Properties) {
        if ($p.Name -notlike 'PS*') { Write-Log ("Registry instance: " + $p.Name + " -> " + $p.Value) }
    }
} else {
    Write-Log 'Registry instance list nahi mili.'
}

try {
    $drive = Get-PSDrive -Name C -ErrorAction Stop
    Write-Log ("C: free space: " + [math]::Round($drive.Free / 1GB, 2) + " GB")
} catch { }

$bootLog = Join-Path $env:ProgramFiles 'Microsoft SQL Server\160\Setup Bootstrap\Log'
if (Test-Path $bootLog) {
    $latest = Get-ChildItem -Path $bootLog -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
    if ($latest) {
        Write-Log ("Latest setup log: " + $latest.FullName)
        $summary = Join-Path $latest.FullName 'Summary.txt'
        if (Test-Path $summary) {
            Write-Log '--- Summary.txt (last 25 lines) ---'
            Get-Content $summary -Tail 25 -ErrorAction SilentlyContinue | ForEach-Object { Write-Log ("  " + $_) }
        }
    }
}

# ---------------------------------------------------------------------------
# 2) STOP SQL / SETUP PROCESSES
# ---------------------------------------------------------------------------
Write-Log '--- 2) Purane SQL processes band kar rahe hain ---'
foreach ($s in $sqlServices) {
    try {
        if ($s.Status -eq 'Running') {
            Stop-Service -Name $s.Name -Force -ErrorAction SilentlyContinue
            Write-Log ("Stopped service: " + $s.Name)
        }
    } catch { Write-Log ("Service stop note: " + $_.Exception.Message) 'WARN' }
}
foreach ($procName in @('setup', 'sqlservr', 'SqlSetup', 'SQLServerManager16')) {
    Get-Process -Name $procName -ErrorAction SilentlyContinue | ForEach-Object {
        try { $_.Kill(); Write-Log ("Killed process: " + $procName + " (" + $_.Id + ")") } catch { }
    }
}
Start-Sleep -Seconds 3

# ---------------------------------------------------------------------------
# 3) CLEAN BROKEN LEFTOVERS (only instances without a service)
# ---------------------------------------------------------------------------
Write-Log '--- 3) Adhoore SQL leftovers saaf kar rahe hain ---'
$existingServiceNames = @($sqlServices | ForEach-Object { $_.Name })
$cleaned = @()
foreach ($item in $instanceDirs) {
    $svcName = if ($item.Instance -eq 'MSSQLSERVER') { 'MSSQLSERVER' } else { "MSSQL`$" + $item.Instance }
    if ($existingServiceNames -contains $svcName) {
        Write-Log ("Skip (service maujood hai): " + $item.Instance)
        continue
    }

    Write-Log ("Cleanup instance: " + $item.Instance + " -> " + $item.Path)
    try {
        $setupExe = Get-ChildItem -Path (Join-Path $env:ProgramFiles 'Microsoft SQL Server\160\Setup Bootstrap') -Filter 'setup.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($setupExe) {
            Write-Log '  Silent uninstall try (max 3 min)...'
            $p = Start-Process -FilePath $setupExe.FullName -ArgumentList "/Action=Uninstall /InstanceName=$($item.Instance) /FEATURES=SQLENGINE /Quiet /IACCEPTSQLSERVERLICENSETERMS" -Wait -PassThru
            Write-Log ("  Uninstall exit code: " + $p.ExitCode)
        }
    } catch { Write-Log ("  Uninstall note: " + $_.Exception.Message) 'WARN' }

    if (Test-Path $item.Path) {
        try {
            Write-Log '  Permissions le rahe hain (takeown/icacls)...'
            & takeown.exe /F $item.Path /R /D Y 2>&1 | Out-Null
            & icacls.exe $item.Path /grant '*S-1-5-32-544:(OI)(CI)F' /T /C 2>&1 | Out-Null
            Remove-Item -LiteralPath $item.Path -Recurse -Force -ErrorAction Stop
            Write-Log '  Folder deleted: OK'
            $cleaned += $item.Instance
        } catch {
            Write-Log ("  Folder delete FAIL: " + $_.Exception.Message) 'WARN'
        }
    }
}

# Registry cleanup for cleaned instances
foreach ($inst in $cleaned) {
    foreach ($root in @('HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Microsoft SQL Server')) {
        $namesKey = Join-Path $root 'Instance Names\SQL'
        if (-not (Test-Path $namesKey)) { continue }
        $id = $null
        try { $id = (Get-ItemProperty -Path $namesKey -Name $inst -ErrorAction Stop).$inst } catch { }
        if ($id) {
            try { Remove-ItemProperty -Path $namesKey -Name $inst -Force -ErrorAction Stop } catch { }
            $k = Join-Path $root $id
            if (Test-Path $k) { try { Remove-Item $k -Recurse -Force -ErrorAction Stop } catch { } }
            Write-Log ("  Registry cleaned: " + $inst)
        }
    }
}

# ---------------------------------------------------------------------------
# 4) INSTALL FRESH INSTANCE (conflict-free name)
# ---------------------------------------------------------------------------
Write-Log '--- 4) Fresh SQL Server Express instance install ---'
$saPass = 'CmBc@' + ([Guid]::NewGuid().ToString('N').Substring(0, 16))
$installerUrl = 'https://go.microsoft.com/fwlink/p/?linkid=2216019'
$exe = Join-Path $env:TEMP 'SQL2022-SSEI-Expr-fix.exe'

$downloaded = $false
for ($i = 1; $i -le 5 -and -not $downloaded; $i++) {
    try {
        Write-Log ("  Download attempt " + $i + "/5...")
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        if (Test-Path $exe) { Remove-Item $exe -Force -ErrorAction SilentlyContinue }
        Invoke-WebRequest -Uri $installerUrl -OutFile $exe -UseBasicParsing -TimeoutSec 300
        if ((Test-Path $exe) -and (Get-Item $exe).Length -gt 1048576) { $downloaded = $true }
    } catch {
        Write-Log ("  Download fail: " + $_.Exception.Message) 'WARN'
        Start-Sleep -Seconds (3 * $i)
    }
}

$installed = $false
if ($downloaded) {
    $setupOutLog = Join-Path $env:TEMP ('cmbc_sql_install_' + $InstanceName + '.log')

    # METHOD 1: SSEI + configuration file (SSEI /SAPWD etc. nahi leta)
    try {
        $cfgPath = Join-Path $env:TEMP ('cmbc_sql_' + $InstanceName + '.ini')
        $cfg = @"
[OPTIONS]
ACTION="Install"
QUIET="True"
FEATURES=SQLENGINE
INSTANCENAME="$InstanceName"
SECURITYMODE="SQL"
SAPWD="$saPass"
TCPENABLED="1"
NPENABLED="0"
IACCEPTSQLSERVERLICENSETERMS="True"
SQLSYSADMINACCOUNTS="BUILTIN\Administrators"
"@
        Set-Content -Path $cfgPath -Value $cfg -Encoding ASCII
        Write-Log ('  Method 1: configuration file install (instance ' + $InstanceName + ')...')
        $rc = Invoke-SqlSetup -Exe $exe -SetupArgs @('/Action=Install', '/Quiet', '/IAcceptSqlServerLicenseTerms', ('/ConfigurationFile="' + $cfgPath + '"')) -OutLog $setupOutLog -Label 'Method 1 (config file)'
        Write-Log ('  Config-file install exit code: ' + $rc)
    } catch {
        Write-Log ('  Config-file method error: ' + $_.Exception.Message) 'WARN'
    }

    # METHOD 2: SSEI default install (Microsoft khud naya instance name chunta hai)
    $existing = @(Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'MSSQLSERVER' -or $_.Name -like 'MSSQL$*' })
    if ($existing.Count -eq 0) {
        try {
            Write-Log '  Method 2: Microsoft default Express install (auto instance name)...'
            $rc = Invoke-SqlSetup -Exe $exe -SetupArgs @('/Action=Install', '/Quiet', '/IAcceptSqlServerLicenseTerms') -OutLog $setupOutLog -Label 'Method 2 (default install)'
            Write-Log ('  Default install exit code: ' + $rc)
        } catch {
            Write-Log ('  Default install error: ' + $_.Exception.Message) 'WARN'
        }
    }

    # METHOD 3: media download + setup.exe (full args)
    $existing = @(Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'MSSQLSERVER' -or $_.Name -like 'MSSQL$*' })
    if ($existing.Count -eq 0) {
        $mediaPath = Join-Path $env:TEMP ('cmbc_sql_media_' + $InstanceName)
        try {
            if (Test-Path $mediaPath) { Remove-Item $mediaPath -Recurse -Force -ErrorAction SilentlyContinue }
            New-Item -ItemType Directory -Force -Path $mediaPath | Out-Null
            Write-Log '  Method 3: SQL media download (approx 250-300 MB)...'
            $rc = Invoke-SqlSetup -Exe $exe -SetupArgs @('/Action=Download', '/Quiet', ('/MediaPath="' + $mediaPath + '"'), '/MediaType=Express') -OutLog $setupOutLog -Label 'Method 3 (media download)'
            Write-Log ('  Media download exit code: ' + $rc)

            $setupExe = Get-ChildItem -Path $mediaPath -Filter 'setup.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($setupExe) {
                $setupArgs = @(
                    '/Action=Install', '/Quiet', '/IACCEPTSQLSERVERLICENSETERMS', '/FEATURES=SQLENGINE',
                    "/InstanceName=$InstanceName", '/SECURITYMODE=SQL', "/SAPWD=$saPass",
                    '/TCPENABLED=1', '/NPENABLED=0', '/SQLSYSADMINACCOUNTS=BUILTIN\Administrators',
                    '/SkipRules=RebootRequiredCheck'
                )
                Write-Log ('  setup.exe install start (instance ' + $InstanceName + ')...')
                $rc = Invoke-SqlSetup -Exe $setupExe.FullName -SetupArgs $setupArgs -OutLog $setupOutLog -Label 'Method 3 (setup.exe install)'
                Write-Log ('  setup.exe exit code: ' + $rc)
            } else {
                Write-Log '  Media me setup.exe nahi mila.' 'WARN'
            }
        } catch {
            Write-Log ('  Media method error: ' + $_.Exception.Message) 'WARN'
        }
    }

    # Service register hone ka intezaar (3 min tak)
    for ($w = 1; $w -le 36; $w++) {
        $svc = Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'MSSQLSERVER' -or $_.Name -like 'MSSQL$*' } | Select-Object -First 1
        if ($svc) {
            try { Set-Service -Name $svc.Name -StartupType Automatic -ErrorAction SilentlyContinue } catch { }
            try {
                if ((Get-Service -Name $svc.Name).Status -ne 'Running') { Start-Service -Name $svc.Name; Start-Sleep -Seconds 3 }
            } catch { }
            if ((Get-Service -Name $svc.Name -ErrorAction SilentlyContinue).Status -eq 'Running') {
                $installed = $true
                break
            }
        }
        Start-Sleep -Seconds 5
    }
    Write-Log ('  SQL install log: ' + $setupOutLog)
    try { Remove-Item $exe -Force -ErrorAction SilentlyContinue } catch { }
} else {
    Write-Log 'Installer download nahi hua - internet check karein.' 'ERROR'
}

# ---------------------------------------------------------------------------
# 5) RESULT
# ---------------------------------------------------------------------------
Write-Log '--- 5) Result ---'
$finalSvc = Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'MSSQLSERVER' -or $_.Name -like 'MSSQL$*' } | Where-Object { $_.Status -eq 'Running' } | Select-Object -First 1
if ($finalSvc) {
    $actualInstance = if ($finalSvc.Name -eq 'MSSQLSERVER') { 'MSSQLSERVER' } else { $finalSvc.Name -replace '^MSSQL\$', '' }
    $serverName = if ($finalSvc.Name -eq 'MSSQLSERVER') { 'localhost' } else { 'localhost\' + $actualInstance }
    Write-Log ("SUCCESS: SQL instance '" + $actualInstance + "' chal raha hai.") 'OK'
    Write-Log ("Server name: " + $serverName)
    try {
        Set-Content -Path (Join-Path $Desktop 'SQL_INSTANCE_INFO.txt') -Encoding UTF8 -Value @"
SQL Server Express - is PC par
===============================
Instance: $serverName
Service: $($finalSvc.Name)

Ab SETUP.bat dobara chalayein - wo is instance ko detect karke .env bana dega.
"@
    } catch { }
    Write-Log ("Info file: " + (Join-Path $Desktop 'SQL_INSTANCE_INFO.txt'))
    $code = 0
} else {
    Write-Log 'FAIL: SQL instance abhi bhi start nahi ho paya.' 'ERROR'
    Write-Log 'Log file bhejein (is file ka poora content): '
    Write-Log ("  " + $LogPath)
    $code = 1
}

Write-Log ("LOG FILE: " + $LogPath)
Write-Host ''
Read-Host 'Enter dabayein band karne ke liye'
exit $code
