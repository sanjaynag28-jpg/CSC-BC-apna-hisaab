@echo off
title CSC & BC Apna Hisaab - Direct 1-Click GitHub Installer
:: ============================================================================
:: Direct 1-Click Installer from GitHub ZIP:
:: Downloads https://github.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/archive/refs/heads/main.zip
:: Extracts into C:\CSC-BC-Apna-Hisaab and launches ONE_CLICK_SETUP.bat automatically!
:: ============================================================================

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator permission for 1-Click Installation...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo ============================================================
echo   CSC ^& BC APNA HISAAB - DIRECT 1-CLICK GITHUB INSTALLER
echo ============================================================
echo.
echo [1/2] GitHub se latest project ZIP download ^& extract ho raha hai...
echo       Folder: C:\CSC-BC-Apna-Hisaab
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$zipUrl='https://github.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/archive/refs/heads/main.zip';" ^
  "$installDir='C:\CSC-BC-Apna-Hisaab';" ^
  "$tmpDir=Join-Path $env:TEMP ('cmbc_gh_install_' + (Get-Random));" ^
  "$zipPath=Join-Path $tmpDir 'app.zip';" ^
  "New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null;" ^
  "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" ^
  "Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing;" ^
  "$extDir=Join-Path $tmpDir 'ext';" ^
  "Expand-Archive -LiteralPath $zipPath -DestinationPath $extDir -Force;" ^
  "$src=(Get-ChildItem -Path $extDir -Directory | Select-Object -First 1).FullName;" ^
  "if (!(Test-Path $installDir)) { New-Item -ItemType Directory -Force -Path $installDir | Out-Null };" ^
  "$skip=@('.env','backups','logs','node_modules','database\data','public\uploads');" ^
  "Get-ChildItem -Path $src -Force | ForEach-Object {" ^
  "  if ($skip -contains $_.Name) { return };" ^
  "  $dst=Join-Path $installDir $_.Name;" ^
  "  if ($_.PSIsContainer) { Copy-Item -Path $_.FullName -Destination $installDir -Recurse -Force }" ^
  "  else { Copy-Item -Path $_.FullName -Destination $dst -Force }" ^
  "};" ^
  "Remove-Item -Path $tmpDir -Recurse -Force -ErrorAction SilentlyContinue;" ^
  "Write-Host '  [OK] Project files extracted cleanly to C:\CSC-BC-Apna-Hisaab!' -ForegroundColor Green;"

if %errorlevel% neq 0 (
    echo [X] Download/Extract failed! Internet connection check karein.
    pause
    exit /b 1
)

echo.
echo [2/2] Launching Complete 1-Click Setup (Node.js + SQL Server + Database + App)...
cd /d "C:\CSC-BC-Apna-Hisaab"
call "C:\CSC-BC-Apna-Hisaab\ONE_CLICK_SETUP.bat"
