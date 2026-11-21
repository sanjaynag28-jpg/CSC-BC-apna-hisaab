param(
    [string]$ProjectDir = ''
)

# ============================================================================
# CSC & BC Apna Hisaab - DOCTOR (self-diagnose + auto-fix)
# - PC restart ke baad server start na ho to ye sab check karke theek karta hai
# - Log Desktop par: CSC_DOCTOR_LOG.txt
# - Koi technical knowledge ki zaroorat nahi: bas chalao aur wait karo
# ============================================================================

$ErrorActionPreference = 'Continue'
$Desktop = [Environment]::GetFolderPath('Desktop')
$LogPath = Join-Path $Desktop 'CSC_DOCTOR_LOG.txt'
$ToolLog = Join-Path $env:TEMP 'cmbc_doctor_tool.log'

function Write-Log {
    param([string]$Message, [string]$Level = 'INFO')
    $line = "[{0}] [{1}] {2}" -f (Get-Date -Format 'HH:mm:ss'), $Level, $Message
    Write-Host $line
    try { Add-Content -Path $LogPath -Value $line -Encoding UTF8 } catch { }
}

try { Remove-Item $LogPath -Force -ErrorAction SilentlyContinue } catch { }

Write-Log '================================================================='
Write-Log ' CSC & BC APNA HISAAB - DOCTOR (auto diagnose + fix)'
Write-Log '================================================================='
Write-Log ("Windows: " + [System.Environment]::OSVersion.VersionString)
Write-Log ("PowerShell: " + $PSVersionTable.PSVersion)
Write-Log ("User: " + $env:USERNAME)

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Log ("Administrator: " + $isAdmin)
Write-Log ''

# ---------------------------------------------------------------------------
# 1) PROJECT FOLDER DHUNDO
# ---------------------------------------------------------------------------
Write-Log '--- 1) Project folder ---'
$candidates = @()
if ($ProjectDir) { $candidates += $ProjectDir }
try {
    $parentDir = Split-Path -Parent $PSScriptRoot
    if ($parentDir -and (Test-Path $parentDir)) { $candidates += $parentDir }
} catch { }
$candidates += (Join-Path $env:USERPROFILE 'CSC-BC-Apna-Hisaab')
$candidates += 'C:\CSC-BC-Apna-Hisaab'
$candidates += (Join-Path $env:USERPROFILE 'Documents\CSC-BC-Apna-Hisaab')

try {
    $ws = New-Object -ComObject WScript.Shell
    $shortcutPath = Join-Path $Desktop 'CSC BC Apna Hissab.lnk'
    if (Test-Path $shortcutPath) {
        $sc = $ws.CreateShortcut($shortcutPath)
        if ($sc.Arguments) {
            $m = [regex]::Match($sc.Arguments, '"([^"]+\.vbs)"')
            if ($m.Success) { $candidates += (Split-Path -Parent $m.Groups[1].Value) }
        }
        if ($sc.WorkingDirectory) { $candidates += $sc.WorkingDirectory }
    }
} catch { }

$proj = $null
foreach ($c in $candidates) {
    if ([string]::IsNullOrWhiteSpace($c)) { continue }
    if (Test-Path (Join-Path $c 'server.js')) { $proj = (Resolve-Path $c).Path; break }
}

if (-not $proj) {
    Write-Log 'Project folder nahi mila (server.js missing).' 'ERROR'
    Write-Log 'Matlab installation adhoora hai - SETUP.bat chalayein:'
    Write-Log '  https://github.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/releases/latest/download/SETUP.bat'
    Write-Log ("LOG FILE: " + $LogPath)
    exit 2
}

Write-Log ("Project: " + $proj)
$env:Path = $env:Path

# ---------------------------------------------------------------------------
# 2) CHECKS
# ---------------------------------------------------------------------------
Write-Log ''
Write-Log '--- 2) Checks ---'

$nodeExe = $null
$nodeVer = $null
try { $nodeVer = (& node -v) 2>$null } catch { }
if ($nodeVer) {
    $nodeExe = 'node'
} elseif (Test-Path 'C:\Program Files\nodejs\node.exe') {
    $nodeExe = 'C:\Program Files\nodejs\node.exe'
    $nodeVer = (& $nodeExe -v) 2>$null
}
Write-Log ("Node.js: " + $(if ($nodeVer) { $nodeVer } else { 'NAHI MILA' }))

