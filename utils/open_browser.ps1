param(
    [Parameter(Mandatory = $true)][string]$ProjectDir,
    [int]$Port = 0,
    [switch]$LogonOnce = $false,
    [switch]$ForceSplash = $false
)

$ErrorActionPreference = 'SilentlyContinue'

# Never attempt to launch GUI browsers inside Session 0 (SYSTEM BootService)
try {
    if ([System.Diagnostics.Process]::GetCurrentProcess().SessionId -le 0) {
        exit 0
    }
    $currUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    if ($currUser -match 'NT AUTHORITY\\SYSTEM$') {
        exit 0
    }
} catch { }

$resolved = Resolve-Path -LiteralPath $ProjectDir -ErrorAction SilentlyContinue
if ($resolved) { $ProjectDir = $resolved.Path }
$ProjectDir = $ProjectDir.Trim('"', "'", ' ').TrimEnd('\', '/')
if (-not (Test-Path -LiteralPath $ProjectDir)) { exit 1 }

$logsDir = Join-Path $ProjectDir 'logs'
if (-not (Test-Path -LiteralPath $logsDir)) {
    New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
}

# Read configured PORT from .env if not explicitly provided
if ($Port -le 0) {
    $Port = 4000
    $envPath = Join-Path $ProjectDir '.env'
    if (Test-Path -LiteralPath $envPath) {
        try {
            $rawEnv = (Get-Content -LiteralPath $envPath -Raw -ErrorAction SilentlyContinue).TrimStart([char]0xFEFF)
            if ($rawEnv -match '(?m)^\s*PORT\s*=\s*(\d+)') {
                $p = [int]$Matches[1]
                if ($p -gt 0 -and $p -le 65535) { $Port = $p }
            }
        } catch { }
    }
}

# Deduplicate simultaneous Windows logon triggers (Startup + Run + Task Scheduler)
# so Chrome/Edge opens once cleanly per boot/session instead of 3 tabs.
if ($LogonOnce) {
    $mutex = $null
    $acquired = $false
    try {
        Add-Type -AssemblyName System.Core -ErrorAction SilentlyContinue
        $bytes = [System.Text.Encoding]::UTF8.GetBytes(($ProjectDir.ToLowerInvariant() + '_' + $env:USERNAME.ToLowerInvariant()))
        $sha = [System.Security.Cryptography.SHA256]::Create()
        $hex = ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').Substring(0, 12)
        $sha.Dispose()
        $mutexName = "Local\CMBC_BrowserOpen_$hex"
        $mutex = New-Object System.Threading.Mutex($false, $mutexName)
        $acquired = $mutex.WaitOne(1500)
    } catch { }

    try {
        $bootTick = 'boot0'
        try {
            $osInfo = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
            if ($osInfo -and $osInfo.LastBootUpTime) {
                $bootTick = $osInfo.LastBootUpTime.ToUniversalTime().ToString('yyyyMMddHHmmss')
            }
        } catch { }
        $sessId = [System.Diagnostics.Process]::GetCurrentProcess().SessionId
        $stampKey = "${bootTick}_sess${sessId}_$($env:USERNAME)"
        $stampFile = Join-Path $logsDir '.browser_opened_stamp'
        if (Test-Path -LiteralPath $stampFile) {
            $prevStamp = (Get-Content -LiteralPath $stampFile -Raw -ErrorAction SilentlyContinue).Trim()
            if ($prevStamp -eq $stampKey) {
                exit 0
            }
        }
        [System.IO.File]::WriteAllText($stampFile, $stampKey, (New-Object System.Text.UTF8Encoding($false)))
    } finally {
        if ($acquired -and $mutex) {
            try { $mutex.ReleaseMutex() } catch { }
            try { $mutex.Dispose() } catch { }
        }
    }
}

function Test-ServerReadyQuick {
    param([int]$CheckPort)
    try {
        $req = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$CheckPort/api/health?_t=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())")
        $req.Proxy = $null
        $req.Timeout = 450
        $req.ReadWriteTimeout = 450
        $req.Method = 'GET'
        $resp = $req.GetResponse()
        $code = [int]$resp.StatusCode
        $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
        $body = $sr.ReadToEnd()
        $sr.Close()
        $resp.Close()
        return ($code -eq 200 -and $body -match '"dbReady"\s*:\s*true')
    } catch {
        return $false
    }
}

$liveUrl = "http://localhost:$Port/"
$splashPath = Join-Path $ProjectDir 'public\startup-wait.html'
$targetUrl = $liveUrl

if ($ForceSplash -or -not (Test-ServerReadyQuick -CheckPort $Port)) {
    if (Test-Path -LiteralPath $splashPath) {
        # Note: Do NOT use System.UriBuilder on file:// paths (it percent-encodes '?' to '%3F' causing ERR_FILE_NOT_FOUND)
        $fileUri = ([System.Uri]$splashPath).AbsoluteUri
        $targetUrl = "${fileUri}?port=$Port"
    }
}

function Find-PreferredBrowser {
    # 1. Google Chrome (preferred)
    $chromeReg = @(
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe',
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe'
    )
    foreach ($rk in $chromeReg) {
        if (Test-Path $rk) {
            $exe = (Get-ItemProperty -Path $rk -ErrorAction SilentlyContinue).'(default)'
            if ($exe) {
                $exe = $exe.Trim('"')
                if (Test-Path -LiteralPath $exe) { return $exe }
            }
        }
    }
    $chromePaths = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    )
    foreach ($p in $chromePaths) {
        if ($p -and (Test-Path -LiteralPath $p)) { return $p }
    }

    # 2. Microsoft Edge (automatic fallback if Chrome is absent)
    $edgeReg = @(
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe',
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe'
    )
    foreach ($rk in $edgeReg) {
        if (Test-Path $rk) {
            $exe = (Get-ItemProperty -Path $rk -ErrorAction SilentlyContinue).'(default)'
            if ($exe) {
                $exe = $exe.Trim('"')
                if (Test-Path -LiteralPath $exe) { return $exe }
            }
        }
    }
    $edgePaths = @(
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
    )
    foreach ($p in $edgePaths) {
        if ($p -and (Test-Path -LiteralPath $p)) { return $p }
    }

    return $null
}

$browserExe = Find-PreferredBrowser
if ($browserExe) {
    try {
        Start-Process -FilePath $browserExe -ArgumentList ('"' + $targetUrl + '"') -ErrorAction Stop
        exit 0
    } catch { }
}

# Fallback to OS default browser / explorer
try {
    Start-Process -FilePath 'explorer.exe' -ArgumentList ('"' + $targetUrl + '"') -ErrorAction Stop
    exit 0
} catch { }
try {
    Start-Process $targetUrl -ErrorAction SilentlyContinue
} catch { }
exit 0
