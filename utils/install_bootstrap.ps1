param(
    [string]$InstallDir = (Join-Path $env:USERPROFILE 'CSC-BC-Apna-Hisaab-SQLite')
)

$ErrorActionPreference = 'Stop'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType](3072 -bor 12288) } catch { try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]3072 } catch {} }
$RepoZipUrl = 'https://github.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/archive/refs/heads/sqlite.zip'
$TmpRoot = Join-Path $env:TEMP ('cmbc_bootstrap_' + (Get-Random))
$LogDir = Join-Path $InstallDir 'logs'
$LogFile = Join-Path $LogDir 'install.log'

function Write-Log {
    param([string]$Message, [string]$Level = 'INFO')
    $line = "[{0}] [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
    try {
        if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }
        Add-Content -Path $LogFile -Value $line -Encoding UTF8
    } catch { }
    switch ($Level) {
        'OK'    { Write-Host ("  [OK] " + $Message) -ForegroundColor Green }
        'WARN'  { Write-Host ("  [!]  " + $Message) -ForegroundColor Yellow }
        'ERROR' { Write-Host ("  [X]  " + $Message) -ForegroundColor Red }
        default { Write-Host $Message }
    }
}

function Invoke-DownloadResume {
    param([string]$Url, [string]$Path, [int]$Attempts = 6)
    for ($i = 1; $i -le $Attempts; $i++) {
        try {
            if (Test-Path -LiteralPath $Path) { Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue }
            $req = [System.Net.HttpWebRequest]::Create($Url)
            $req.UserAgent = 'CMBC-Installer/1.0'
            $req.Timeout = 120000
            $req.ReadWriteTimeout = 120000
            $req.AllowAutoRedirect = $true
            $resp = $req.GetResponse()
            $fs = New-Object System.IO.FileStream($Path, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
            try {
                $resp.GetResponseStream().CopyTo($fs)
            } finally {
                $fs.Close()
                $resp.Close()
            }
            return $true
        } catch {
            Write-Log ("Download attempt $i/$Attempts failed: " + $_.Exception.Message) 'WARN'
            Start-Sleep -Seconds ([Math]::Min(20, 2 * $i))
        }
    }
    return $false
}

function Test-ZipValid {
    param([string]$Path)
    try {
        Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction SilentlyContinue
        $zip = [System.IO.Compression.ZipFile]::OpenRead($Path)
        $count = $zip.Entries.Count
        $zip.Dispose()
        return ($count -gt 20)
    } catch {
        return $false
    }
}

function Expand-ZipSafe {
    param([string]$ZipPath, [string]$DestPath, [int]$Attempts = 3)
    for ($i = 1; $i -le $Attempts; $i++) {
        try {
            if (Test-Path $DestPath) { Remove-Item $DestPath -Recurse -Force }
            New-Item -ItemType Directory -Force -Path $DestPath | Out-Null
            Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction SilentlyContinue
            [System.IO.Compression.ZipFile]::ExtractToDirectory($ZipPath, $DestPath)
            return $true
        } catch {
            Write-Log ("Extract attempt $i/$Attempts failed: " + $_.Exception.Message) 'WARN'
            Start-Sleep -Seconds (2 * $i)
        }
    }
    return $false
}

$SkipNames = @('.env', '.git', 'backups', 'logs', 'node_modules', 'config', '.auto-update-tmp', '.previous-release', '.antigravity', 'bin')

function Copy-ProjectFiles {
    param([string]$SourceDir, [string]$TargetDir)
    New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
    Get-ChildItem -Path $SourceDir -Force | ForEach-Object {
        if ($SkipNames -contains $_.Name) { return }
        $dest = Join-Path $TargetDir $_.Name
        if ($_.PSIsContainer) {
            if ($_.Name -eq 'public' -or $_.Name -eq 'database') {
                New-Item -ItemType Directory -Force -Path $dest | Out-Null
                $exclude = if ($_.Name -eq 'public') { 'uploads' } else { 'data' }
                Get-ChildItem -LiteralPath $_.FullName -Force | Where-Object { $_.Name -ne $exclude } | ForEach-Object {
                    Copy-Item -LiteralPath $_.FullName -Destination $dest -Recurse -Force
                }
            } else {
                Copy-Item -LiteralPath $_.FullName -Destination $dest -Recurse -Force
            }
        } else {
            Copy-Item -LiteralPath $_.FullName -Destination $dest -Force
        }
    }
}

$RequiredFiles = @{
    'server.js'                        = 2000
    'package.json'                     = 200
    'package-lock.json'                = 1000
    'SETUP.bat'                        = 200
    'setup-database.js'                = 400
    'database\sqlite_schema.sql'       = 5000
    'database\setup_sqlite.js'         = 1000
    'scripts\installer_wizard_sqlite.ps1' = 5000
    'public\index.html'                = 50000
    'public\app.js'                    = 50000
    'routes\auth.js'                   = 500
    'middleware\auth.js'               = 500
    'utils\autoUpdater.js'             = 1000
}

function Test-ProjectIntegrity {
    param([string]$Dir)
    $bad = @()
    foreach ($rel in $RequiredFiles.Keys) {
        $p = Join-Path $Dir $rel
        if (-not (Test-Path $p)) { $bad += $rel; continue }
        if ((Get-Item $p).Length -lt $RequiredFiles[$rel]) { $bad += $rel }
    }
    return $bad
}

function Remove-BrokenCode {
    param([string]$Dir)
    foreach ($name in @('routes', 'utils', 'middleware', 'scripts', 'extension', 'tests', 'scratch')) {
        $p = Join-Path $Dir $name
        if (Test-Path $p) { Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue }
    }
    $dbDir = Join-Path $Dir 'database'
    if (Test-Path $dbDir) {
        Get-ChildItem $dbDir -Force | Where-Object { $_.Name -ne 'data' } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    }
    $publicDir = Join-Path $Dir 'public'
    if (Test-Path $publicDir) {
        Get-ChildItem $publicDir -Force | Where-Object { $_.Name -ne 'uploads' } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    }
    foreach ($f in @('server.js', 'package.json', 'package-lock.json', 'setup-database.js', 'ONE_CLICK_SETUP.bat', 'INSTALL_FROM_GITHUB.bat', 'START.bat', 'START_SILENT.bat', 'UPDATE_APP.bat', 'PUBLISH_UPDATE.bat', 'start-hidden.vbs', 'open-app.vbs', 'server-supervisor.bat', 'version.json', '.env.example', '.gitignore', 'README.md', 'PROJECT_RULES.md', 'eng.traineddata')) {
        $p = Join-Path $Dir $f
        if (Test-Path $p) { Remove-Item $p -Force -ErrorAction SilentlyContinue }
    }
}

try {
    Write-Host '============================================================'
    Write-Host '   CSC & BC APNA HISAAB - SMART 1-CLICK INSTALLER'
    Write-Host '   (auto-retry + resume + corrupt-file repair)'
    Write-Host '============================================================'
    Write-Log "Installer start. Target: $InstallDir"

    New-Item -ItemType Directory -Force -Path $TmpRoot | Out-Null
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

    $zipPath = Join-Path $TmpRoot 'app.zip'
    $downloadOk = $false
    for ($round = 1; $round -le 3 -and -not $downloadOk; $round++) {
        Write-Host ""
        Write-Host ("[1/3] Project download (round $round/3, resume supported)...") -ForegroundColor Cyan
        if (Test-Path $zipPath) { Remove-Item $zipPath -Force -ErrorAction SilentlyContinue }
        if (Invoke-DownloadResume -Url $RepoZipUrl -Path $zipPath -Attempts 6) {
            if (Test-ZipValid -Path $zipPath) {
                $downloadOk = $true
            } else {
                Write-Log 'Downloaded ZIP corrupt - deleting and retrying...' 'WARN'
            }
        }
    }
    if (-not $downloadOk) {
        throw 'Project download 3 rounds ke baad bhi fail/corrupt. Internet check karke dobara chalayein.'
    }
    Write-Log 'Project ZIP downloaded and validated.' 'OK'

    $extractDir = Join-Path $TmpRoot 'extracted'
    if (-not (Expand-ZipSafe -ZipPath $zipPath -DestPath $extractDir)) {
        throw 'ZIP extract nahi ho paya (corrupt archive).'
    }
    $src = Get-ChildItem -Path $extractDir -Directory | Select-Object -First 1
    if (-not $src) { throw 'Downloaded ZIP empty hai.' }

    Write-Host ""
    Write-Host '[2/3] Copying project files (aapka data safe rahega)...' -ForegroundColor Cyan
    Copy-ProjectFiles -SourceDir $src.FullName -TargetDir $InstallDir

    $bad = Test-ProjectIntegrity -Dir $InstallDir
    if ($bad.Count -gt 0) {
        Write-Log ("Corrupt/missing files detected: " + ($bad -join ', ')) 'WARN'
        Write-Host '[2/3] Repair mode: purane broken files hata kar fresh copy ho rahi hai...' -ForegroundColor Yellow
        Remove-BrokenCode -Dir $InstallDir
        Copy-ProjectFiles -SourceDir $src.FullName -TargetDir $InstallDir
        $bad = Test-ProjectIntegrity -Dir $InstallDir
        if ($bad.Count -gt 0) {
            throw ("Fresh copy ke baad bhi files missing/corrupt: " + ($bad -join ', '))
        }
    }
    Write-Log 'Project files verified (integrity OK).' 'OK'

    Remove-Item $TmpRoot -Recurse -Force -ErrorAction SilentlyContinue

    Write-Host ""
    Write-Host '[3/3] Running complete setup (Node.js v22 + Embedded SQLite + Firewall + Silent Auto-Start)...' -ForegroundColor Cyan
    $setupBat = Join-Path $InstallDir 'SETUP.bat'
    if (-not (Test-Path -LiteralPath $setupBat)) { throw 'SETUP.bat nahi mila - project files incomplete.' }

    $setupOk = $false
    for ($i = 1; $i -le 2 -and -not $setupOk; $i++) {
        Write-Log "Setup attempt $i/2 start"
        & $setupBat
        if ($LASTEXITCODE -eq 0) {
            $setupOk = $true
        } else {
            Write-Log ("Setup attempt $i/2 fail (exit " + $LASTEXITCODE + ")") 'WARN'
            if ($i -lt 2) { Start-Sleep -Seconds 5 }
        }
    }
    if (-not $setupOk) { throw 'Setup 2 attempts ke baad complete nahi hua. Log check karein.' }

    Write-Log 'Installation complete.' 'OK'
    Write-Host ''
    Write-Host '============================================================' -ForegroundColor Green
    Write-Host '   INSTALL COMPLETE - server background me chal raha hai' -ForegroundColor Green
    Write-Host '============================================================' -ForegroundColor Green
    exit 0
} catch {
    Write-Log ("FATAL: " + $_.Exception.Message) 'ERROR'
    Write-Host ''
    Write-Host ('  [X] Install fail: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host ('  Log file: ' + $LogFile) -ForegroundColor Yellow
    Write-Host '  Internet check karke SETUP.bat dobara chalayein - retry automatic hai.' -ForegroundColor Yellow
    exit 1
} finally {
    try { if (Test-Path $TmpRoot) { Remove-Item $TmpRoot -Recurse -Force -ErrorAction SilentlyContinue } } catch { }
}