$envFile = Join-Path $proj '.env'
Write-Log (".env file: " + $(if (Test-Path $envFile) { 'hai' } else { 'NAHI HAI (SETUP.bat chahiye)' }))
if (Test-Path $envFile) {
    try {
        $envLines = Get-Content $envFile -ErrorAction SilentlyContinue
        foreach ($key in @('DB_SERVER', 'DB_NAME', 'DB_USER')) {
            $line = $envLines | Where-Object { $_ -match ("^" + $key + "=") } | Select-Object -First 1
            if ($line) { Write-Log ("  " + $line) } else { Write-Log ("  " + $key + "= (missing)") 'WARN' }
        }
    } catch { }
}

Write-Log ("node_modules: " + $(if (Test-Path (Join-Path $proj 'node_modules')) { 'hai' } else { 'NAHI HAI' }))

$sqlServices = @(Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'MSSQLSERVER' -or $_.Name -like 'MSSQL$*' })
if ($sqlServices.Count -eq 0) {
    Write-Log 'SQL Server service: koi nahi mili (SQL install chahiye - SETUP.bat / SQL_FIX.bat)' 'WARN'
} else {
    foreach ($s in $sqlServices) { Write-Log ("SQL service: " + $s.Name + " = " + $s.Status) }
}

function Test-ServerPort {
    $c = @(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)
    if ($c.Count -gt 0) { return $true }
    $n = (netstat -ano | Select-String ':3000\s' | Select-String 'LISTENING')
    return [bool]$n
}

function Test-AppHealth {
    try {
        $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/health' -UseBasicParsing -TimeoutSec 8
        return ('OK ' + $r.StatusCode)
    } catch {
        $resp = $_.Exception.Response
        if ($resp) { return ('HTTP ' + [int]$resp.StatusCode) }
        return $null
    }
}

Write-Log ("Port 3000: " + $(if (Test-ServerPort) { 'LISTENING' } else { 'BAND' }))
$health = Test-AppHealth
Write-Log ("App health: " + $(if ($health) { $health } else { 'koi jawab nahi' }))

$startupVbs = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\CSC BC Apna Hisaab (Auto).vbs'
$hiddenVbs = Join-Path $proj 'start-hidden.vbs'
$supervisorBat = Join-Path $proj 'server-supervisor.bat'
$openAppVbs = Join-Path $proj 'open-app.vbs'

Write-Log ("start-hidden.vbs: " + $(if (Test-Path $hiddenVbs) { 'hai' } else { 'NAHI HAI' }))
Write-Log ("server-supervisor.bat: " + $(if (Test-Path $supervisorBat) { 'hai' } else { 'NAHI HAI' }))
Write-Log ("Startup entry: " + $(if (Test-Path $startupVbs) { 'hai' } else { 'NAHI HAI' }))

try {
    $runVal = (Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'CSC BC Apna Hissab' -ErrorAction Stop).'CSC BC Apna Hissab'
    Write-Log ("Run key: " + $runVal)
} catch {
    Write-Log 'Run key: NAHI HAI' 'WARN'
}

foreach ($taskName in @('CSC BC Apna Hissab Server', 'CSC BC Apna Hissab Server (Login)')) {
    schtasks /Query /TN "$taskName" > $null 2>&1
    if ($LASTEXITCODE -eq 0) {
        $detail = (schtasks /Query /TN "$taskName" /FO LIST /V 2>$null | Select-String 'Task To Run|Status|Last Result')
        Write-Log ("Task '" + $taskName + "': hai")
        foreach ($d in $detail) { Write-Log ("  " + ($d.Line -replace '\s+', ' ').Trim()) }
    } else {
        Write-Log ("Task '" + $taskName + "': NAHI HAI") 'WARN'
    }
}

$runLog = Join-Path $proj 'logs\server-run.log'
if (Test-Path $runLog) {
    Write-Log 'Last server log lines:'
    Get-Content $runLog -Tail 12 -ErrorAction SilentlyContinue | ForEach-Object { Write-Log ('  ' + $_) }
} else {
    Write-Log 'logs\server-run.log: abhi tak nahi bana (server kabhi start nahi hua)' 'WARN'
}

# ---------------------------------------------------------------------------
# 3) AUTO-FIX
# ---------------------------------------------------------------------------
Write-Log ''
Write-Log '--- 3) Auto-fix ---'

