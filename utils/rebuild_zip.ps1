$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$zipPath = Join-Path $root 'INSTALL_NOW.zip'
Remove-Item $zipPath -Force -ErrorAction SilentlyContinue

$tempDir = Join-Path $env:TEMP ('cmbc_zip_' + (Get-Random))
New-Item -ItemType Directory -Path (Join-Path $tempDir 'scripts') -Force | Out-Null

Copy-Item (Join-Path $root 'INSTALL_NOW.bat') $tempDir
Copy-Item (Join-Path $root 'CLEAN_FRESH_INSTALL.bat') $tempDir
Copy-Item (Join-Path $root 'scripts\installer_wizard.ps1') (Join-Path $tempDir 'scripts')
Copy-Item (Join-Path $root 'scripts\ai_doctor.ps1') (Join-Path $tempDir 'scripts')

Compress-Archive -Path (Join-Path $tempDir '*') -DestinationPath $zipPath -Force
Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "INSTALL_NOW.zip generated successfully. Size: $((Get-Item $zipPath).Length) bytes"
