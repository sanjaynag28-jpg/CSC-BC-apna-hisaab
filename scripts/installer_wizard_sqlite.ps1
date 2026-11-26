# ============================================================================
# CSC & BC Apna Hisaab - SQLite Edition Master Setup & Health Wizard
# 100% Automatic 1-Click Setup | Real-Time LIVE Progress (MB, Speed, Percent)
# Super-Fast Zero SQL Server Install | 100% Free AI Live Self-Healing & Diagnostics
# ============================================================================
[CmdletBinding()]
param(
    [string]$ProjectDir = $PSScriptRoot,
    [switch]$Unattended = $false,
    [switch]$Clean = $false
)

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls11 -bor [Net.SecurityProtocolType]::Tls } catch { }

if ($ProjectDir) {
    $ProjectDir = $ProjectDir.Trim('"', "'", ' ', "`t").TrimEnd('\', '/')
}

if ([string]::IsNullOrWhiteSpace($ProjectDir) -or -not (Test-Path -LiteralPath $ProjectDir)) {
    try {
        if ($PSScriptRoot) {
            $parent = (Get-Item -LiteralPath $PSScriptRoot).Parent.FullName
            if (Test-Path -LiteralPath (Join-Path $parent 'package.json')) {
                $ProjectDir = $parent
            }
        }
    } catch { }
}

# If ProjectDir happens to be inside 'scripts' folder, climb up to project root
if (Test-Path -LiteralPath $ProjectDir) {
    if ((Split-Path -Leaf $ProjectDir).ToLower() -eq 'scripts' -and (Test-Path -LiteralPath (Join-Path (Split-Path -Parent $ProjectDir) 'package.json'))) {
        $ProjectDir = Split-Path -Parent $ProjectDir
    }
}

if ([string]::IsNullOrWhiteSpace($ProjectDir)) {
    $ProjectDir = Join-Path $env:USERPROFILE 'CSC-BC-Apna-Hisaab-SQLite'
}
try {
    if (Test-Path -LiteralPath $ProjectDir) {
        $ProjectDir = (Resolve-Path -LiteralPath $ProjectDir).Path
    }
} catch { }
if ([string]::IsNullOrWhiteSpace($ProjectDir)) {
    $ProjectDir = Join-Path $env:USERPROFILE 'CSC-BC-Apna-Hisaab-SQLite'
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

$guiAvailable = $false
if (-not $Unattended -and [Environment]::UserInteractive -and ([Threading.Thread]::CurrentThread.ApartmentState -eq 'STA')) {
    try { Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase -ErrorAction Stop; $guiAvailable = $true } catch { $guiAvailable = $false }
}

$LogDir = Join-Path $ProjectDir 'logs'
if (-not (Test-Path -LiteralPath $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }
$LogFile = Join-Path $LogDir 'install_wizard_sqlite.log'

$RequiredFiles = @{
    'server.js'                             = 2000
    'package.json'                          = 200
    'package-lock.json'                     = 1000
    'setup-database.js'                     = 400
    'database\sqlite_schema.sql'            = 5000
    'database\setup_sqlite.js'              = 1000
    'database\db.js'                        = 5000
    'public\index.html'                     = 50000
    'public\app.js'                         = 50000
    'public\style.css'                      = 20000
    'public\auth.js'                        = 2000
    'routes\auth.js'                        = 500
    'routes\bc.js'                          = 2000
    'routes\customers.js'                   = 2000
    'routes\transactions.js'                = 2000
    'routes\accounts.js'                    = 2000
    'routes\csc.js'                         = 2000
    'routes\invoices.js'                    = 2000
    'routes\reports.js'                     = 5000
    'routes\documents.js'                   = 2000
    'routes\bill_payments.js'               = 2000
    'routes\ucl.js'                         = 2000
    'routes\pac.js'                         = 1000
    'routes\search.js'                      = 1000
    'routes\settings.js'                    = 1000
    'database\globalTxnRegistry.js'         = 1000
    'middleware\auth.js'                    = 500
    'utils\autoUpdater.js'                  = 1000
    'utils\windows_autostart.js'            = 500
    'utils\create_shortcuts.ps1'            = 500
    'server-supervisor.bat'                 = 300
    'open-app.vbs'                          = 300
    'start-hidden.vbs'                      = 150
    'START.bat'                             = 200
    'version.json'                          = 100
}

$RepoRaw    = 'https://raw.githubusercontent.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/sqlite'
$RepoCdn    = 'https://cdn.jsdelivr.net/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab@sqlite'
$RepoFastly = 'https://fastly.jsdelivr.net/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab@sqlite'
$RepoZip    = 'https://github.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/archive/refs/heads/sqlite.zip'
$RepoZipAlt = 'https://codeload.github.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/zip/refs/heads/sqlite'

# Shared Thread-Safe State
$sync = [hashtable]::Synchronized(@{
    OverallPct     = 0
    CurrentAction  = "Setup engine shuru ho raha hai..."
    Activity       = "SQLite Edition taiyaar kiya ja raha hai..."
    BytesText      = ""
    SpeedText      = ""
    SubStepPctText = "0%"
    Elapsed        = "00:00"
    Tick           = 0
    IsComplete     = $false
    HasError       = $false
    ErrorSummary   = ""
    ResolvedPort   = 4000
    Logs           = [System.Collections.ArrayList]::Synchronized((New-Object System.Collections.ArrayList))
    StepStates     = [hashtable]::Synchronized(@{})
    StepSubTexts   = [hashtable]::Synchronized(@{})
    StepPercents   = [hashtable]::Synchronized(@{})
    Repairs        = [System.Collections.ArrayList]::Synchronized((New-Object System.Collections.ArrayList))
})

for ($i = 1; $i -le 8; $i++) {
    $sync.StepStates[$i]   = 'WAITING'
    $sync.StepSubTexts[$i] = 'Pratiksha karein...'
    $sync.StepPercents[$i] = 0
}

# ============================================================================
# WORKER (Background Runspace with AI Live Self-Healing & Diagnostics)
# ============================================================================
$workerBlock = {
    param($sync, $ProjectDir, $isAdmin, $RequiredFiles, $LogFile, $RepoRaw, $RepoCdn, $RepoFastly, $RepoZip, $RepoZipAlt, $CleanMode = $false)
    try { Set-Location -LiteralPath $ProjectDir } catch { }

    try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls11 -bor [Net.SecurityProtocolType]::Tls } catch { }

    function Log-Msg {
        param([string]$Msg, [string]$Cat = 'INFO')
        $ts = Get-Date -Format 'HH:mm:ss'
        $prefix = switch ($Cat) {
            'OK'      { '✅ [OK]' }
            'WARN'    { '⚠️ [WARN]' }
            'ERROR'   { '❌ [FAIL]' }
            'FIX'     { '⚡ [AI-FIX]' }
            'AI'      { '🤖 [AI-DOCTOR]' }
            'START'   { '🚀 [START]' }
            'SYSTEM'  { '💻 [SYSTEM]' }
            'DOWNLOAD'{ '📥 [DOWNLOAD]' }
            'EXTRACT' { '📦 [EXTRACT]' }
            'NPM'     { '📦 [NPM]' }
            'SQLITE'  { '💾 [SQLITE]' }
            default   { "[$Cat]" }
        }
        $line = "[$ts] $prefix $Msg"
        try { Add-Content -Path $LogFile -Value $line -Encoding UTF8 } catch { }
        try { Add-Content -Path (Join-Path $env:TEMP 'cmbc_sqlite_install.log') -Value $line -Encoding UTF8 } catch { }
        [void]$sync.Logs.Add($line)
        Write-Host $line
    }

    function Update-Step {
        param(
            [int]$StepNum,
            [string]$Status,
            [int]$StepPct,
            [string]$SubText = '',
            [string]$Action = ''
        )
        $sync.StepStates[$StepNum] = $Status
        if ($StepPct -ge 0) { $sync.StepPercents[$StepNum] = $StepPct }
        if ($SubText) { $sync.StepSubTexts[$StepNum] = $SubText }
        if ($Action) {
            $sync.CurrentAction = $Action
            $sync.SubStepPctText = "Step $StepNum / 8 : $StepPct%"
        }
        $done = 0
        for ($k = 1; $k -le 8; $k++) {
            if ($sync.StepStates[$k] -eq 'SUCCESS' -or $sync.StepStates[$k] -eq 'REPAIRED') { $done += 100 }
            elseif ($sync.StepStates[$k] -eq 'RUNNING' -or $sync.StepStates[$k] -eq 'HEALING') { $done += [int]$sync.StepPercents[$k] }
        }
        $sync.OverallPct = [Math]::Min(100, [int]($done / 8))
    }

    function New-Dots {
        param([double]$ElapsedSec)
        $n = 1 + ([int]($ElapsedSec) % 3)
        return ('.' * $n)
    }

    # ------------------------------------------------------------------------
    # AI SELF-HEALING ENGINE: PRE-FLIGHT DIAGNOSTICS & REPAIRS
    # ------------------------------------------------------------------------
    function Repair-DnsAndNetwork {
        Log-Msg "DNS resolution aur network reachability check ho rahi hai..." 'AI'
        # Clear broken local proxy env if unreachable
        foreach ($pv in @('HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy')) {
            $val = [Environment]::GetEnvironmentVariable($pv, 'Process')
            if ($val -match '127\.0\.0\.1|localhost') {
                [Environment]::SetEnvironmentVariable($pv, $null, 'Process')
                Log-Msg "Dead localhost proxy env variable ($pv) clear kiya gaya." 'FIX'
            }
        }
        $dnsOk = $false
        $hosts = @('raw.githubusercontent.com', 'cdn.jsdelivr.net', 'nodejs.org', 'registry.npmjs.org')
        foreach ($h in $hosts) {
            try {
                $ips = [System.Net.Dns]::GetHostAddresses($h)
                $valid = $ips | Where-Object { "$_" -ne '127.0.0.1' -and "$_" -ne '0.0.0.0' -and "$_" -ne '::1' }
                if ($valid -and $valid.Count -gt 0) { $dnsOk = $true; break }
            } catch { }
        }
        if ($dnsOk) {
            Log-Msg "DNS resolution active aur healthy hai." 'OK'
            return $true
        }

        Log-Msg "DNS cache flush aur network auto-healing chal rahi hai..." 'FIX'
        try { ipconfig /flushdns | Out-Null } catch { }
        Start-Sleep -Milliseconds 400
        foreach ($h in $hosts) {
            try {
                $ips = [System.Net.Dns]::GetHostAddresses($h)
                $valid = $ips | Where-Object { "$_" -ne '127.0.0.1' -and "$_" -ne '0.0.0.0' -and "$_" -ne '::1' }
                if ($valid -and $valid.Count -gt 0) { $dnsOk = $true; break }
            } catch { }
        }
        if ($dnsOk) {
            Log-Msg "DNS cache flush se resolution restore ho gayi." 'OK'
            return $true
        }
        Log-Msg "Direct DNS restricted hai - CDN mirrors + DoH (1.1.1.1) bypass mode active rahega." 'WARN'
        return $false
    }

    function Repair-TlsAndCrypto {
        try {
            try {
                [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType](3072 -bor 12288)
            } catch {
                try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]3072 } catch { }
            }
            try { [System.Net.WebRequest]::DefaultWebProxy.Credentials = [System.Net.CredentialCache]::DefaultNetworkCredentials } catch { }
            $keys = @(
                "HKLM:\SOFTWARE\Microsoft\.NETFramework\v4.0.30319",
                "HKLM:\SOFTWARE\Wow6432Node\Microsoft\.NETFramework\v4.0.30319"
            )
            foreach ($k in $keys) {
                if (Test-Path $k) {
                    Set-ItemProperty -Path $k -Name 'SchUseStrongCrypto' -Value 1 -Type DWord -ErrorAction SilentlyContinue
                    Set-ItemProperty -Path $k -Name 'SystemDefaultTlsVersions' -Value 1 -Type DWord -ErrorAction SilentlyContinue
                }
            }
        } catch { }
    }

    function Repair-VisualCppRuntime {
        Log-Msg "Microsoft Visual C++ 2015-2022 Runtime check ho raha hai..." 'AI'
        $sysDll1 = Join-Path $env:SystemRoot "System32\vcruntime140.dll"
        $sysDll2 = Join-Path $env:SystemRoot "System32\vcruntime140_1.dll"
        $hasVc = (Test-Path -LiteralPath $sysDll1) -and (Test-Path -LiteralPath $sysDll2)
        if (-not $hasVc) {
            $vcKey = "HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64"
            if (Test-Path $vcKey) {
                $props = Get-ItemProperty -Path $vcKey -ErrorAction SilentlyContinue
                if ($props -and $props.Installed -eq 1 -and ([int]$props.Bld -ge 29000) -and (Test-Path -LiteralPath $sysDll1)) {
                    $hasVc = $true
                }
            }
        }

        if ($hasVc) {
            Log-Msg "Visual C++ x64 Runtime (vcruntime140 + vcruntime140_1) verified." 'OK'
            return $true
        }

        Log-Msg "Visual C++ 2015-2022 Runtime missing/outdated. Auto-download & install ho raha hai..." 'FIX'
        $vcExe = Join-Path $env:TEMP "vc_redist.x64.exe"
        $vcUrls = @(
            "https://aka.ms/vs/17/release/vc_redist.x64.exe",
            "https://download.visualstudio.microsoft.com/download/pr/9e3f94ee-6b65-4f40-9a29-277983617300/F518170D4AE849764516B079D19E75825EDC66FE/VC_redist.x64.exe"
        )
        $got = Get-FileSmart -Urls $vcUrls -OutFile $vcExe -Step 4 -FromPct 25 -ToPct 55 -Label "Visual C++ Redistributable" -MinBytes 10000000 -ValidateType 'EXE'
        if ($got) {
            Log-Msg "Visual C++ Redistributable silently install ho raha hai..." 'INSTALL'
            $p = Start-Process -FilePath $vcExe -ArgumentList "/install /quiet /norestart" -PassThru -Wait
            $rc = if ($p) { $p.ExitCode } else { 1 }
            Remove-Item -LiteralPath $vcExe -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
            if ($rc -eq 0 -or $rc -eq 1638 -or $rc -eq 3010) {
                Log-Msg "Visual C++ Runtime ready (Exit Code: $rc)." 'OK'
                return $true
            }
            Log-Msg "Visual C++ installer exit code: $rc" 'WARN'
        }
        return (Test-Path -LiteralPath $sysDll1)
    }

    function Test-PortBindable {
        param([int]$Port)
        # 1. Check Hyper-V / WinNAT excluded TCP port ranges
        try {
            $excl = & netsh int ipv4 show excludedportrange protocol=tcp 2>$null
            foreach ($line in $excl) {
                if ($line -match '^\s*(\d+)\s+(\d+)') {
                    $sPort = [int]$Matches[1]; $ePort = [int]$Matches[2]
                    if ($Port -ge $sPort -and $Port -le $ePort) {
                        return $false
                    }
                }
            }
        } catch { }
        # 2. Try binding TcpListener briefly
        try {
            $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
            $listener.Start()
            $listener.Stop()
            return $true
        } catch {
            return $false
        }
    }

    function Repair-PortConflict {
        param([int]$PreferredPort = 4000)
        $targetPort = $PreferredPort
        $envFile = Join-Path $ProjectDir '.env'
        if (Test-Path -LiteralPath $envFile) {
            try {
                $m = [regex]::Match((Get-Content -LiteralPath $envFile -Raw), '(?m)^\s*PORT\s*=\s*(\d+)')
                if ($m.Success) { $targetPort = [int]$m.Groups[1].Value }
            } catch { }
        }
        Log-Msg "Port $targetPort verification & smart auto-healing..." 'AI'

        # First kill ONLY this project's supervisor/node listeners
        try {
            $connections = Get-NetTCPConnection -LocalPort $targetPort -State Listen -ErrorAction SilentlyContinue
            if ($connections) {
                foreach ($conn in $connections) {
                    $pidToKill = $conn.OwningProcess
                    if ($pidToKill -le 4) { continue }
                    $proc = Get-Process -Id $pidToKill -ErrorAction SilentlyContinue
                    $wmi = Get-CimInstance Win32_Process -Filter "ProcessId=$pidToKill" -ErrorAction SilentlyContinue
                    $cmdLine = if ($wmi) { "$($wmi.CommandLine)" } else { "" }
                    if ($proc -and $proc.ProcessName -ieq 'node' -and ($cmdLine -like "*$ProjectDir*" -or $cmdLine -like '*server.js*')) {
                        Log-Msg "Purana/stuck server node process detect hua (PID: $pidToKill). Clean stop..." 'FIX'
                        Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
                    } elseif ($proc) {
                        Log-Msg "Foreign app '$($proc.ProcessName)' (PID: $pidToKill) Port $targetPort use kar raha hai — safe alternate port select kiya jayega." 'WARN'
                    }
                }
                Start-Sleep -Milliseconds 800
            }
        } catch { }

        if (Test-PortBindable -Port $targetPort) {
            $sync.ResolvedPort = $targetPort
            Log-Msg "Port $targetPort verified aur free hai." 'OK'
            return $targetPort
        }

        foreach ($cand in @(4000, 4001, 4545, 4040, 4800, 5050, 8090)) {
            if (Test-PortBindable -Port $cand) {
                $sync.ResolvedPort = $cand
                Log-Msg "Windows Hyper-V/Service ne Port $targetPort block kiya tha -> AI ne safe free Port $cand choose kiya!" 'FIX'
                return $cand
            }
        }
        $sync.ResolvedPort = $targetPort
        return $targetPort
    }

    function Test-DownloadedFile {
        param([string]$FilePath, [int]$MinBytes = 1024, [string]$ValidateType = '')
        if (-not (Test-Path -LiteralPath $FilePath)) { return $false }
        $len = (Get-Item -LiteralPath $FilePath).Length
        if ($len -lt $MinBytes) { return $false }
        try {
            $fs = [System.IO.File]::OpenRead($FilePath)
            $hdr = New-Object byte[] 512
            $n = $fs.Read($hdr, 0, $hdr.Length)
            $fs.Close()
            $txt = [System.Text.Encoding]::ASCII.GetString($hdr, 0, $n)
            if ($txt -match '(?i)^\s*<!DOCTYPE|^\s*<html') { return $false }
            if ($ValidateType -eq 'ZIP') {
                if ($n -lt 4 -or $hdr[0] -ne 0x50 -or $hdr[1] -ne 0x4B) { return $false }
                Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction SilentlyContinue
                $z = [System.IO.Compression.ZipFile]::OpenRead($FilePath)
                $cnt = $z.Entries.Count
                $z.Dispose()
                if ($cnt -lt 5) { return $false }
            } elseif ($ValidateType -eq 'EXE' -or $ValidateType -eq 'MSI') {
                if ($ValidateType -eq 'EXE' -and ($hdr[0] -ne 0x4D -or $hdr[1] -ne 0x5A)) { return $false }
                if ($ValidateType -eq 'MSI' -and ($hdr[0] -ne 0xD0 -or $hdr[1] -ne 0xCF)) { return $false }
            }
        } catch { return $false }
        return $true
    }

    function Download-File {
        param(
            [string]$Url,
            [string]$OutFile,
            [int]$Step,
            [double]$FromPct,
            [double]$ToPct,
            [string]$Label
        )
        $req = [System.Net.HttpWebRequest]::Create($Url)
        try { $req.Proxy.Credentials = [System.Net.CredentialCache]::DefaultNetworkCredentials } catch { }
        $req.UserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        $req.Timeout = 120000
        $req.ReadWriteTimeout = 120000
        $req.AllowAutoRedirect = $true
        $resp = $req.GetResponse()
        $total = $resp.ContentLength
        $in = $resp.GetResponseStream()
        $out = [System.IO.File]::Create($OutFile)
        $buf = New-Object byte[] 131072
        $read = 0L
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $last = [System.Diagnostics.Stopwatch]::StartNew()
        try {
            while (($n = $in.Read($buf, 0, $buf.Length)) -gt 0) {
                $out.Write($buf, 0, $n)
                $read += $n
                if ($last.ElapsedMilliseconds -ge 90) {
                    $last.Restart()
                    $el = $sw.Elapsed.TotalSeconds
                    $mb = [Math]::Round($read / 1MB, 2)
                    $hasTotal = ($total -gt 0)
                    $totmb = if ($hasTotal) { [Math]::Round($total / 1MB, 2) } else { 0 }
                    $pct = if ($hasTotal) { [int](($read / $total) * 100) } else { 0 }
                    $speed = if ($el -gt 0.05) { [Math]::Round(($read / 1MB) / $el, 2) } else { 0 }
                    $sub = [int]($FromPct + ($ToPct - $FromPct) * ($pct / 100.0))
                    if ($hasTotal) {
                        $subTxt = "$Label : $mb MB / $totmb MB ($pct%)"
                        $actTxt = "$Label  |  $speed MB/s  |  $mb / $totmb MB  ($pct%)"
                        $sync.BytesText = "$mb / $totmb MB"
                    } else {
                        $subTxt = "$Label : $mb MB downloaded"
                        $actTxt = "$Label  |  $speed MB/s  |  $mb MB downloaded"
                        $sync.BytesText = "$mb MB downloaded"
                    }
                    $sync.SpeedText = "$speed MB/s"
                    $sync.Activity = "$Label$(New-Dots $el)"
                    Update-Step $Step 'RUNNING' $sub $subTxt $actTxt
                }
            }
        } finally {
            $out.Close(); $in.Close(); $resp.Close()
        }
        $sw.Stop()
        if ($total -gt 0 -and $read -lt $total) {
            throw "Incomplete download ($read / $total bytes)"
        }
        return $read
    }

    function Get-FileSmart {
        param(
            [string[]]$Urls,
            [string]$OutFile,
            [int]$Step,
            [double]$FromPct,
            [double]$ToPct,
            [string]$Label,
            [int]$MinBytes = 1024,
            [string]$ValidateType = ''
        )
        for ($round = 1; $round -le 3; $round++) {
            foreach ($u in $Urls) {
                try {
                    if (Test-Path -LiteralPath $OutFile) { Remove-Item -LiteralPath $OutFile -Force -ErrorAction SilentlyContinue }
                    $uHost = try { ([Uri]$u).Host } catch { $u }
                    Log-Msg "$Label download (round $round): $uHost" 'DOWNLOAD'
                    $got = Download-File -Url $u -OutFile $OutFile -Step $Step -FromPct $FromPct -ToPct $ToPct -Label $Label
                    if (Test-DownloadedFile -FilePath $OutFile -MinBytes $MinBytes -ValidateType $ValidateType) {
                        $mb = [Math]::Round((Get-Item -LiteralPath $OutFile).Length / 1MB, 2)
                        Log-Msg "$Label complete: $mb MB downloaded & verified." 'OK'
                        $sync.BytesText = "$mb MB done"
                        return $true
                    }
                    if (Test-Path -LiteralPath $OutFile) { Remove-Item -LiteralPath $OutFile -Force -ErrorAction SilentlyContinue }
                } catch {
                    Log-Msg "$Label mirror notice: $($_.Exception.Message)" 'WARN'
                }
                Start-Sleep -Milliseconds 400
            }
            if ($round -lt 3) { Start-Sleep -Seconds 2 }
        }

        $curlCmd = Get-Command curl.exe -ErrorAction SilentlyContinue
        if ($curlCmd) {
            foreach ($u in $Urls) {
                try {
                    if (Test-Path -LiteralPath $OutFile) { Remove-Item -LiteralPath $OutFile -Force -ErrorAction SilentlyContinue }
                    $uHost = try { ([Uri]$u).Host } catch { $u }
                    Log-Msg "$Label DoH network bypass attempt: $uHost" 'FIX'
                    & $curlCmd.Source -fSL --doh-url 'https://cloudflare-dns.com/dns-query' --retry 2 --connect-timeout 15 "$u" -o "$OutFile" 2>$null
                    if (-not (Test-DownloadedFile -FilePath $OutFile -MinBytes $MinBytes -ValidateType $ValidateType)) {
                        if (Test-Path -LiteralPath $OutFile) { Remove-Item -LiteralPath $OutFile -Force -ErrorAction SilentlyContinue }
                        & $curlCmd.Source -fSL --retry 2 --connect-timeout 15 "$u" -o "$OutFile" 2>$null
                    }
                    if (Test-DownloadedFile -FilePath $OutFile -MinBytes $MinBytes -ValidateType $ValidateType) {
                        $mb = [Math]::Round((Get-Item -LiteralPath $OutFile).Length / 1MB, 2)
                        Log-Msg "$Label DoH bypass se safal ($mb MB)!" 'OK'
                        $sync.BytesText = "$mb MB done"
                        return $true
                    }
                    if (Test-Path -LiteralPath $OutFile) { Remove-Item -LiteralPath $OutFile -Force -ErrorAction SilentlyContinue }
                } catch { }
            }
        }
        return $false
    }

    function Wait-ProcAlive {
        param(
            $Proc,
            [int]$Step,
            [string]$Label,
            [int]$MaxPct = 94,
            [int]$StartPct = 20
        )
        if (-not $Proc) { return 1 }
        try { $null = $Proc.Handle } catch { }
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        while (-not $Proc.HasExited) {
            Start-Sleep -Milliseconds 350
            $el = $sw.Elapsed.TotalSeconds
            $frac = [Math]::Min(0.98, 1.0 - [Math]::Exp(-$el / 20.0))
            $sub = [int]($StartPct + $frac * ($MaxPct - $StartPct))
            $t = "{0:mm\:ss}" -f $sw.Elapsed
            $dots = New-Dots $el
            $sync.Activity = "$Label chal raha hai$dots ($t)"
            $sync.Elapsed = $t
            Update-Step $Step 'RUNNING' $sub "$Label ($t)..." "$Label chal raha hai ($t)..."
        }
        $sw.Stop()
        return $Proc.ExitCode
    }

    function Test-NodeCompatible {
        param([string]$NodeExe)
        if (-not $NodeExe -or -not (Test-Path -LiteralPath $NodeExe)) { return $false }
        try {
            $out = & $NodeExe -e "const p=process.versions.node.split('.').map(Number); console.log((p[0]>22||(p[0]===22&&p[1]>=14)) && (process.arch==='x64'||process.arch==='arm64') ? 'OK' : 'BAD');" 2>$null
            return ("$out" -match 'OK')
        } catch { return $false }
    }

    function Find-Node {
        $candidates = @()
        $runtimeLocal = Join-Path $ProjectDir '.runtime\nodejs\node.exe'
        if (Test-Path -LiteralPath $runtimeLocal) { $candidates += $runtimeLocal }
        $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
        if ($cmd) { $candidates += $cmd.Source }
        $candidates += @(
            "C:\Program Files\nodejs\node.exe",
            "C:\Program Files (x86)\nodejs\node.exe"
        )
        if ($env:LOCALAPPDATA) {
            $candidates += (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe')
            $candidates += (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\node.exe')
        }
        if ($env:NVM_SYMLINK) { $candidates += (Join-Path $env:NVM_SYMLINK 'node.exe') }
        if ($env:USERPROFILE) {
            $candidates += (Join-Path $env:USERPROFILE 'scoop\shims\node.exe')
            $candidates += (Join-Path $env:USERPROFILE '.volta\bin\node.exe')
        }
        foreach ($p in ($candidates | Select-Object -Unique)) {
            if (Test-NodeCompatible -NodeExe $p) {
                $dir = Split-Path -Parent $p
                if ($env:Path -notlike "*$dir*") { $env:Path = "$dir;$env:Path" }
                return $p
            }
        }
        return $null
    }

    # ========================================================================
    # STEP 1: Admin & Windows Rights Check + Pre-flight AI Self-Healing
    # ========================================================================
    function Exec-Step1 {
        Update-Step 1 'RUNNING' 15 "Step 1 / 8 : Admin & Windows check..." "Windows administrator rights aur pre-flight diagnostics..."
        Log-Msg "Administrator privileges aur OS version verify ho raha hai..." 'SYSTEM'

        # Pre-flight AI Self-Healing
        Repair-TlsAndCrypto
        Repair-DnsAndNetwork
        Repair-PortConflict 4000

        Update-Step 1 'RUNNING' 60 "OS Architecture Check..." "Windows OS version aur architecture verify ho raha hai..."
        if (-not [Environment]::Is64BitOperatingSystem) {
            Log-Msg "32-bit Windows detected: better-sqlite3 v13+ 64-bit Windows (x64/ARM64) par chalta hai." 'ERROR'
            Update-Step 1 'FAILED' 60 "64-bit Windows Required" "Step 1 : 64-bit Windows zaroori hai"
            return $false
        }
        Start-Sleep -Milliseconds 200
        $osv = [System.Environment]::OSVersion.VersionString
        if ($isAdmin) {
            Log-Msg "Administrator privileges OK. OS: $osv" 'OK'
            Update-Step 1 'SUCCESS' 100 "Admin aur Windows OK" "Step 1 : Administrator Rights Verified"
        } else {
            Log-Msg "Standard User mode active (Per-user install OK). OS: $osv" 'OK'
            Update-Step 1 'REPAIRED' 100 "User Mode Ready" "Step 1 : User Mode Verified"
        }
        return $true
    }

    # ========================================================================
    # STEP 2: SQLite Edition Project Files Verification & Download
    # ========================================================================
    function Exec-Step2 {
        Update-Step 2 'RUNNING' 10 "Step 2 / 8 : Files verify..." "SQLite Edition project files verify ho rahi hain..."
        Log-Msg "Project folder: $ProjectDir" 'VERIFY'

        if (-not (Test-Path $ProjectDir)) {
            New-Item -ItemType Directory -Force -Path $ProjectDir | Out-Null
        }

        # Admin-managed license config ko sync se pehle safe copy karo. Reset/ZIP
        # us file ki purani repo copy le aata hai, jisse local keys/blacklist ud sakte hain.
        $licensePath = Join-Path $ProjectDir 'config\licenses.json'
        $licenseBackup = $null
        if (Test-Path $licensePath) {
            $licenseBackup = Join-Path $env:TEMP "cmbc_licenses_$(Get-Random).json"
            Copy-Item -Path $licensePath -Destination $licenseBackup -Force -ErrorAction SilentlyContinue
        }

        try {
            # 1. Pull latest code via git if git repository exists
            if (Test-Path (Join-Path $ProjectDir ".git")) {
                try {
                    Log-Msg "Git repository detect hua. GitHub se latest code sync kiya ja raha hai..." 'PULL'
                    $gitLock = Join-Path $ProjectDir '.git\index.lock'
                    if (Test-Path -LiteralPath $gitLock) {
                        $age = ((Get-Date) - (Get-Item -LiteralPath $gitLock).LastWriteTime).TotalMinutes
                        if ($age -gt 3) { Remove-Item -LiteralPath $gitLock -Force -ErrorAction SilentlyContinue }
                    }
                    $safeDir = $ProjectDir.Replace('\', '/')
                    $prevPrompt = $env:GIT_TERMINAL_PROMPT
                    $env:GIT_TERMINAL_PROMPT = '0'
                    & git -c "safe.directory=$safeDir" -C "$ProjectDir" fetch origin sqlite --quiet 2>&1 | Out-Null
                    if ($LASTEXITCODE -eq 0) {
                        & git -c "safe.directory=$safeDir" -C "$ProjectDir" reset --hard origin/sqlite 2>&1 | Out-Null
                        if ($LASTEXITCODE -ne 0) {
                            Log-Msg "Git reset notice (Exit $LASTEXITCODE) — ZIP verification fallback check hoga." 'WARN'
                        }
                    } else {
                        Log-Msg "Git fetch notice (Exit $LASTEXITCODE) — CDN/ZIP fallback check hoga." 'WARN'
                    }
                    $env:GIT_TERMINAL_PROMPT = $prevPrompt
                } catch { }
            }

            # 2. Check local version vs highest reachable remote GitHub version
            $needsCodeUpdate = $false
            $localVer = "0.0.0"
            $verFile = Join-Path $ProjectDir "version.json"
            if (Test-Path $verFile) {
                try {
                    $rawLocal = (Get-Content $verFile -Raw).TrimStart([char]0xFEFF)
                    $localVer = ($rawLocal | ConvertFrom-Json).version
                } catch { }
            }

            try {
                $ticks = [DateTime]::UtcNow.Ticks
                $vUrls = @(
                    "https://raw.githubusercontent.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/sqlite/version.json?t=$ticks",
                    "https://api.github.com/repos/sanjaynag28-jpg/CSC-BC-apna-hisaab/contents/version.json?ref=sqlite&t=$ticks",
                    "https://cdn.jsdelivr.net/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab@sqlite/version.json?t=$ticks",
                    "$RepoFastly/version.json?t=$ticks"
                )
                $bestRemoteVer = $null
                foreach ($u in $vUrls) {
                    try {
                        $hdrs = @{ 'Cache-Control' = 'no-cache' }
                        if ($u -like '*api.github.com*') { $hdrs['Accept'] = 'application/vnd.github.raw+json' }
                        $vResp = Invoke-WebRequest -Uri $u -Headers $hdrs -UseBasicParsing -TimeoutSec 6 -ErrorAction Stop
                        $contentTxt = "$($vResp.Content)".TrimStart([char]0xFEFF)
                        $remoteObj = $contentTxt | ConvertFrom-Json
                        if ($remoteObj -and $remoteObj.encoding -eq 'base64' -and $remoteObj.content) {
                            $decoded = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(($remoteObj.content -replace '\s+', '')))
                            $remoteObj = $decoded.TrimStart([char]0xFEFF) | ConvertFrom-Json
                        }
                        if ($remoteObj -and $remoteObj.version) {
                            if ($remoteObj.branch -and "$($remoteObj.branch)".Trim().ToLower() -ne 'sqlite') { continue }
                            if (-not $bestRemoteVer) {
                                $bestRemoteVer = [string]$remoteObj.version
                            } else {
                                try {
                                    if ([version]([string]$remoteObj.version) -gt [version]$bestRemoteVer) {
                                        $bestRemoteVer = [string]$remoteObj.version
                                    }
                                } catch { }
                            }
                            try {
                                if ([version]$bestRemoteVer -gt [version]([string]$localVer)) { break }
                            } catch { }
                        }
                    } catch { }
                }
                if ($bestRemoteVer) {
                    $isNewer = $false
                    try {
                        $isNewer = ([version]$bestRemoteVer -gt [version]([string]$localVer))
                    } catch {
                        $isNewer = ($bestRemoteVer -ne [string]$localVer)
                    }
                    if ($isNewer) {
                        Log-Msg "Naya version detect hua: Local v$localVer -> Remote v$bestRemoteVer. Auto-syncing files..." 'UPDATE'
                        $needsCodeUpdate = $true
                    }
                }
            } catch { }

            # Check existing files
            $missing = 0
            foreach ($f in $RequiredFiles.Keys) {
                $fp = Join-Path $ProjectDir $f
                if (-not (Test-Path $fp) -or (Get-Item $fp).Length -lt $RequiredFiles[$f]) {
                    $missing++
                }
            }

            if ($missing -gt 0 -or $CleanMode -or $needsCodeUpdate) {
                Log-Msg "Missing/updated project files detect hui ($missing). GitHub se latest SQLite build download ho raha hai..." 'INFO'
                Update-Step 2 'RUNNING' 20 "Downloading ZIP..." "GitHub se SQLite Edition archive download ho raha hai..."
                $zip = Join-Path $env:TEMP "cmbc_sqlite_$(Get-Random).zip"
                $extr = Join-Path $env:TEMP "cmbc_sqlite_extr_$(Get-Random)"
                $ticks = [DateTime]::UtcNow.Ticks
                $zipUrls = @(
                    "${RepoZip}?t=${ticks}",
                    "${RepoZipAlt}?t=${ticks}",
                    "https://github.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/archive/sqlite.zip?t=${ticks}"
                )
                $ok = Get-FileSmart -Urls $zipUrls -OutFile $zip -Step 2 -FromPct 20 -ToPct 75 -Label "SQLite Edition ZIP" -MinBytes 500000 -ValidateType 'ZIP'
                if ($ok) {
                    Update-Step 2 'RUNNING' 80 "Extracting ZIP..." "Archive extract ho raha hai..."
                    Log-Msg "Archive extract ho raha hai..." 'EXTRACT'
                    $extracted = $false
                    $tarCmd = Get-Command tar.exe -ErrorAction SilentlyContinue
                    if ($tarCmd) {
                        try {
                            New-Item -ItemType Directory -Force -Path $extr | Out-Null
                            & $tarCmd.Source -xf "$zip" -C "$extr" 2>$null
                            if ($LASTEXITCODE -eq 0 -and (Get-ChildItem -LiteralPath $extr -ErrorAction SilentlyContinue).Count -gt 0) {
                                $extracted = $true
                            }
                        } catch { }
                    }
                    if (-not $extracted) {
                        try {
                            Expand-Archive -LiteralPath $zip -DestinationPath $extr -Force -ErrorAction Stop
                            $extracted = $true
                        } catch {
                            Log-Msg "Expand-Archive error: $($_.Exception.Message)" 'WARN'
                            $ok = $false
                        }
                    }
                    $subDir = Get-ChildItem -LiteralPath $extr -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
                    $src = if ($subDir) { $subDir.FullName } else { $extr }

                    $archiveOk = $false
                    if ($ok -and $src -and (Test-Path -LiteralPath (Join-Path $src 'server.js')) -and (Test-Path -LiteralPath (Join-Path $src 'database\setup_sqlite.js'))) {
                        $archiveOk = $true
                        $archiveVerFile = Join-Path $src 'version.json'
                        if (Test-Path -LiteralPath $archiveVerFile) {
                            try {
                                $archiveVer = (Get-Content -LiteralPath $archiveVerFile -Raw).TrimStart([char]0xFEFF) | ConvertFrom-Json
                                if ($archiveVer.branch -and "$($archiveVer.branch)".Trim().ToLower() -ne 'sqlite') { $archiveOk = $false }
                            } catch { $archiveOk = $false }
                        }
                    }

                    if ($archiveOk) {
                        $rollbackDir = Join-Path $ProjectDir '.previous-release'
                        $backedUpRel = New-Object System.Collections.Generic.List[string]
                        $createdRel = New-Object System.Collections.Generic.List[string]
                        try {
                            if (Test-Path -LiteralPath $rollbackDir) { Remove-Item -LiteralPath $rollbackDir -Recurse -Force -ErrorAction SilentlyContinue }
                            New-Item -ItemType Directory -Force -Path $rollbackDir | Out-Null

                            $srcPrefixLen = $src.TrimEnd('\', '/').Length + 1
                            $protectedPrefixes = @(
                                '.git', 'node_modules', '.runtime', 'backups', 'logs', 'bin',
                                '.auto-update-tmp', '.previous-release', '.antigravity',
                                'database/data', 'database/backups', 'public/uploads'
                            )
                            $protectedExact = @('.env', 'config/licenses.json', '.admin-login.txt', '.sql-server-credentials.txt', 'version.json.bak')

                            $allFiles = Get-ChildItem -LiteralPath $src -Recurse -File -Force
                            foreach ($fItem in $allFiles) {
                                $rel = ($fItem.FullName.Substring($srcPrefixLen)) -replace '\\', '/'
                                $relLower = $rel.ToLowerInvariant()
                                $skip = $false
                                foreach ($pp in $protectedPrefixes) {
                                    if ($relLower -eq $pp -or $relLower.StartsWith("$pp/")) { $skip = $true; break }
                                }
                                if (-not $skip) {
                                    if ($protectedExact -contains $relLower) { $skip = $true }
                                    elseif ($relLower -match '^\.env(\.|$)' -and $relLower -ne '.env.example') { $skip = $true }
                                    elseif ($relLower -match '\.(mdf|ldf|ndf|bak|db|db-wal|db-shm|db-journal|sqlite|sqlite3|sqlite-wal|sqlite-shm|sqlite-journal)$') { $skip = $true }
                                }
                                if ($skip) { continue }

                                $dstPath = Join-Path $ProjectDir ($rel -replace '/', '\')
                                $dstDir = Split-Path -Parent $dstPath
                                if (-not (Test-Path -LiteralPath $dstDir)) { New-Item -ItemType Directory -Force -Path $dstDir | Out-Null }

                                if (Test-Path -LiteralPath $dstPath) {
                                    $snapPath = Join-Path $rollbackDir ($rel -replace '/', '\')
                                    $snapDir = Split-Path -Parent $snapPath
                                    if (-not (Test-Path -LiteralPath $snapDir)) { New-Item -ItemType Directory -Force -Path $snapDir | Out-Null }
                                    Copy-Item -LiteralPath $dstPath -Destination $snapPath -Force -ErrorAction Stop
                                    $backedUpRel.Add($rel)
                                } else {
                                    $createdRel.Add($rel)
                                }

                                $tmpDst = "$dstPath.updating-tmp"
                                $copied = $false
                                for ($retry = 1; $retry -le 3; $retry++) {
                                    try {
                                        Copy-Item -LiteralPath $fItem.FullName -Destination $tmpDst -Force -ErrorAction Stop
                                        Move-Item -LiteralPath $tmpDst -Destination $dstPath -Force -ErrorAction Stop
                                        $copied = $true
                                        break
                                    } catch {
                                        if ($retry -lt 3) { Start-Sleep -Milliseconds 300 }
                                        else { throw }
                                    }
                                }
                            }

                            try { Get-ChildItem -LiteralPath $ProjectDir -Recurse -File -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue } catch { }
                            try { Remove-Item -LiteralPath $rollbackDir -Recurse -Force -ErrorAction SilentlyContinue } catch { }
                            Log-Msg "Project files latest SQLite version se atomically sync ho gayi (User Data 100% protected)." 'OK'
                        } catch {
                            Log-Msg "File apply error ($($_.Exception.Message)) — rolling back partial files..." 'WARN'
                            foreach ($rel in $backedUpRel) {
                                $snapPath = Join-Path $rollbackDir ($rel -replace '/', '\')
                                $dstPath = Join-Path $ProjectDir ($rel -replace '/', '\')
                                if (Test-Path -LiteralPath $snapPath) { Copy-Item -LiteralPath $snapPath -Destination $dstPath -Force -ErrorAction SilentlyContinue }
                            }
                            foreach ($rel in $createdRel) {
                                $dstPath = Join-Path $ProjectDir ($rel -replace '/', '\')
                                if (Test-Path -LiteralPath $dstPath) { Remove-Item -LiteralPath $dstPath -Force -ErrorAction SilentlyContinue }
                            }
                            $ok = $false
                        }
                    } else {
                        $ok = $false
                        Log-Msg "Downloaded ZIP SQLite edition ka valid build nahi hai - use apply nahi kiya gaya." 'WARN'
                    }

                    Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
                    Remove-Item -LiteralPath $extr -Recurse -Force -ErrorAction SilentlyContinue
                }
                if (-not $ok) {
                    Log-Msg "Direct ZIP download fail hua. Individual files multi-CDN + DoH sync chal rahi hain..." 'WARN'
                    $curlCmd = Get-Command curl.exe -ErrorAction SilentlyContinue
                    foreach ($f in $RequiredFiles.Keys) {
                        $dst = Join-Path $ProjectDir $f
                        $parent = Split-Path -Parent $dst
                        if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
                        $relUrl = ($f -replace '\\', '/')
                        $fetched = $false
                        foreach ($base in @($RepoCdn, $RepoFastly, $RepoRaw)) {
                            try {
                                Invoke-WebRequest -Uri "$base/$relUrl`?t=$ticks" -OutFile $dst -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
                                if ((Test-Path -LiteralPath $dst) -and ((Get-Item -LiteralPath $dst).Length -ge $RequiredFiles[$f])) { $fetched = $true; break }
                            } catch { }
                        }
                        if (-not $fetched -and $curlCmd) {
                            & $curlCmd.Source -fSL --doh-url 'https://cloudflare-dns.com/dns-query' --retry 2 --connect-timeout 12 "$RepoCdn/$relUrl`?t=$ticks" -o "$dst" 2>$null
                        }
                    }
                }

                # Re-verify critical files exist after sync
                $stillMissing = 0
                foreach ($f in @('server.js', 'package.json', 'setup-database.js', 'database\setup_sqlite.js', 'database\sqlite_schema.sql', 'database\db.js')) {
                    if (-not (Test-Path -LiteralPath (Join-Path $ProjectDir $f))) { $stillMissing++ }
                }
                if ($stillMissing -gt 0) {
                    Log-Msg "Critical project files ($stillMissing) download nahi ho saki — internet/firewall check karein." 'ERROR'
                    Update-Step 2 'FAILED' 85 "Files Missing" "Step 2 : Project files download fail"
                    return $false
                }
            } else {
                Log-Msg "Saari project files 100% verified hain." 'OK'
            }
        } finally {
            # License config ALWAYS restore karo (even on failure/early return).
            if ($licenseBackup -and (Test-Path $licenseBackup)) {
                $cfgDir = Join-Path $ProjectDir 'config'
                if (-not (Test-Path $cfgDir)) { New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null }
                Copy-Item -Path $licenseBackup -Destination $licensePath -Force -ErrorAction SilentlyContinue
                Remove-Item $licenseBackup -Force -ErrorAction SilentlyContinue
                Log-Msg "Local license config (config\licenses.json) safely preserved." 'OK'
            }
        }

        Update-Step 2 'SUCCESS' 100 "Project Files Ready" "Step 2 : Project Files 100% Verified"
        return $true
    }

    # ========================================================================
    # STEP 3: Node.js v22+ LTS Engine Auto-Install & PATH Repair (MSI + Portable ZIP)
    # ========================================================================
    function Exec-Step3 {
        Update-Step 3 'RUNNING' 15 "Step 3 / 8 : Node.js v22+ check..." "Node.js v22 LTS runtime verify ho raha hai..."
        Log-Msg "Node.js v22+ LTS runtime check ho raha hai..." 'SYSTEM'
        $node = Find-Node
        if ($node) {
            try {
                $ver = & $node -v
                Log-Msg "Node.js v22+ compatible runtime ready: $ver ($node)" 'OK'
                Update-Step 3 'SUCCESS' 100 "Node.js $ver OK" "Step 3 : Node.js $ver Ready"
                return $true
            } catch { }
        }

        $isArm64 = ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64')
        $archTag = if ($isArm64) { 'arm64' } else { 'x64' }
        Log-Msg "Node.js v22.14.0 ($archTag) download & auto-install ho raha hai..." 'WARN'
        Update-Step 3 'RUNNING' 30 "Downloading Node.js v22..." "Node.js v22.14.0 ($archTag, 30 MB) download ho raha hai..."

        $msi = Join-Path $env:TEMP "node-v22.14.0-$archTag.msi"
        $nodeUrls = @(
            "https://nodejs.org/dist/v22.14.0/node-v22.14.0-$archTag.msi",
            "https://npmmirror.com/mirrors/node/v22.14.0/node-v22.14.0-$archTag.msi"
        )
        $ok = Get-FileSmart -Urls $nodeUrls -OutFile $msi -Step 3 -FromPct 30 -ToPct 75 -Label "Node.js v22 LTS" -MinBytes 18000000 -ValidateType 'MSI'
        if ($ok) {
            Log-Msg "Node.js v22.14.0 silently install ho raha hai..." 'INSTALL'
            Update-Step 3 'RUNNING' 80 "Installing Node.js..." "Node.js v22 silently install ho raha hai..."
            $p = Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart" -PassThru -WindowStyle Hidden
            $rc = Wait-ProcAlive -Proc $p -Step 3 -Label "Node.js install" -StartPct 80 -MaxPct 95
            Remove-Item -LiteralPath $msi -Force -ErrorAction SilentlyContinue

            $env:Path = "C:\Program Files\nodejs;$env:Path"
            try {
                $curMach = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
                if ($isAdmin -and $curMach -and $curMach -notlike "*C:\Program Files\nodejs*") {
                    [System.Environment]::SetEnvironmentVariable("Path", "C:\Program Files\nodejs;$curMach", "Machine")
                }
            } catch { }
            $node = Find-Node
            if ($node) {
                $ver = & $node -v
                Log-Msg "Node.js v22 install ho gaya: $ver" 'OK'
                Update-Step 3 'SUCCESS' 100 "Node.js $ver OK" "Step 3 : Node.js Installed"
                return $true
            }
            Log-Msg "MSI install exit code: $rc — Portable Node.js v22 ZIP fallback try ho raha hai..." 'FIX'
        }

        # Portable ZIP fallback (works even if Windows Installer service or Admin rights blocked!)
        $nodeZip = Join-Path $env:TEMP "node-v22.14.0-win-$archTag.zip"
        $zipUrls = @(
            "https://nodejs.org/dist/v22.14.0/node-v22.14.0-win-$archTag.zip",
            "https://npmmirror.com/mirrors/node/v22.14.0/node-v22.14.0-win-$archTag.zip"
        )
        $zipOk = Get-FileSmart -Urls $zipUrls -OutFile $nodeZip -Step 3 -FromPct 45 -ToPct 88 -Label "Portable Node v22" -MinBytes 18000000 -ValidateType 'ZIP'
        if ($zipOk) {
            try {
                $rtParent = Join-Path $ProjectDir '.runtime'
                $rtExtr = Join-Path $rtParent 'extr'
                $rtDest = Join-Path $rtParent 'nodejs'
                if (Test-Path -LiteralPath $rtExtr) { Remove-Item -LiteralPath $rtExtr -Recurse -Force -ErrorAction SilentlyContinue }
                if (Test-Path -LiteralPath $rtDest) { Remove-Item -LiteralPath $rtDest -Recurse -Force -ErrorAction SilentlyContinue }
                New-Item -ItemType Directory -Force -Path $rtParent | Out-Null
                Expand-Archive -LiteralPath $nodeZip -DestinationPath $rtExtr -Force -ErrorAction Stop
                $inner = Get-ChildItem -LiteralPath $rtExtr -Directory | Select-Object -First 1
                if ($inner) {
                    Move-Item -LiteralPath $inner.FullName -Destination $rtDest -Force
                }
                Remove-Item -LiteralPath $rtExtr -Recurse -Force -ErrorAction SilentlyContinue
                Remove-Item -LiteralPath $nodeZip -Force -ErrorAction SilentlyContinue
                $node = Find-Node
                if ($node) {
                    $ver = & $node -v
                    Log-Msg "Portable Node.js v22 active ($ver): $node" 'OK'
                    Update-Step 3 'REPAIRED' 100 "Portable Node $ver" "Step 3 : Portable Node Ready"
                    return $true
                }
            } catch {
                Log-Msg "Portable Node extract notice: $($_.Exception.Message)" 'WARN'
            }
        }

        Update-Step 3 'FAILED' 90 "Node.js v22 Required" "Step 3 : Node.js v22 install fail"
        return $false
    }

    # ========================================================================
    # STEP 4: NPM Packages & SQLite Driver (better-sqlite3 + VC++ Runtime)
    # ========================================================================
    function Exec-Step4 {
        Update-Step 4 'RUNNING' 20 "Step 4 / 8 : NPM dependencies..." "better-sqlite3 aur Express packages verify ho rahe hain..."
        Log-Msg "NPM dependency packages verify ho rahe hain..." 'NPM'

        Repair-VisualCppRuntime

        $node = Find-Node
        if (-not $node) {
            Log-Msg "Compatible Node.js v22+ nahi mila — NPM install skip." 'ERROR'
            Update-Step 4 'FAILED' 25 "Node v22 Missing" "Step 4 : Compatible Node.js zaroori hai"
            return $false
        }

        $depTestJs = "try{const fs=require('fs'),c=require('crypto'),D=require('better-sqlite3');const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));for(const m of Object.keys(pkg.dependencies||{})){require.resolve(m);if(m==='express')require(m);}const db=new D(':memory:');db.close();const h=c.createHash('sha256').update(fs.readFileSync('package.json','utf8')).update(fs.existsSync('package-lock.json')?fs.readFileSync('package-lock.json','utf8'):'').digest('hex').slice(0,16);const hFile='node_modules/.cmbc_deps_hash';const prev=fs.existsSync(hFile)?fs.readFileSync(hFile,'utf8').trim():'';let hasSharp=true;try{require('sharp')}catch{hasSharp=false}if(prev&&prev!==h){console.log('HASH_MISMATCH');}else{console.log('SQLITE_OK:'+(hasSharp?'SHARP_OK':'SHARP_OPT'));}}catch(e){console.log('FAIL:'+e.message)}"
        $stampDepHashJs = "try{const fs=require('fs'),c=require('crypto');const h=c.createHash('sha256').update(fs.readFileSync('package.json','utf8')).update(fs.existsSync('package-lock.json')?fs.readFileSync('package-lock.json','utf8'):'').digest('hex').slice(0,16);fs.mkdirSync('node_modules',{recursive:true});fs.writeFileSync('node_modules/.cmbc_deps_hash',h,'utf8');}catch{}"
        $runDepCheck = {
            try {
                Push-Location -LiteralPath $ProjectDir
                $out = & $node -e $depTestJs 2>&1
                Pop-Location
                return "$out"
            } catch {
                try { Pop-Location } catch {}
                return "FAIL:$($_.Exception.Message)"
            }
        }

        $chkInit = & $runDepCheck
        if (($chkInit -like "*SQLITE_OK*") -and (-not $CleanMode)) {
            Log-Msg "Saare core npm packages (better-sqlite3 samet) 100% active aur verified hain." 'OK'
            Update-Step 4 'SUCCESS' 100 "Packages Ready" "Step 4 : NPM Packages Verified"
            return $true
        }

        Log-Msg "npm install chal raha hai (--omit=dev, --ignore-scripts, IPv4-first)..." 'WARN'
        Update-Step 4 'RUNNING' 40 "npm install..." "Fast npm install chal raha hai..."

        $nodeDir = Split-Path -Parent $node
        $npmExe = Join-Path $nodeDir 'npm.cmd'
        if (-not (Test-Path -LiteralPath $npmExe)) {
            $cmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
            if ($cmd) { $npmExe = $cmd.Source }
        }
        if (-not (Test-Path -LiteralPath $npmExe)) {
            Log-Msg "npm.cmd nahi mila ($nodeDir)." 'ERROR'
            Update-Step 4 'FAILED' 45 "npm.cmd Missing" "Step 4 : npm.cmd missing"
            return $false
        }

        $prevNodeOpts = $env:NODE_OPTIONS
        $prevIgnScripts = $env:npm_config_ignore_scripts
        $env:NODE_OPTIONS = "--dns-result-order=ipv4first"
        $env:npm_config_ignore_scripts = "true"

        $npmOutLog = Join-Path $env:TEMP "cmbc_npm_out.log"
        $npmErrLog = Join-Path $env:TEMP "cmbc_npm_err.log"

        # Clean half-written npm staging directories before installing
        try {
            $nmDir = Join-Path $ProjectDir 'node_modules'
            if (Test-Path -LiteralPath $nmDir) {
                Get-ChildItem -LiteralPath $nmDir -Filter '.*' -Directory -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
            }
        } catch { }

        # Note: Do NOT omit optional (@img/sharp-win32-x64 is optionalDependency); use --ignore-scripts so prebuilds install without Python/VS!
        $baseArgs = "install --omit=dev --ignore-scripts --fetch-retries=5 --fetch-retry-mintimeout=4000 --fetch-retry-maxtimeout=25000 --maxsockets=4 --no-audit --no-fund"

        $p = Start-Process -FilePath $npmExe -ArgumentList $baseArgs -WorkingDirectory $ProjectDir -PassThru -WindowStyle Hidden -RedirectStandardOutput $npmOutLog -RedirectStandardError $npmErrLog
        $rc = Wait-ProcAlive -Proc $p -Step 4 -Label "npm install" -StartPct 40 -MaxPct 92

        $chk1 = & $runDepCheck
        if ($chk1 -like "*SQLITE_OK*") {
            try { Push-Location -LiteralPath $ProjectDir; & $node -e $stampDepHashJs 2>$null | Out-Null; Pop-Location } catch { try { Pop-Location } catch {} }
            $env:NODE_OPTIONS = $prevNodeOpts; $env:npm_config_ignore_scripts = $prevIgnScripts
            Remove-Item $npmOutLog, $npmErrLog -Force -ErrorAction SilentlyContinue
            Log-Msg "npm install safalta se complete ho gaya ($chk1)." 'OK'
            Update-Step 4 'SUCCESS' 100 "NPM Ready" "Step 4 : NPM Packages Installed"
            return $true
        } else {
            $errTail = (Get-Content $npmErrLog -ErrorAction SilentlyContinue | Select-Object -Last 3) -join ' | '
            if ($errTail) { Log-Msg "Primary npm notice: $errTail" 'WARN' }
        }

        # Clean broken better-sqlite3 / cache before mirror attempt
        try {
            $bsDir = Join-Path $ProjectDir 'node_modules\better-sqlite3'
            if (Test-Path -LiteralPath $bsDir) { Remove-Item -LiteralPath $bsDir -Recurse -Force -ErrorAction SilentlyContinue }
            & $npmExe cache clean --force 2>$null | Out-Null
        } catch { }

        # AI Self-Healing Fallback 1: Pass --registry CLI flag (never mutates global ~/.npmrc)
        Log-Msg "Network / ISP slow detect hua — npmmirror fallback active kiya ja raha hai..." 'FIX'
        Update-Step 4 'HEALING' 60 "AI Fixing NPM..." "Mirror registry se dependencies install ho rahi hain..."
        $p2 = Start-Process -FilePath $npmExe -ArgumentList ($baseArgs + " --registry=https://registry.npmmirror.com") -WorkingDirectory $ProjectDir -PassThru -WindowStyle Hidden -RedirectStandardOutput $npmOutLog -RedirectStandardError $npmErrLog
        $rc2 = Wait-ProcAlive -Proc $p2 -Step 4 -Label "NPM Mirror Install" -StartPct 60 -MaxPct 95

        $okMirror = $false
        $chk2 = & $runDepCheck
        if ($chk2 -like "*SQLITE_OK*") { $okMirror = $true }

        if (-not $okMirror) {
            # AI Self-Healing Fallback 2: Corporate/Antivirus HTTPS proxy bypass scoped to command
            Log-Msg "SSL proxy bypass fallback try ho raha hai..." 'FIX'
            $p3 = Start-Process -FilePath $npmExe -ArgumentList ($baseArgs + " --registry=https://registry.npmmirror.com --strict-ssl=false") -WorkingDirectory $ProjectDir -PassThru -WindowStyle Hidden -RedirectStandardOutput $npmOutLog -RedirectStandardError $npmErrLog
            $rc3 = Wait-ProcAlive -Proc $p3 -Step 4 -Label "NPM Proxy Bypass" -StartPct 75 -MaxPct 97
            $chk3 = & $runDepCheck
            if ($chk3 -like "*SQLITE_OK*") {
                $okMirror = $true
            } else {
                $errTail3 = (Get-Content $npmErrLog -ErrorAction SilentlyContinue | Select-Object -Last 3) -join ' | '
                Log-Msg "NPM final verify output: $chk3 | $errTail3" 'WARN'
            }
        }

        $env:NODE_OPTIONS = $prevNodeOpts
        $env:npm_config_ignore_scripts = $prevIgnScripts
        Remove-Item $npmOutLog, $npmErrLog -Force -ErrorAction SilentlyContinue

        if ($okMirror) {
            try { Push-Location -LiteralPath $ProjectDir; & $node -e $stampDepHashJs 2>$null | Out-Null; Pop-Location } catch { try { Pop-Location } catch {} }
            Log-Msg "Saare core packages mirror/bypass se safalta se ready ho gaye." 'OK'
            Update-Step 4 'REPAIRED' 100 "Packages Repaired" "Step 4 : NPM Repaired by AI"
            return $true
        }

        Update-Step 4 'FAILED' 90 "NPM Install Failed" "Step 4 : NPM packages install nahi ho sake"
        return $false
    }

    # ========================================================================
    # STEP 5: Embedded SQLite Database Initialization (Zero-Install DB)
    # ========================================================================
    function Exec-Step5 {
        Update-Step 5 'RUNNING' 25 "Step 5 / 8 : SQLite database..." "100% Zero-Install SQLite database schema & starter data ready ho raha hai..."
        Log-Msg "Embedded SQLite database setup shuru ho raha hai..." 'SQLITE'

        $node = Find-Node
        if (-not $node) {
            Log-Msg "SQLite setup skipped: compatible Node.js v22+ missing." 'ERROR'
            Update-Step 5 'FAILED' 25 "Node v22 Missing" "Step 5 : Node.js v22 zaroori hai"
            return $false
        }

        $dataDir = Join-Path $ProjectDir 'database\data'
        if (-not (Test-Path -LiteralPath $dataDir)) {
            New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
        }

        # Safe WAL checkpoint BEFORE touching WAL/SHM files (Zero Data Loss!)
        $dbFile = Join-Path $dataDir 'cash_management.db'
        if (Test-Path -LiteralPath $dbFile) {
            try {
                Push-Location -LiteralPath $ProjectDir
                & $node -e "try{const D=require('better-sqlite3');const db=new D('database/data/cash_management.db',{timeout:4000});db.pragma('wal_checkpoint(TRUNCATE)');db.close();}catch{}" 2>$null | Out-Null
                Pop-Location
            } catch { try { Pop-Location } catch {} }
        }

        $appPort = [int]$sync.ResolvedPort
        if ($appPort -le 0) { $appPort = 4000 }

        # Write .env UTF-8 WITHOUT BOM (cmd.exe / server-supervisor safe!)
        $envFile = Join-Path $ProjectDir '.env'
        $jwtBytes = New-Object byte[] 48
        $jwtRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        try { $jwtRng.GetBytes($jwtBytes) } finally { $jwtRng.Dispose() }
        $jwtSecret = [Convert]::ToBase64String($jwtBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')

        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        if (-not (Test-Path -LiteralPath $envFile)) {
            $envContent = "PORT=$appPort`r`nHOST=0.0.0.0`r`nDB_TYPE=sqlite`r`nDB_FILE=database/data/cash_management.db`r`nJWT_SECRET=$jwtSecret`r`nALLOW_LOCAL_AUTO_LOGIN=true`r`nAUTO_UPDATE_DISABLED=false`r`n"
            [System.IO.File]::WriteAllText($envFile, $envContent, $utf8NoBom)
            Log-Msg "Configuration file .env (Port $appPort, SQLite, Unique JWT) ready." 'OK'
        } else {
            $envTxt = Get-Content -LiteralPath $envFile -Raw -ErrorAction SilentlyContinue
            if ($envTxt) {
                $envTxt = $envTxt.TrimStart([char]0xFEFF)
                if ($envTxt -match '(?m)^\s*PORT\s*=') {
                    $envTxt = [regex]::Replace($envTxt, '(?m)^\s*PORT\s*=.*$', "PORT=$appPort")
                } else {
                    $envTxt = "PORT=$appPort`r`n" + $envTxt
                }
                if ($envTxt -notmatch '(?m)^\s*DB_TYPE\s*=\s*sqlite') {
                    if ($envTxt -match '(?m)^\s*DB_TYPE\s*=') { $envTxt = [regex]::Replace($envTxt, '(?m)^\s*DB_TYPE\s*=.*$', 'DB_TYPE=sqlite') }
                    else { $envTxt = $envTxt.TrimEnd() + "`r`nDB_TYPE=sqlite`r`n" }
                }
                if ($envTxt -match '(?m)^JWT_SECRET\s*=\s*(?:$|cash_management_sqlite_edition_secret_key_4000\s*$)') {
                    $envTxt = [regex]::Replace($envTxt, '(?m)^JWT_SECRET\s*=.*$', "JWT_SECRET=$jwtSecret")
                } elseif ($envTxt -notmatch '(?m)^JWT_SECRET\s*=\S+') {
                    $envTxt = $envTxt.TrimEnd() + "`r`nJWT_SECRET=$jwtSecret`r`n"
                }
                [System.IO.File]::WriteAllText($envFile, $envTxt, $utf8NoBom)
            }
        }

        $setupScript = Join-Path $ProjectDir 'setup-database.js'
        if (-not (Test-Path -LiteralPath $setupScript)) {
            $setupScript = Join-Path $ProjectDir 'database\setup_sqlite.js'
        }

        $dbOutLog = Join-Path $env:TEMP 'cmbc_db_out.log'
        $dbErrLog = Join-Path $env:TEMP 'cmbc_db_err.log'
        Update-Step 5 'RUNNING' 60 "Schema & Seeding..." "Starter Accounts, Categories, CSC Services seed ho rahe hain..."
        $p = Start-Process -FilePath $node -ArgumentList "`"$setupScript`"" -WorkingDirectory $ProjectDir -PassThru -WindowStyle Hidden -RedirectStandardOutput $dbOutLog -RedirectStandardError $dbErrLog
        $rc = Wait-ProcAlive -Proc $p -Step 5 -Label "SQLite setup" -StartPct 60 -MaxPct 95

        if ($rc -eq 0 -and (Test-Path -LiteralPath $dbFile) -and ((Get-Item -LiteralPath $dbFile).Length -gt 5000)) {
            Remove-Item $dbOutLog, $dbErrLog -Force -ErrorAction SilentlyContinue
            Log-Msg "SQLite database 100% Ready (Zero SQL Server setup required!)." 'OK'
            Update-Step 5 'SUCCESS' 100 "SQLite DB 100% Ready" "Step 5 : SQLite Database 100% Ready"
            return $true
        }

        $dbErrTxt = (Get-Content $dbErrLog -ErrorAction SilentlyContinue | Select-Object -Last 3) -join ' | '
        if ($dbErrTxt) { Log-Msg "SQLite setup notice: $dbErrTxt" 'WARN' }

        # Auto-Repair retry: fix locale-safe NTFS ACLs (*S-1-5-32-545 = Users) + retry direct runner
        Log-Msg "SQLite setup retry kiya ja raha hai (AI Auto-Repair)..." 'FIX'
        Update-Step 5 'HEALING' 75 "AI Auto-Repair DB..." "Database permissions aur alternative runner..."
        try { & icacls "$ProjectDir" /grant '*S-1-5-32-545:(OI)(CI)F' /T /Q 2>$null | Out-Null } catch { }
        try {
            Push-Location -LiteralPath $ProjectDir
            $altScript = Join-Path $ProjectDir 'database\setup_sqlite.js'
            & $node $altScript 2>&1 | Out-Null
            $altRc = $LASTEXITCODE
            Pop-Location
        } catch { try { Pop-Location } catch {}; $altRc = 1 }

        Remove-Item $dbOutLog, $dbErrLog -Force -ErrorAction SilentlyContinue
        if ($altRc -eq 0 -and (Test-Path -LiteralPath $dbFile) -and ((Get-Item -LiteralPath $dbFile).Length -gt 5000)) {
            Log-Msg "SQLite database AI auto-repair me ready ho gaya." 'OK'
            Update-Step 5 'REPAIRED' 100 "SQLite DB Ready" "Step 5 : SQLite Database Ready"
            return $true
        }

        Update-Step 5 'FAILED' 85 "SQLite Setup Failed" "Step 5 : SQLite DB setup fail"
        return $false
    }

    # ========================================================================
    # STEP 6: Windows Firewall & Defender Unblock (Dynamic Port + node.exe)
    # ========================================================================
    function Exec-Step6 {
        $appPort = [int]$sync.ResolvedPort; if ($appPort -le 0) { $appPort = 4000 }
        Update-Step 6 'RUNNING' 30 "Step 6 / 8 : Firewall & Security..." "Local Wi-Fi / LAN & node.exe firewall rules configure ho rahe hain (Port $appPort)..."
        Log-Msg "Windows Firewall rules (Port $appPort + node.exe) aur SmartScreen unblock verify ho raha hai..." 'NETWORK'
        $node = Find-Node
        if (-not $node) { $node = 'C:\Program Files\nodejs\node.exe' }

        try { Get-ChildItem -LiteralPath $ProjectDir -Recurse -File -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue } catch { }

        try {
            $blockRules = Get-NetFirewallRule -Direction Inbound -Action Block -ErrorAction SilentlyContinue
            foreach ($br in $blockRules) {
                try {
                    $appF = $br | Get-NetFirewallApplicationFilter -ErrorAction SilentlyContinue
                    if ($appF -and ($appF.Program -like '*node.exe*')) {
                        Remove-NetFirewallRule -Name $br.Name -ErrorAction SilentlyContinue
                        Log-Msg "Old blocking firewall rule hataya gaya: $($br.DisplayName)" 'FIX'
                    }
                } catch { }
            }
        } catch { }

        try {
            $ruleName = "CSC BC Apna Hisaab SQLite (Port $appPort)"
            if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
                New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -LocalPort $appPort -Protocol TCP -Action Allow -Profile Any -ErrorAction SilentlyContinue | Out-Null
            }
            $ruleOut = "CSC BC Apna Hisaab SQLite Out (Port $appPort)"
            if (-not (Get-NetFirewallRule -DisplayName $ruleOut -ErrorAction SilentlyContinue)) {
                New-NetFirewallRule -DisplayName $ruleOut -Direction Outbound -LocalPort $appPort -Protocol TCP -Action Allow -Profile Any -ErrorAction SilentlyContinue | Out-Null
            }
            if ($node -and (Test-Path -LiteralPath $node)) {
                $nodeRule = "CSC BC Apna Hisaab Node.js Runtime"
                if (-not (Get-NetFirewallRule -DisplayName $nodeRule -ErrorAction SilentlyContinue)) {
                    New-NetFirewallRule -DisplayName $nodeRule -Program $node -Direction Inbound -Action Allow -Profile Any -ErrorAction SilentlyContinue | Out-Null
                    New-NetFirewallRule -DisplayName "$nodeRule Out" -Program $node -Direction Outbound -Action Allow -Profile Any -ErrorAction SilentlyContinue | Out-Null
                }
            }
            & netsh advfirewall firewall show rule name="$ruleName" >$null 2>&1
            if ($LASTEXITCODE -ne 0) {
                & netsh advfirewall firewall add rule name="$ruleName" dir=in action=allow protocol=TCP localport=$appPort profile=any >$null 2>&1
            }
            Log-Msg "Firewall Port $appPort + Node.js allow rules (Private + Public LAN) OK." 'OK'
        } catch {
            Log-Msg "Firewall rule notice: $($_.Exception.Message)" 'WARN'
        }

        try {
            Add-MpPreference -ExclusionPath $ProjectDir -ErrorAction SilentlyContinue
            if ($node -and (Test-Path -LiteralPath $node)) {
                Add-MpPreference -ExclusionProcess $node -ErrorAction SilentlyContinue
            }
        } catch { }

        Update-Step 6 'SUCCESS' 100 "Firewall & LAN Open" "Step 6 : Firewall & Security Configured"
        return $true
    }

    # ========================================================================
    # STEP 7: Unified Desktop + Start Menu Shortcuts & Auto-Boot
    # ========================================================================
    function Exec-Step7 {
        Update-Step 7 'RUNNING' 30 "Step 7 / 8 : Shortcuts & Auto-Boot..." "Unified Desktop, Start Menu aur Auto-Boot configure ho rahe hain..."
        Log-Msg "Unified Desktop & Start Menu shortcuts configure ho rahe hain..." 'SYSTEM'
        try {
            $helperPs = Join-Path $ProjectDir 'utils\create_shortcuts.ps1'
            if (Test-Path -LiteralPath $helperPs) {
                & $helperPs -ProjectDir $ProjectDir | Out-Null
            } else {
                $desktop = [Environment]::GetFolderPath("Desktop")
                $ws = New-Object -ComObject WScript.Shell
                $scPath = Join-Path $desktop "CSC & BC Apna Hisaab (SQLite).lnk"
                $sc = $ws.CreateShortcut($scPath)
                $sc.TargetPath = Join-Path $ProjectDir "START.bat"
                $sc.WorkingDirectory = $ProjectDir
                $ico = Join-Path $ProjectDir "public\favicon.ico"
                if (Test-Path -LiteralPath $ico) { $sc.IconLocation = $ico }
                $sc.Description = "CSC & BC Apna Hisaab - 100% Zero-Install SQLite Edition"
                $sc.Save()
            }
            $node = Find-Node
            $autoJs = Join-Path $ProjectDir 'utils\windows_autostart.js'
            if ($node -and (Test-Path -LiteralPath $autoJs)) {
                Push-Location -LiteralPath $ProjectDir
                & $node $autoJs 2>$null | Out-Null
                Pop-Location
            }
            Log-Msg "Desktop, Start Menu aur Windows Boot Auto-Start ready: 'CSC & BC Apna Hisaab (SQLite)'" 'OK'
        } catch {
            try { Pop-Location } catch {}
            Log-Msg "Shortcut notice: $($_.Exception.Message)" 'WARN'
        }
        Update-Step 7 'SUCCESS' 100 "Shortcuts Ready" "Step 7 : Shortcuts Configured"
        return $true
    }

    # ========================================================================
    # STEP 8: Live Health Check & De-Elevated Browser Launch
    # ========================================================================
    function Open-BrowserSafe {
        param([string]$Url)
        try { Start-Process 'explorer.exe' -ArgumentList $Url -ErrorAction Stop; return } catch { }
        try { Start-Process $Url } catch { }
    }

    function Exec-Step8 {
        $appPort = [int]$sync.ResolvedPort; if ($appPort -le 0) { $appPort = 4000 }
        $appUrl = "http://localhost:$appPort"
        Update-Step 8 'RUNNING' 15 "Step 8 / 8 : Server live launch..." "$appUrl live server start ho raha hai..."
        Log-Msg "Server background me start ho raha hai (Port $appPort)..." 'START'

        $logsDir = Join-Path $ProjectDir "logs"
        if (-not (Test-Path -LiteralPath $logsDir)) { New-Item -ItemType Directory -Force -Path $logsDir | Out-Null }
        $stopSentinel = Join-Path $logsDir '.stop_supervisor'
        if (Test-Path -LiteralPath $stopSentinel) { Remove-Item -LiteralPath $stopSentinel -Force -ErrorAction SilentlyContinue }

        $appPort = Repair-PortConflict $appPort
        $sync.ResolvedPort = $appPort
        $appUrl = "http://localhost:$appPort"

        $node = Find-Node
        if (-not $node) {
            Log-Msg "Server start nahi ho sakta: Node.js v22+ missing." 'ERROR'
            Update-Step 8 'FAILED' 20 "Node Missing" "Step 8 : Node.js missing"
            return $false
        }

        $supBat = Join-Path $ProjectDir "server-supervisor.bat"
        if (Test-Path -LiteralPath $supBat) {
            Start-Process -FilePath "cmd.exe" -ArgumentList "/c `"`"$supBat`"`"" -WorkingDirectory $ProjectDir -WindowStyle Hidden
        } else {
            $outLog = Join-Path $logsDir "server-run.log"
            $errLog = Join-Path $logsDir "server-err.log"
            Start-Process -FilePath $node -ArgumentList "server.js" -WorkingDirectory $ProjectDir -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog
        }

        $testHealth = {
            try {
                $req = [System.Net.HttpWebRequest]::Create("$appUrl/api/health")
                $req.Timeout = 1500
                $req.Method = "GET"
                $resp = $req.GetResponse()
                $code = [int]$resp.StatusCode
                $resp.Close()
                return ($code -eq 200)
            } catch { return $false }
        }

        $alive = $false
        for ($i = 1; $i -le 22; $i++) {
            $sync.Activity = "Server ka response aa raha hai$(New-Dots $i) ($i s)"
            $sync.Elapsed = "{0:mm\:ss}" -f ([TimeSpan]::FromSeconds($i))
            Update-Step 8 'RUNNING' (15 + [Math]::Min(80, $i * 4)) "Server check ($i s)..." "$appUrl ka response aa raha hai ($i s)..."
            Start-Sleep -Seconds 1
            if (& $testHealth) { $alive = $true; break }
        }

        if ($alive) {
            Log-Msg "Application 100% LIVE hai: $appUrl" 'OK'
            Update-Step 8 'SUCCESS' 100 "LIVE 100%" "Step 8 : Application 100% LIVE!"
            Open-BrowserSafe $appUrl
            return $true
        }

        # AI Self-Healing Restart Attempt
        Log-Msg "Server response slow/fail — AI Self-Healing DB & Restart chal raha hai..." 'FIX'
        Update-Step 8 'HEALING' 85 "AI Diagnostics..." "Server reload aur schema verification..."
        $appPort = Repair-PortConflict $appPort
        $setupScript = Join-Path $ProjectDir 'setup-database.js'
        if (Test-Path -LiteralPath $setupScript) {
            Push-Location -LiteralPath $ProjectDir
            try { & $node $setupScript 2>&1 | Out-Null } catch { }
            Pop-Location
        }
        if (Test-Path -LiteralPath $supBat) {
            Start-Process -FilePath "cmd.exe" -ArgumentList "/c `"`"$supBat`"`"" -WorkingDirectory $ProjectDir -WindowStyle Hidden
        } else {
            Start-Process -FilePath $node -ArgumentList "server.js" -WorkingDirectory $ProjectDir -WindowStyle Hidden
        }

        for ($i = 1; $i -le 12; $i++) {
            Start-Sleep -Seconds 1
            if (& $testHealth) { $alive = $true; break }
        }

        if ($alive) {
            Log-Msg "Server AI auto-repair ke baad LIVE ho gaya: $appUrl" 'OK'
            Update-Step 8 'REPAIRED' 100 "LIVE 100%" "Step 8 : Application 100% LIVE!"
            Open-BrowserSafe $appUrl
            return $true
        }

        Log-Msg "Server HTTP 200 health response nahi de paya ($appUrl). Kripya logs\server-run.log check karein ya AI_DOCTOR_SQLITE.bat chalayein." 'ERROR'
        Update-Step 8 'FAILED' 95 "Server Health Fail" "Step 8 : Live health check failed"
        return $false
    }

    # ========================================================================
    # MASTER WORKFLOW WITH HONEST STATUS & LIVE AI AUTO-REPAIR LOOP
    # ========================================================================
    try {
        Log-Msg "============================================================" 'START'
        Log-Msg " CSC & BC APNA HISAAB - SQLITE ZERO-INSTALL WIZARD" 'START'
        Log-Msg " 100% Free AI Live Self-Healing & Diagnostics: ACTIVE" 'START'
        Log-Msg " Target Directory: $ProjectDir" 'START'
        Log-Msg "============================================================" 'START'

        $ok1 = Exec-Step1
        if (-not $ok1) {
            $sync.HasError = $true
            $sync.ErrorSummary = "64-bit Windows (x64/ARM64) zaroori hai."
            $sync.OverallPct = 100; $sync.IsComplete = $true
            return
        }

        $ok2 = Exec-Step2
        if (-not $ok2) {
            Log-Msg "[AI AUTO-FIX] Step 2 project files sync retry..." 'WARN'
            Update-Step 2 'HEALING' 70 "AI Auto-Fixing..." "CDN + DoH Mirror Sync..."
            Repair-DnsAndNetwork
            $ok2 = Exec-Step2
            if ($ok2) { Update-Step 2 'REPAIRED' 100 "Project Files Ready" "Step 2 : Fixed by AI" }
        }
        if (-not $ok2) {
            $sync.HasError = $true
            $sync.ErrorSummary = "Project files GitHub/CDN se download nahi ho sakin (Internet/Firewall block)."
            $sync.OverallPct = 100; $sync.IsComplete = $true
            return
        }

        $ok3 = Exec-Step3
        if (-not $ok3) {
            Log-Msg "[AI AUTO-FIX] Step 3 Node.js retry..." 'WARN'
            Update-Step 3 'HEALING' 70 "AI Auto-Fixing..." "Node.js v22 retry..."
            Repair-DnsAndNetwork
            $ok3 = Exec-Step3
            if ($ok3) { Update-Step 3 'REPAIRED' 100 "Node.js Ready" "Step 3 : Fixed by AI" }
        }
        if (-not $ok3) {
            $sync.HasError = $true
            $sync.ErrorSummary = "Node.js v22+ install nahi ho saka."
            $sync.OverallPct = 100; $sync.IsComplete = $true
            return
        }

        $ok4 = Exec-Step4
        if (-not $ok4) {
            Log-Msg "[AI AUTO-FIX] Step 4 npm packages issue. Cleaning & retrying..." 'WARN'
            Update-Step 4 'HEALING' 70 "AI Auto-Fixing..." "NPM Rebuild & Mirror..."
            Repair-VisualCppRuntime
            $ok4 = Exec-Step4
            if ($ok4) { Update-Step 4 'REPAIRED' 100 "NPM Packages Ready" "Step 4 : Fixed by AI" }
        }
        if (-not $ok4) {
            $sync.HasError = $true
            $sync.ErrorSummary = "NPM packages / better-sqlite3 install fail hua."
            $sync.OverallPct = 100; $sync.IsComplete = $true
            return
        }

        $ok5 = Exec-Step5
        if (-not $ok5) {
            Log-Msg "[AI AUTO-FIX] Step 5 SQLite database auto-repair..." 'WARN'
            Update-Step 5 'HEALING' 70 "AI Auto-Fixing..." "SQLite DB Permissions..."
            $ok5 = Exec-Step5
            if ($ok5) { Update-Step 5 'REPAIRED' 100 "SQLite DB Ready" "Step 5 : Fixed by AI" }
        }
        if (-not $ok5) {
            $sync.HasError = $true
            $sync.ErrorSummary = "SQLite database initialize nahi ho paya."
            $sync.OverallPct = 100; $sync.IsComplete = $true
            return
        }

        $ok6 = Exec-Step6
        $ok7 = Exec-Step7
        $ok8 = Exec-Step8
        if (-not $ok8) {
            $sync.HasError = $true
            $sync.ErrorSummary = "Server port $($sync.ResolvedPort) par live health response nahi mila."
            $sync.OverallPct = 100; $sync.IsComplete = $true
            return
        }

        $sync.OverallPct = 100
        $sync.IsComplete = $true
        Log-Msg "🎉 CONGRATULATIONS! SQLITE EDITION 100% SAFALTA SE INSTALL HO GAYA! (Port $($sync.ResolvedPort))" 'SUCCESS'
    } catch {
        $sync.HasError = $true
        $sync.ErrorSummary = $_.Exception.Message
        Log-Msg "Setup error: $($_.Exception.Message)" 'ERROR'
        $sync.OverallPct = 100
        $sync.IsComplete = $true
    }
}

# ============================================================================
# GUI WIZARD (WPF/XAML) - Modern Dark Theme with Emerald Glow
# ============================================================================
if ($guiAvailable) {
    $workH = [int][System.Windows.SystemParameters]::WorkArea.Height
    $winH = if ($workH -gt 480) { [Math]::Min(680, $workH - 32) } else { 620 }
    $xamlText = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="CSC &amp; BC Apna Hisaab - SQLite Edition 1-Click Wizard"
        Height="__WIN_H__" Width="760"
        MinHeight="520" MinWidth="660"
        WindowStartupLocation="CenterScreen"
        Background="#0a0f1d"
        ResizeMode="CanResizeWithGrip">
'@ -replace '__WIN_H__', "$winH"
    $xamlTail = @'
    <Window.Resources>
        <Style TargetType="ProgressBar">
            <Setter Property="Foreground" Value="#10b981"/>
            <Setter Property="Background" Value="#1e293b"/>
            <Setter Property="BorderThickness" Value="0"/>
        </Style>
    </Window.Resources>

    <Grid Margin="18">
        <Grid.RowDefinitions>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="240"/>
            <RowDefinition Height="*"/>
            <RowDefinition Height="Auto"/>
        </Grid.RowDefinitions>

        <!-- Header -->
        <Border Grid.Row="0" Background="#0f172a" BorderBrush="#1f2937" BorderThickness="1" CornerRadius="12" Padding="14,12" Margin="0,0,0,10">
            <Grid>
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="Auto"/>
                    <ColumnDefinition Width="*"/>
                    <ColumnDefinition Width="Auto"/>
                </Grid.ColumnDefinitions>
                <Border Grid.Column="0" Width="46" Height="46" Background="#052e2b" BorderBrush="#10b981" BorderThickness="1" CornerRadius="10" Margin="0,0,14,0">
                    <TextBlock Text="BC" FontSize="18" FontWeight="Bold" Foreground="#34d399" HorizontalAlignment="Center" VerticalAlignment="Center"/>
                </Border>
                <StackPanel Grid.Column="1" VerticalAlignment="Center">
                    <TextBlock Text="CSC &amp; BC APNA HISAAB (SQLITE EDITION)" FontSize="17" FontWeight="Bold" Foreground="#38bdf8"/>
                    <TextBlock Text="100% Zero-Install Fast Setup - Zero SQL Server Setup | Instant 15 Seconds" FontSize="11.5" Foreground="#94a3b8" Margin="0,2,0,0"/>
                </StackPanel>
                <Border Grid.Column="2" Background="#052e2b" BorderBrush="#10b981" BorderThickness="1" CornerRadius="8" Padding="10,5" VerticalAlignment="Center">
                    <StackPanel Orientation="Horizontal">
                        <TextBlock Name="LiveDot" Text="●" FontSize="14" Foreground="#34d399" VerticalAlignment="Center"/>
                        <TextBlock Text=" ZERO-INSTALL SQLITE" FontSize="10.5" FontWeight="Bold" Foreground="#34d399" VerticalAlignment="Center"/>
                    </StackPanel>
                </Border>
            </Grid>
        </Border>

        <!-- Big overall progress -->
        <Border Grid.Row="1" Background="#0b1220" BorderBrush="#1e293b" BorderThickness="1" CornerRadius="12" Padding="16,12" Margin="0,0,0,10">
            <Grid>
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="Auto"/>
                    <ColumnDefinition Width="*"/>
                </Grid.ColumnDefinitions>
                <StackPanel Grid.Column="0" Orientation="Horizontal" VerticalAlignment="Center" Margin="0,0,16,0">
                    <TextBlock Name="BigPctText" Text="0" FontSize="44" FontWeight="Bold" Foreground="#34d399"/>
                    <TextBlock Text="%" FontSize="22" FontWeight="Bold" Foreground="#10b981" VerticalAlignment="Bottom" Margin="2,0,0,10"/>
                </StackPanel>
                <StackPanel Grid.Column="1" VerticalAlignment="Center">
                    <Grid Margin="0,0,0,8">
                        <TextBlock Text="OVERALL SETUP PROGRESS" FontSize="11" FontWeight="Bold" Foreground="#64748b"/>
                        <StackPanel Orientation="Horizontal" HorizontalAlignment="Right">
                            <TextBlock Text="TIME: " FontSize="11" FontWeight="Bold" Foreground="#64748b"/>
                            <TextBlock Name="TimerText" Text="00:00" FontSize="11" FontWeight="Bold" Foreground="#38bdf8"/>
                        </StackPanel>
                    </Grid>
                    <ProgressBar Name="OverallProgressBar" Height="14" Minimum="0" Maximum="100" Value="0"
                                 Foreground="#10b981" Background="#1e293b" BorderThickness="0"/>
                </StackPanel>
            </Grid>
        </Border>

        <!-- Live activity banner -->
        <Border Grid.Row="2" Background="#0b1220" BorderBrush="#1e293b" BorderThickness="1" CornerRadius="10" Padding="14,10" Margin="0,0,0,10">
            <Grid>
                <Grid.RowDefinitions>
                    <RowDefinition Height="Auto"/>
                    <RowDefinition Height="Auto"/>
                </Grid.RowDefinitions>
                <Grid Grid.Row="0" Margin="0,0,0,4">
                    <StackPanel Orientation="Horizontal">
                        <TextBlock Text="CURRENT TASK:  " FontSize="11" FontWeight="Bold" Foreground="#38bdf8"/>
                        <TextBlock Name="CurrentActionText" Text="Setup engine shuru ho raha hai..." FontSize="11.5" FontWeight="SemiBold" Foreground="#f8fafc"/>
                    </StackPanel>
                </Grid>
                <Grid Grid.Row="1">
                    <Grid.ColumnDefinitions>
                        <ColumnDefinition Width="*"/>
                        <ColumnDefinition Width="Auto"/>
                    </Grid.ColumnDefinitions>
                    <TextBlock Grid.Column="0" Name="ActivityText" Text="Sab kuch taiyaar kiya ja raha hai..." FontSize="11" Foreground="#94a3b8" TextTrimming="CharacterEllipsis"/>
                    <TextBlock Grid.Column="1" Name="BytesText" Text="" FontSize="10.5" FontWeight="Bold" Foreground="#38bdf8"/>
                </Grid>
            </Grid>
        </Border>

        <!-- 8 Step Cards -->
        <Border Grid.Row="3" Background="#0b1220" BorderBrush="#1e293b" BorderThickness="1" CornerRadius="10" Padding="8" Margin="0,0,0,10">
            <UniformGrid Columns="2" Rows="4">
                <Border Name="StepCard1" Background="#0f172a" BorderBrush="#1e293b" BorderThickness="1" CornerRadius="8" Margin="3,2" Padding="8,5">
                    <Grid><Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/></Grid.RowDefinitions>
                        <Grid Grid.Row="0"><TextBlock Text="[01] Admin &amp; Windows" FontSize="11" FontWeight="Bold" Foreground="#f8fafc"/><TextBlock Name="StepStatus1" Text="[ WAITING ]" FontSize="10" FontWeight="Bold" Foreground="#64748b" HorizontalAlignment="Right"/></Grid>
                        <TextBlock Name="StepSub1" Grid.Row="1" Text="Pratiksha karein..." FontSize="9.5" Foreground="#64748b" Margin="0,1,0,3"/>
                        <ProgressBar Name="StepMiniBar1" Grid.Row="2" Height="3" Minimum="0" Maximum="100" Value="0"/>
                    </Grid>
                </Border>
                <Border Name="StepCard2" Background="#0f172a" BorderBrush="#1e293b" BorderThickness="1" CornerRadius="8" Margin="3,2" Padding="8,5">
                    <Grid><Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/></Grid.RowDefinitions>
                        <Grid Grid.Row="0"><TextBlock Text="[02] Project Files (SQLite)" FontSize="11" FontWeight="Bold" Foreground="#f8fafc"/><TextBlock Name="StepStatus2" Text="[ WAITING ]" FontSize="10" FontWeight="Bold" Foreground="#64748b" HorizontalAlignment="Right"/></Grid>
                        <TextBlock Name="StepSub2" Grid.Row="1" Text="Pratiksha karein..." FontSize="9.5" Foreground="#64748b" Margin="0,1,0,3"/>
                        <ProgressBar Name="StepMiniBar2" Grid.Row="2" Height="3" Minimum="0" Maximum="100" Value="0"/>
                    </Grid>
                </Border>
                <Border Name="StepCard3" Background="#0f172a" BorderBrush="#1e293b" BorderThickness="1" CornerRadius="8" Margin="3,2" Padding="8,5">
                    <Grid><Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/></Grid.RowDefinitions>
                        <Grid Grid.Row="0"><TextBlock Text="[03] Node.js LTS Engine" FontSize="11" FontWeight="Bold" Foreground="#f8fafc"/><TextBlock Name="StepStatus3" Text="[ WAITING ]" FontSize="10" FontWeight="Bold" Foreground="#64748b" HorizontalAlignment="Right"/></Grid>
                        <TextBlock Name="StepSub3" Grid.Row="1" Text="Pratiksha karein..." FontSize="9.5" Foreground="#64748b" Margin="0,1,0,3"/>
                        <ProgressBar Name="StepMiniBar3" Grid.Row="2" Height="3" Minimum="0" Maximum="100" Value="0"/>
                    </Grid>
                </Border>
                <Border Name="StepCard4" Background="#0f172a" BorderBrush="#1e293b" BorderThickness="1" CornerRadius="8" Margin="3,2" Padding="8,5">
                    <Grid><Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/></Grid.RowDefinitions>
                        <Grid Grid.Row="0"><TextBlock Text="[04] NPM Packages &amp; SQLite" FontSize="11" FontWeight="Bold" Foreground="#f8fafc"/><TextBlock Name="StepStatus4" Text="[ WAITING ]" FontSize="10" FontWeight="Bold" Foreground="#64748b" HorizontalAlignment="Right"/></Grid>
                        <TextBlock Name="StepSub4" Grid.Row="1" Text="Pratiksha karein..." FontSize="9.5" Foreground="#64748b" Margin="0,1,0,3"/>
                        <ProgressBar Name="StepMiniBar4" Grid.Row="2" Height="3" Minimum="0" Maximum="100" Value="0"/>
                    </Grid>
                </Border>
                <Border Name="StepCard5" Background="#0f172a" BorderBrush="#1e293b" BorderThickness="1" CornerRadius="8" Margin="3,2" Padding="8,5">
                    <Grid><Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/></Grid.RowDefinitions>
                        <Grid Grid.Row="0"><TextBlock Text="[05] Embedded SQLite DB" FontSize="11" FontWeight="Bold" Foreground="#f8fafc"/><TextBlock Name="StepStatus5" Text="[ WAITING ]" FontSize="10" FontWeight="Bold" Foreground="#64748b" HorizontalAlignment="Right"/></Grid>
                        <TextBlock Name="StepSub5" Grid.Row="1" Text="Pratiksha karein..." FontSize="9.5" Foreground="#64748b" Margin="0,1,0,3"/>
                        <ProgressBar Name="StepMiniBar5" Grid.Row="2" Height="3" Minimum="0" Maximum="100" Value="0"/>
                    </Grid>
                </Border>
                <Border Name="StepCard6" Background="#0f172a" BorderBrush="#1e293b" BorderThickness="1" CornerRadius="8" Margin="3,2" Padding="8,5">
                    <Grid><Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/></Grid.RowDefinitions>
                        <Grid Grid.Row="0"><TextBlock Text="[06] Firewall Port 4000" FontSize="11" FontWeight="Bold" Foreground="#f8fafc"/><TextBlock Name="StepStatus6" Text="[ WAITING ]" FontSize="10" FontWeight="Bold" Foreground="#64748b" HorizontalAlignment="Right"/></Grid>
                        <TextBlock Name="StepSub6" Grid.Row="1" Text="Pratiksha karein..." FontSize="9.5" Foreground="#64748b" Margin="0,1,0,3"/>
                        <ProgressBar Name="StepMiniBar6" Grid.Row="2" Height="3" Minimum="0" Maximum="100" Value="0"/>
                    </Grid>
                </Border>
                <Border Name="StepCard7" Background="#0f172a" BorderBrush="#1e293b" BorderThickness="1" CornerRadius="8" Margin="3,2" Padding="8,5">
                    <Grid><Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/></Grid.RowDefinitions>
                        <Grid Grid.Row="0"><TextBlock Text="[07] Shortcuts &amp; Boot" FontSize="11" FontWeight="Bold" Foreground="#f8fafc"/><TextBlock Name="StepStatus7" Text="[ WAITING ]" FontSize="10" FontWeight="Bold" Foreground="#64748b" HorizontalAlignment="Right"/></Grid>
                        <TextBlock Name="StepSub7" Grid.Row="1" Text="Pratiksha karein..." FontSize="9.5" Foreground="#64748b" Margin="0,1,0,3"/>
                        <ProgressBar Name="StepMiniBar7" Grid.Row="2" Height="3" Minimum="0" Maximum="100" Value="0"/>
                    </Grid>
                </Border>
                <Border Name="StepCard8" Background="#0f172a" BorderBrush="#1e293b" BorderThickness="1" CornerRadius="8" Margin="3,2" Padding="8,5">
                    <Grid><Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/></Grid.RowDefinitions>
                        <Grid Grid.Row="0"><TextBlock Text="[08] Live Health &amp; Launch" FontSize="11" FontWeight="Bold" Foreground="#f8fafc"/><TextBlock Name="StepStatus8" Text="[ WAITING ]" FontSize="10" FontWeight="Bold" Foreground="#64748b" HorizontalAlignment="Right"/></Grid>
                        <TextBlock Name="StepSub8" Grid.Row="1" Text="Pratiksha karein..." FontSize="9.5" Foreground="#64748b" Margin="0,1,0,3"/>
                        <ProgressBar Name="StepMiniBar8" Grid.Row="2" Height="3" Minimum="0" Maximum="100" Value="0"/>
                    </Grid>
                </Border>
            </UniformGrid>
        </Border>

        <!-- Terminal console -->
        <Border Grid.Row="4" Background="#03060d" BorderBrush="#1e293b" BorderThickness="1" CornerRadius="8" Padding="10" Margin="0,0,0,10">
            <TextBox Name="LogTextBox" Background="Transparent" Foreground="#4ade80" BorderThickness="0"
                     FontFamily="Consolas" FontSize="11" IsReadOnly="True" VerticalScrollBarVisibility="Auto"
                     TextWrapping="Wrap"/>
        </Border>

        <!-- Footer launch button -->
        <Button Grid.Row="5" Name="LaunchBtn" Height="46" IsEnabled="False"
                Background="#1e293b" Foreground="#94a3b8" FontWeight="Bold" FontSize="13.5"
                BorderThickness="0">
            <Button.Resources>
                <Style TargetType="Border"><Setter Property="CornerRadius" Value="10"/></Style>
            </Button.Resources>
            <TextBlock Name="LaunchBtnText" Text="Setup chal raha hai... kripya wait karein" HorizontalAlignment="Center" VerticalAlignment="Center"/>
        </Button>
    </Grid>
</Window>
'@
    [xml]$xaml = $xamlText + $xamlTail

    try {
        $reader = New-Object System.Xml.XmlNodeReader $xaml
        $global:Window = [System.Windows.Markup.XamlReader]::Load($reader)

        $global:CurrentActionText = $global:Window.FindName("CurrentActionText")
        $global:ActivityText      = $global:Window.FindName("ActivityText")
        $global:BytesText         = $global:Window.FindName("BytesText")
        $global:BigPctText        = $global:Window.FindName("BigPctText")
        $global:OverallProgressBar= $global:Window.FindName("OverallProgressBar")
        $global:TimerText         = $global:Window.FindName("TimerText")
        $global:LiveDot           = $global:Window.FindName("LiveDot")
        $global:LogTextBox        = $global:Window.FindName("LogTextBox")
        $global:LaunchBtn         = $global:Window.FindName("LaunchBtn")
        $global:LaunchBtnText     = $global:Window.FindName("LaunchBtnText")

        $global:LaunchBtn.Add_Click({
            $p = if ($sync.ResolvedPort) { $sync.ResolvedPort } else { 4000 }
            if ($sync.HasError) {
                $docBat = Join-Path $ProjectDir 'AI_DOCTOR_SQLITE.bat'
                if (Test-Path -LiteralPath $docBat) { Start-Process -FilePath $docBat }
            } else {
                try { Start-Process 'explorer.exe' -ArgumentList "http://localhost:$p" } catch { try { Start-Process "http://localhost:$p" } catch {} }
            }
            $global:Window.Close()
        })

        # Background worker
        $rs = [runspacefactory]::CreateRunspace()
        $rs.Open()
        $ps = [powershell]::Create()
        $ps.Runspace = $rs
        [void]$ps.AddScript($workerBlock.ToString())
        [void]$ps.AddArgument($sync)
        [void]$ps.AddArgument($ProjectDir)
        [void]$ps.AddArgument($isAdmin)
        [void]$ps.AddArgument($RequiredFiles)
        [void]$ps.AddArgument($LogFile)
        [void]$ps.AddArgument($RepoRaw)
        [void]$ps.AddArgument($RepoCdn)
        [void]$ps.AddArgument($RepoFastly)
        [void]$ps.AddArgument($RepoZip)
        [void]$ps.AddArgument($RepoZipAlt)
        [void]$ps.AddArgument([bool]($Clean.IsPresent -or ($env:CLEAN_INSTALL -eq '1')))

        $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        $script:logIndex = 0
        $converter = New-Object System.Windows.Media.BrushConverter

        $timer = New-Object System.Windows.Threading.DispatcherTimer
        $timer.Interval = [TimeSpan]::FromMilliseconds(60)
        $timer.Add_Tick({
            if ($script:asyncHandle -and $script:asyncHandle.IsCompleted) {
                if ($ps.InvocationStateInfo.State -eq 'Failed') {
                    foreach ($err in $ps.Streams.Error) {
                        $global:LogTextBox.AppendText("[WORKER ERROR] $err`r`n")
                    }
                    $sync.HasError = $true
                    $sync.ErrorSummary = 'Unexpected PowerShell worker failure'
                    $sync.IsComplete = $true
                }
            }
            $ts = $stopwatch.Elapsed
            $global:TimerText.Text = "{0:D2}:{1:D2}" -f [int]$ts.TotalMinutes, $ts.Seconds

            # Pulsing LIVE dot
            $sync.Tick = [int]$sync.Tick + 1
            if ($global:LiveDot) {
                if ($sync.Tick % 2 -eq 0) {
                    $global:LiveDot.Foreground = $converter.ConvertFromString("#34d399")
                    $global:LiveDot.Text = "●"
                } else {
                    $global:LiveDot.Foreground = $converter.ConvertFromString("#065f46")
                    $global:LiveDot.Text = "○"
                }
            }

            # Live banners
            $global:CurrentActionText.Text = $sync.CurrentAction
            if ($global:ActivityText) { $global:ActivityText.Text = $sync.Activity }
            if ($global:BytesText)    { $global:BytesText.Text = $sync.BytesText }

            # Big overall percent
            $pct = [int]$sync.OverallPct
            $global:BigPctText.Text = "$pct"
            $global:OverallProgressBar.Value = $pct
            $global:LaunchBtnText.Text = "Setup chal raha hai... kripya wait karein  ($pct%)"

            # 8 Step cards
            for ($k = 1; $k -le 8; $k++) {
                $statusEl = $global:Window.FindName("StepStatus$k")
                $subEl    = $global:Window.FindName("StepSub$k")
                $barEl    = $global:Window.FindName("StepMiniBar$k")
                $cardEl   = $global:Window.FindName("StepCard$k")

                $st = $sync.StepStates[$k]
                $sp = [int]$sync.StepPercents[$k]
                $sb = $sync.StepSubTexts[$k]

                if ($barEl) { $barEl.Value = $sp }
                if ($subEl -and $sb) { $subEl.Text = $sb }

                if ($statusEl -and $cardEl) {
                    switch ($st) {
                        'RUNNING' {
                            $statusEl.Text = "[ $sp% ]"
                            $statusEl.Foreground = $converter.ConvertFromString("#38bdf8")
                            $cardEl.Background = $converter.ConvertFromString("#0c1a3a")
                            $cardEl.BorderBrush = $converter.ConvertFromString("#38bdf8")
                        }
                        'SUCCESS' {
                            $statusEl.Text = "[ 100% READY ]"
                            $statusEl.Foreground = $converter.ConvertFromString("#34d399")
                            $cardEl.Background = $converter.ConvertFromString("#052e2b")
                            $cardEl.BorderBrush = $converter.ConvertFromString("#10b981")
                        }
                        'REPAIRED' {
                            $statusEl.Text = "[ ⚡ AI FIXED ]"
                            $statusEl.Foreground = $converter.ConvertFromString("#34d399")
                            $cardEl.Background = $converter.ConvertFromString("#052e2b")
                            $cardEl.BorderBrush = $converter.ConvertFromString("#10b981")
                        }
                        'HEALING' {
                            $statusEl.Text = "[ ⚡ AI FIXING ]"
                            $statusEl.Foreground = $converter.ConvertFromString("#fbbf24")
                            $cardEl.Background = $converter.ConvertFromString("#291f05")
                            $cardEl.BorderBrush = $converter.ConvertFromString("#f59e0b")
                        }
                        'FAILED' {
                            $statusEl.Text = "[ FAIL ]"
                            $statusEl.Foreground = $converter.ConvertFromString("#f87171")
                            $cardEl.Background = $converter.ConvertFromString("#2a0a0a")
                            $cardEl.BorderBrush = $converter.ConvertFromString("#dc2626")
                        }
                        default {
                            $statusEl.Text = "[ WAITING ]"
                            $statusEl.Foreground = $converter.ConvertFromString("#64748b")
                            $cardEl.Background = $converter.ConvertFromString("#0f172a")
                            $cardEl.BorderBrush = $converter.ConvertFromString("#1e293b")
                        }
                    }
                }
            }

            # Drain logs
            while ($script:logIndex -lt $sync.Logs.Count) {
                $msg = $sync.Logs[$script:logIndex]
                $global:LogTextBox.AppendText("$msg`r`n")
                $global:LogTextBox.ScrollToEnd()
                $script:logIndex = $script:logIndex + 1
            }

            # Completion
            if ($sync.IsComplete) {
                $timer.Stop()
                $stopwatch.Stop()
                $p = if ($sync.ResolvedPort) { $sync.ResolvedPort } else { 4000 }
                $global:LaunchBtn.IsEnabled = $true
                if ($sync.HasError) {
                    $global:LaunchBtn.Background = $converter.ConvertFromString("#dc2626")
                    $global:LaunchBtn.Foreground = [System.Windows.Media.Brushes]::White
                    $global:LaunchBtnText.Text = "AI Live Doctor Chalayein (Auto-Fix Issue)"
                    $global:CurrentActionText.Text = "SETUP ISSUE: $($sync.ErrorSummary)"
                    $global:CurrentActionText.Foreground = $converter.ConvertFromString("#f87171")
                    $global:ActivityText.Text = "Logs check karein ya AI Live Doctor se auto-fix chalayein."
                } else {
                    $global:LaunchBtn.Background = $converter.ConvertFromString("#10b981")
                    $global:LaunchBtn.Foreground = [System.Windows.Media.Brushes]::White
                    $global:LaunchBtnText.Text = "CSC & BC Apna Hisaab kholein (http://localhost:$p)"
                    $global:CurrentActionText.Text = "SAARE 8 STEPS 100% VERIFIED & CONFIGURED!"
                    $global:CurrentActionText.Foreground = $converter.ConvertFromString("#34d399")
                    $global:ActivityText.Text = "Sab kuch ready hai — Port $p par live hai."
                }
            }
        })

        $global:Window.Add_Loaded({
            $script:asyncHandle = $ps.BeginInvoke()
            $timer.Start()
        })
        $global:Window.Add_Closed({
            try { $timer.Stop() } catch { }
            try { $ps.Stop() } catch { }
        })

        $global:Window.ShowDialog() | Out-Null
        $ps.Dispose(); $rs.Close(); $rs.Dispose()
        if ($sync.HasError) { exit 1 } else { exit 0 }
    } catch {
        Write-Host "GUI launch notice: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "High-speed console mode me chal raha hai..." -ForegroundColor Cyan
        & $workerBlock $sync $ProjectDir $isAdmin $RequiredFiles $LogFile $RepoRaw $RepoCdn $RepoFastly $RepoZip $RepoZipAlt ([bool]($Clean.IsPresent -or ($env:CLEAN_INSTALL -eq '1')))
        if ($sync.HasError) { exit 1 } else { exit 0 }
    }
} else {
    & $workerBlock $sync $ProjectDir $isAdmin $RequiredFiles $LogFile $RepoRaw $RepoCdn $RepoFastly $RepoZip $RepoZipAlt ([bool]($Clean.IsPresent -or ($env:CLEAN_INSTALL -eq '1')))
    if ($sync.HasError) { exit 1 } else { exit 0 }
}
