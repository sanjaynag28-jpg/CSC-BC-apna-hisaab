param(
    [Parameter(Mandatory = $true)][string]$ProjectDir
)

# ============================================================================
# CSC & BC Apna Hisaab - Unified Desktop + Start Menu shortcut helper
# - Single consistent shortcut: "CSC & BC Apna Hisaab (SQLite).lnk"
# - Target: wscript.exe -> open-app.vbs (silent launch, zero console window)
# - Removes duplicate legacy "CSC BC Apna Hisaab (SQLite).lnk" if present
# ============================================================================

$ErrorActionPreference = 'SilentlyContinue'
$resolved = Resolve-Path -LiteralPath $ProjectDir -ErrorAction SilentlyContinue
if ($resolved) { $ProjectDir = $resolved.Path }
if (-not $ProjectDir -or -not (Test-Path -LiteralPath $ProjectDir)) {
    Write-Output 'invalid ProjectDir'
    exit 1
}

$vbs = Join-Path $ProjectDir 'open-app.vbs'
$startBat = Join-Path $ProjectDir 'START.bat'
if (-not (Test-Path -LiteralPath $vbs)) {
    Write-Output 'open-app.vbs missing'
    exit 1
}

$wscript = Join-Path $env:WINDIR 'System32\wscript.exe'
$icon = Join-Path $ProjectDir 'public\favicon.ico'

# Fallback to START.bat if Windows Script Host is disabled by policy
$wshEnabled = $true
foreach ($regPath in @(
    'HKCU:\Software\Microsoft\Windows Script Host\Settings',
    'HKLM:\Software\Microsoft\Windows Script Host\Settings'
)) {
    if (Test-Path $regPath) {
        $val = (Get-ItemProperty -Path $regPath -Name 'Enabled' -ErrorAction SilentlyContinue).Enabled
        if ($val -eq 0) { $wshEnabled = $false }
    }
}

$targetExe = if ($wshEnabled -and (Test-Path -LiteralPath $wscript)) { $wscript } else { $startBat }
$targetArgs = if ($targetExe -eq $wscript) { '"' + $vbs + '"' } else { '' }

try {
    $shell = New-Object -ComObject WScript.Shell
} catch {
    Write-Output ('COM error: ' + $_.Exception.Message)
    exit 1
}

$folders = @(
    [Environment]::GetFolderPath('Desktop'),
    [Environment]::GetFolderPath('Programs')
)

$created = 0
foreach ($folder in $folders) {
    if ([string]::IsNullOrWhiteSpace($folder)) { continue }
    if (-not (Test-Path -LiteralPath $folder)) { continue }

    # Clean old duplicate name without '&'
    $legacyLnk = Join-Path $folder 'CSC BC Apna Hisaab (SQLite).lnk'
    if (Test-Path -LiteralPath $legacyLnk) {
        Remove-Item -LiteralPath $legacyLnk -Force -ErrorAction SilentlyContinue
    }

    $lnkPath = Join-Path $folder 'CSC & BC Apna Hisaab (SQLite).lnk'

    if (Test-Path -LiteralPath $lnkPath) {
        $existing = $shell.CreateShortcut($lnkPath)
        $iconMatch = (-not (Test-Path -LiteralPath $icon)) -or ($existing.IconLocation -like "$icon*")
        if ($existing.TargetPath -eq $targetExe -and $existing.Arguments -eq $targetArgs -and $existing.WorkingDirectory -eq $ProjectDir -and $iconMatch) {
            continue
        }
    }

    $sc = $shell.CreateShortcut($lnkPath)
    $sc.TargetPath = $targetExe
    $sc.Arguments = $targetArgs
    $sc.WorkingDirectory = $ProjectDir
    $sc.Description = 'CSC & BC Apna Hisaab - Cash Management System (SQLite Edition)'
    if (Test-Path -LiteralPath $icon) { $sc.IconLocation = $icon }
    $sc.Save()
    $created++
}

Write-Output ('shortcuts updated: ' + $created)
exit 0
