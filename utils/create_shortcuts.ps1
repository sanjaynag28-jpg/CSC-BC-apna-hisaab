param(
    [Parameter(Mandatory = $true)][string]$ProjectDir
)

# ============================================================================
# CSC & BC Apna Hisaab - Desktop + Start Menu shortcut helper
# - Shortcut "CSC BC Apna Hisaab" banata/badalta hai (idempotent)
# - Target: wscript.exe -> open-app.vbs (koi console window nahi)
# - Admin rights ki zaroorat nahi
# ============================================================================

$ErrorActionPreference = 'SilentlyContinue'
$ProjectDir = (Resolve-Path $ProjectDir).Path

$vbs = Join-Path $ProjectDir 'open-app.vbs'
if (-not (Test-Path $vbs)) {
    Write-Output 'open-app.vbs missing'
    exit 1
}

$wscript = Join-Path $env:WINDIR 'System32\wscript.exe'
$icon = Join-Path $ProjectDir 'public\favicon.ico'

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
    if (-not (Test-Path $folder)) { continue }

    $lnkPath = Join-Path $folder 'CSC BC Apna Hisaab.lnk'

    # Pehle se sahi shortcut hai to chhedo mat
    if (Test-Path $lnkPath) {
        $existing = $shell.CreateShortcut($lnkPath)
        $expectedArgs = '"' + $vbs + '"'
        if ($existing.TargetPath -eq $wscript -and $existing.Arguments -eq $expectedArgs) {
            continue
        }
    }

    $sc = $shell.CreateShortcut($lnkPath)
    $sc.TargetPath = $wscript
    $sc.Arguments = '"' + $vbs + '"'
    $sc.WorkingDirectory = $ProjectDir
    $sc.Description = 'CSC & BC Apna Hisaab - Cash Management System (silent auto-start)'
    if (Test-Path $icon) { $sc.IconLocation = $icon }
    $sc.Save()
    $created++
}

Write-Output ('shortcuts updated: ' + $created)
exit 0