$rawBase = 'https://raw.githubusercontent.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/main/'
foreach ($pair in @(
        @{ Name = 'start-hidden.vbs'; Url = ($rawBase + 'start-hidden.vbs') },
        @{ Name = 'server-supervisor.bat'; Url = ($rawBase + 'server-supervisor.bat') },
        @{ Name = 'open-app.vbs'; Url = ($rawBase + 'open-app.vbs') }
    )) {
    $target = Join-Path $proj $pair.Name
    if (Test-Path $target) { continue }
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $pair.Url -OutFile $target -UseBasicParsing -TimeoutSec 60
        Write-Log ("Repaired missing file: " + $pair.Name) 'OK'
    } catch {
        Write-Log ("Download fail (" + $pair.Name + "): " + $_.Exception.Message) 'WARN'
    }
}

# 3a) SQL service start
$sqlServices = @(Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'MSSQLSERVER' -or $_.Name -like 'MSSQL$*' })
foreach ($s in $sqlServices) {
    if ($s.Status -ne 'Running') {
        try {
            Start-Service -Name $s.Name -ErrorAction Stop
            Write-Log ("SQL service started: " + $s.Name) 'OK'
        } catch {
            Write-Log ("SQL service start fail (" + $s.Name + "): " + $_.Exception.Message) 'WARN'
        }
    }
}

# 3b) Startup entry + Run key + shortcuts (project ka helper)
$autostartJs = Join-Path $proj 'utils\windows_autostart.js'
if ($nodeExe -and (Test-Path $autostartJs)) {
    try {
        & $nodeExe $autostartJs | Out-Null
        Write-Log 'Startup entry / Run key / shortcuts checked (windows_autostart.js).' 'OK'
    } catch {
        Write-Log ("Autostart helper note: " + $_.Exception.Message) 'WARN'
    }
} else {
    # Fallback: khud startup VBS + run key banao
    try {
        $startupDir = Split-Path -Parent $startupVbs
        if (-not (Test-Path $startupDir)) { New-Item -ItemType Directory -Force -Path $startupDir | Out-Null }
        $vbsContent = @(
            "' CSC & BC Apna Hisaab - silent auto-start",
            'Option Explicit',
            'Dim sh, hiddenLauncher',
            ('hiddenLauncher = "' + $hiddenVbs + '"'),
            'Set sh = CreateObject("WScript.Shell")',
            'sh.Run "wscript.exe """ & hiddenLauncher & """", 0, False',
            ''
        ) -join "`r`n"
        Set-Content -Path $startupVbs -Value $vbsContent -Encoding ASCII
        $runKeyPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
        if (-not (Test-Path $runKeyPath)) { New-Item -Path $runKeyPath -Force | Out-Null }
        Set-ItemProperty -Path $runKeyPath -Name 'CSC BC Apna Hissab' -Value ('"' + (Join-Path $env:WINDIR 'System32\wscript.exe') + '" "' + $hiddenVbs + '"')
        Write-Log 'Startup entry + Run key manually banaye.' 'OK'
    } catch {
        Write-Log ("Startup entry banane me problem: " + $_.Exception.Message) 'WARN'
    }
}

# 3c) Login task (XML se - path me space ho to bhi sahi chalta hai)
if (Test-Path $hiddenVbs) {
    try {
        $taskName = 'CSC BC Apna Hissab Server (Login)'
        $xmlPath = Join-Path $env:TEMP 'cmbc_login_task.xml'
        $taskXml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>CSC BC Apna Hisaab - silent server start at login</Description></RegistrationInfo>
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
      <Arguments>"$hiddenVbs"</Arguments>
    </Exec>
  </Actions>
</Task>
"@
        [System.IO.File]::WriteAllText($xmlPath, $taskXml, [System.Text.Encoding]::Unicode)
        schtasks /Create /TN "$taskName" /XML "$xmlPath" /F > $null 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Log ("Login task ready: " + $taskName) 'OK'
        } else {
            Write-Log 'Login task create fail (task scheduler permission). Startup entry phir bhi kaam karegi.' 'WARN'
        }
    } catch {
        Write-Log ("Login task note: " + $_.Exception.Message) 'WARN'
    }
}

# ---------------------------------------------------------------------------
# 4) SERVER START + VERIFY
# ---------------------------------------------------------------------------
Write-Log ''
Write-Log '--- 4) Server start + verify ---'

