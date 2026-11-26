param(
    [string]$ProjectDir = '',
    [ValidateSet('boot', 'logon', 'open', 'supervisor')][string]$Mode = 'logon'
)

$ErrorActionPreference = 'SilentlyContinue'

if ([string]::IsNullOrWhiteSpace($ProjectDir)) {
    if ($PSScriptRoot) {
        $ProjectDir = Split-Path -Parent $PSScriptRoot
    }
}
$resolved = Resolve-Path -LiteralPath $ProjectDir -ErrorAction SilentlyContinue
if ($resolved) { $ProjectDir = $resolved.Path }
$ProjectDir = $ProjectDir.Trim('"', "'", ' ').TrimEnd('\', '/')
if (-not $ProjectDir -or -not (Test-Path -LiteralPath $ProjectDir)) { exit 1 }

$logsDir = Join-Path $ProjectDir 'logs'
$cfgDir = Join-Path $ProjectDir 'config'
if (-not (Test-Path -LiteralPath $logsDir)) { New-Item -ItemType Directory -Force -Path $logsDir | Out-Null }
if (-not (Test-Path -LiteralPath $cfgDir)) { New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null }

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Read-ConfiguredPort {
    $envPath = Join-Path $ProjectDir '.env'
    if (Test-Path -LiteralPath $envPath) {
        try {
            $raw = (Get-Content -LiteralPath $envPath -Raw -ErrorAction SilentlyContinue).TrimStart([char]0xFEFF)
            if ($raw -match '(?m)^\s*PORT\s*=\s*(\d+)') {
                $p = [int]$Matches[1]
                if ($p -gt 0 -and $p -le 65535) { return $p }
            }
        } catch { }
    }
    return 4000
}

function Write-BootStatusJs {
    param([int]$Pct, [int]$Step, [string]$Stage, [string]$Title, [string]$Detail, [int]$Port, [string]$ErrorMsg = '')
    try {
        $ver = ''
        $verFile = Join-Path $ProjectDir 'version.json'
        if (Test-Path -LiteralPath $verFile) {
            try { $ver = (Get-Content -LiteralPath $verFile -Raw | ConvertFrom-Json).version } catch { }
        }
        $obj = @{
            pct       = $Pct
            step      = $Step
            stage     = $Stage
            title     = $Title
            detail    = $Detail
            port      = $Port
            version   = "$ver"
            ok        = ($Pct -ge 100 -and $Stage -eq 'ready')
            error     = $ErrorMsg
            pid       = $PID
            updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        }
        $js = "window.__CMBC_BOOT_STATUS = " + ($obj | ConvertTo-Json -Compress) + ";`n"
        $statusFile = Join-Path $logsDir 'startup-status.js'
        [System.IO.File]::WriteAllText($statusFile, $js, $utf8NoBom)
    } catch { }
}

function Test-ServerHealth {
    param([int]$CheckPort)
    try {
        $req = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$CheckPort/api/health?_t=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())")
        $req.Proxy = $null
        $req.Timeout = 500
        $req.ReadWriteTimeout = 500
        $req.Method = 'GET'
        $resp = $req.GetResponse()
        $code = [int]$resp.StatusCode
        $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
        $body = $sr.ReadToEnd()
        $sr.Close()
        $resp.Close()
        return @{ Listening = $true; Ready = ($code -eq 200 -and $body -match '"dbReady"\s*:\s*true') }
    } catch [System.Net.WebException] {
        if ($_.Exception.Response) {
            try { $_.Exception.Response.Close() } catch { }
            return @{ Listening = $true; Ready = $false }
        }
        return @{ Listening = $false; Ready = $false }
    } catch {
        return @{ Listening = $false; Ready = $false }
    }
}

$port = Read-ConfiguredPort

# Step 1: On logon/open, IMMEDIATELY launch Chrome (or Edge fallback) with live splash
# before anything else so the user never sees "This site can't be reached"!
if ($Mode -eq 'logon' -or $Mode -eq 'open') {
    $healthNow = Test-ServerHealth -CheckPort $port
    if (-not $healthNow.Ready) {
        Write-BootStatusJs -Pct 8 -Step 1 -Stage 'preflight' `
            -Title 'Server start ho raha hai...' `
            -Detail "Port $port aur runtime environment verify kiya ja raha hai..." `
            -Port $port
    }
    $openPs = Join-Path $ProjectDir 'utils\open_browser.ps1'
    if (Test-Path -LiteralPath $openPs) {
        $bArgs = @('-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', $openPs, '-ProjectDir', $ProjectDir, '-Port', "$port")
        if ($Mode -eq 'logon') { $bArgs += '-LogonOnce' }
        Start-Process -FilePath "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList $bArgs -WorkingDirectory $ProjectDir -WindowStyle Hidden
    }
}

# Step 2: Single-instance launcher mutex so parallel autostart triggers do not race
$mutex = $null
$gotLock = $false
try {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $hex = ([BitConverter]::ToString($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($ProjectDir.ToLowerInvariant())))).Replace('-', '').Substring(0, 12)
    $sha.Dispose()
    $mutex = New-Object System.Threading.Mutex($false, "Local\CMBC_Launch_$hex")
    $gotLock = $mutex.WaitOne(12000)
} catch { }

try {
    # Clean stale .updating lock (>3 min or dead updater PID) so boot is never blocked
    $updFlag = Join-Path $logsDir '.updating'
    $updLock = Join-Path $logsDir '.auto_update.lock'
    if (Test-Path -LiteralPath $updFlag) {
        $staleUpd = $false
        try {
            $rawPid = (Get-Content -LiteralPath $updFlag -Raw -ErrorAction SilentlyContinue).Trim()
            $ageSec = ([DateTime]::UtcNow - (Get-Item -LiteralPath $updFlag).LastWriteTimeUtc).TotalSeconds
            if ($ageSec -gt 180) { $staleUpd = $true }
            elseif ($rawPid -match '^\d+$') {
                if (-not (Get-Process -Id ([int]$rawPid) -ErrorAction SilentlyContinue)) { $staleUpd = $true }
            }
        } catch { $staleUpd = $true }
        if ($staleUpd) {
            Remove-Item -LiteralPath $updFlag -Force -ErrorAction SilentlyContinue
            Remove-Item -LiteralPath $updLock -Force -ErrorAction SilentlyContinue
        }
    }

    # Handle .stop_supervisor intelligently:
    # - In 'open' or 'logon', always clear stop sentinel so PC startup/shortcut always works.
    # - In 'boot' (SYSTEM BootService), clear if created before this Windows boot or stale (>10m).
    $stopFile = Join-Path $logsDir '.stop_supervisor'
    if (Test-Path -LiteralPath $stopFile) {
        $clearStop = $false
        if ($Mode -eq 'open' -or $Mode -eq 'logon' -or $Mode -eq 'supervisor') {
            $clearStop = $true
        } else {
            try {
                $stopItem = Get-Item -LiteralPath $stopFile
                $osBoot = (Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue).LastBootUpTime
                if ($osBoot -and $stopItem.LastWriteTime -lt $osBoot) {
                    $clearStop = $true
                } elseif (([DateTime]::Now - $stopItem.LastWriteTime).TotalMinutes -gt 10) {
                    $clearStop = $true
                }
            } catch { $clearStop = $true }
        }
        if ($clearStop) {
            Remove-Item -LiteralPath $stopFile -Force -ErrorAction SilentlyContinue
        } else {
            exit 0
        }
    }

    # Re-check health after acquiring mutex; if server is already listening, avoid spawning a duplicate supervisor
    $health = Test-ServerHealth -CheckPort $port
    if ($health.Listening) {
        if ($health.Ready) {
            Write-BootStatusJs -Pct 100 -Step 5 -Stage 'ready' `
                -Title 'Server 100% Live!' `
                -Detail "Port $port par server ready hai. App khul raha hai..." `
                -Port $port
        }
        exit 0
    }

    # Verify Node.js v22+ exists and persist path for SYSTEM BootService visibility
    $nodeCandidates = @(
        (Join-Path $ProjectDir '.runtime\nodejs\node.exe'),
        "$env:ProgramFiles\nodejs\node.exe",
        "$env:LOCALAPPDATA\Programs\nodejs\node.exe",
        "${env:ProgramFiles(x86)}\nodejs\node.exe"
    )
    $nodeCfg = Join-Path $cfgDir 'node-path.txt'
    if (Test-Path -LiteralPath $nodeCfg) {
        $savedNode = (Get-Content -LiteralPath $nodeCfg -Raw -ErrorAction SilentlyContinue).Trim()
        if ($savedNode) { $nodeCandidates += $savedNode }
    }
    $resolvedNode = $null
    foreach ($cand in $nodeCandidates) {
        if ($cand -and (Test-Path -LiteralPath $cand)) {
            try {
                $verStr = & $cand -e "console.log(parseInt(process.versions.node.split('.')[0],10))" 2>$null
                if ([int]$verStr -ge 22) { $resolvedNode = $cand; break }
            } catch { }
        }
    }
    if (-not $resolvedNode) {
        try {
            $cmdNode = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
            if ($cmdNode -and (Test-Path -LiteralPath $cmdNode)) {
                $verStr = & $cmdNode -e "console.log(parseInt(process.versions.node.split('.')[0],10))" 2>$null
                if ([int]$verStr -ge 22) { $resolvedNode = $cmdNode }
            }
        } catch { }
    }
    if ($resolvedNode) {
        try { [System.IO.File]::WriteAllText($nodeCfg, $resolvedNode, $utf8NoBom) } catch { }
    } else {
        Write-BootStatusJs -Pct 12 -Step 1 -Stage 'error' `
            -Title 'Node.js v22+ nahi mila' `
            -Detail 'AI_DOCTOR_SQLITE.bat ya SETUP.bat chalakar Node.js runtime repair karein.' `
            -Port $port -ErrorMsg 'Node.js v22+ missing'
        exit 1
    }

    # Auto-heal Windows Hyper-V / WinNAT excluded port or foreign conflict before starting server
    function Test-PortBindableLocal {
        param([int]$TestP)
        try {
            $excl = & netsh int ipv4 show excludedportrange protocol=tcp 2>$null
            foreach ($line in $excl) {
                if ($line -match '^\s*(\d+)\s+(\d+)') {
                    if ($TestP -ge [int]$Matches[1] -and $TestP -le [int]$Matches[2]) { return $false }
                }
            }
        } catch { }
        try {
            $l = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $TestP)
            $l.Start(); $l.Stop(); return $true
        } catch { return $false }
    }

    # Check if an orphan project node.exe holds the port without answering health
    try {
        $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        foreach ($c in $conns) {
            if ($c.OwningProcess -le 4) { continue }
            $w = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)" -ErrorAction SilentlyContinue
            if ($w -and $w.CommandLine -and ($w.CommandLine -like '*server.js*' -or $w.CommandLine -like "*$ProjectDir*")) {
                Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
                Start-Sleep -Milliseconds 500
            }
        }
    } catch { }

    if (-not (Test-PortBindableLocal -TestP $port)) {
        foreach ($candPort in @(4000, 4001, 4545, 4040, 4800, 5050, 8090)) {
            if (Test-PortBindableLocal -TestP $candPort) {
                $port = $candPort
                $envPath = Join-Path $ProjectDir '.env'
                if (Test-Path -LiteralPath $envPath) {
                    $txt = (Get-Content -LiteralPath $envPath -Raw -ErrorAction SilentlyContinue).TrimStart([char]0xFEFF)
                    if ($txt -match '(?m)^\s*PORT\s*=') {
                        $txt = [regex]::Replace($txt, '(?m)^\s*PORT\s*=.*$', "PORT=$port")
                    } else {
                        $txt = "PORT=$port`r`n" + $txt
                    }
                    [System.IO.File]::WriteAllText($envPath, $txt, $utf8NoBom)
                }
                break
            }
        }
    }

    # Ensure only one server-supervisor.bat is running for this ProjectDir
    $supRunning = $false
    try {
        $existingSups = Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -and $_.CommandLine -like '*server-supervisor.bat*' -and $_.CommandLine -like "*$ProjectDir*" }
        if ($existingSups) { $supRunning = $true }
    } catch { }

    if (-not $supRunning) {
        Write-BootStatusJs -Pct 18 -Step 2 -Stage 'launching_node' `
            -Title 'Node.js Server Start Ho Raha Hai...' `
            -Detail "Port $port par background supervisor launch ho raha hai..." `
            -Port $port

        $supBat = Join-Path $ProjectDir 'server-supervisor.bat'
        if (Test-Path -LiteralPath $supBat) {
            # Safe argument list handles spaces & '&' in ProjectDir cleanly
            $argLine = '/d /s /c "' + "`"$supBat`"" + '"'
            Start-Process -FilePath "$env:ComSpec" -ArgumentList $argLine -WorkingDirectory $ProjectDir -WindowStyle Hidden
        } else {
            Start-Process -FilePath $resolvedNode -ArgumentList @('server.js') -WorkingDirectory $ProjectDir -WindowStyle Hidden
        }
    }
} finally {
    if ($gotLock -and $mutex) {
        try { $mutex.ReleaseMutex() } catch { }
        try { $mutex.Dispose() } catch { }
    }
}
exit 0