if (Test-ServerPort) {
    Write-Log 'Server pehle se chal raha hai - start ki zaroorat nahi.' 'OK'
} else {
    $setupPs1 = Join-Path $proj 'scripts\auto_setup_windows.ps1'
    if ((-not $nodeExe -or -not (Test-Path (Join-Path $proj '.env')) -or -not (Test-Path (Join-Path $proj 'node_modules'))) -and (Test-Path $setupPs1)) {
        Write-Log 'Node.js, .env ya node_modules missing hai — Auto-Setup se theek kiya ja raha hai...' 'WARN'
        try {
            & powershell -NoProfile -ExecutionPolicy Bypass -File $setupPs1
            # Refresh node status after auto-setup
            try { $nodeVer = (& node -v) 2>$null; if ($nodeVer) { $nodeExe = 'node' } } catch { }
        } catch {
            Write-Log ("Auto-Setup warning: " + $_.Exception.Message) 'WARN'
        }
    }

    if (-not $nodeExe) {
        Write-Log 'Node.js nahi hai — ONE_CLICK_SETUP.bat chalayein.' 'ERROR'
    } elseif (-not (Test-Path (Join-Path $proj '.env'))) {
        Write-Log '.env nahi hai — ONE_CLICK_SETUP.bat chalayein.' 'ERROR'
    } elseif (-not (Test-Path $supervisorBat)) {
        Write-Log 'server-supervisor.bat nahi hai — ONE_CLICK_SETUP.bat chalayein.' 'ERROR'
    } else {
        try {
            Start-Process -FilePath (Join-Path $env:WINDIR 'System32\wscript.exe') -ArgumentList ('"' + $hiddenVbs + '"') -WorkingDirectory $proj -WindowStyle Hidden | Out-Null
            Write-Log 'Server hidden background me start kiya - wait kar rahe hain (max 90 sec)...'
        } catch {
            Write-Log ("Server start error: " + $_.Exception.Message) 'ERROR'
        }
    }
}

$healthy = $false
for ($i = 1; $i -le 30; $i++) {
    Start-Sleep -Seconds 3
    $health = Test-AppHealth
    if ($health) { $healthy = $true; break }
    if ($i % 5 -eq 0) { Write-Log ("  ...wait " + ($i * 3) + "s (health: " + $health + ")") }
}

if ($healthy) {
    Write-Log ("Server chal gaya: " + $health) 'OK'
    Write-Log 'Ab browser me kholen: http://localhost:3000' 'OK'
} else {
    Write-Log 'Server abhi bhi start nahi hua. Node.js ka asli error nikal rahe hain...' 'WARN'
    if ($nodeExe -and (Test-Path (Join-Path $proj 'server.js'))) {
        try {
            Remove-Item $ToolLog -Force -ErrorAction SilentlyContinue
            $proc = Start-Process -FilePath $nodeExe -ArgumentList 'server.js' -WorkingDirectory $proj -RedirectStandardOutput $ToolLog -RedirectStandardError ($ToolLog + '.err') -PassThru -NoNewWindow
            Start-Sleep -Seconds 15
            if (-not $proc.HasExited) {
                try { $proc.Kill() } catch { }
                Write-Log 'Manual test: server chalta raha (port shayad block tha).' 'WARN'
            } else {
                Write-Log ("Manual test exit code: " + $proc.ExitCode) 'WARN'
            }
            foreach ($f in @($ToolLog, ($ToolLog + '.err'))) {
                if (Test-Path $f) {
                    Get-Content $f -Tail 20 -ErrorAction SilentlyContinue | ForEach-Object { Write-Log ('  ' + $_) }
                }
            }
        } catch {
            Write-Log ("Manual test error: " + $_.Exception.Message) 'WARN'
        }
    }
    Write-Log ''
    Write-Log 'Agla step:' 'WARN'
    Write-Log ' 1. Agar SQL/service error hai to SQL_FIX.bat chalayein (Desktop par).' 'WARN'
    Write-Log ' 2. Phir SETUP.bat chalayein.' 'WARN'
    Write-Log ' 3. Ye log file bhejein: CSC_DOCTOR_LOG.txt (Desktop par).' 'WARN'
}

Write-Log ''
Write-Log ("LOG FILE: " + $LogPath)

if ($healthy) { exit 0 } else { exit 1 }
