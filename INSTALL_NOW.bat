@echo off
setlocal EnableExtensions
title CSC ^& BC Apna Hisaab - Master 1-Click Installer

:: ============================================================================
:: CSC & BC APNA HISAAB - 100%% FOOLPROOF 1-CLICK MASTER INSTALLER
:: ============================================================================
:: Features:
:: 1. Works whether run inside project folder OR downloaded as a single standalone file from GitHub!
:: 2. Auto-elevates to Administrator with UAC prompt.
:: 3. Opens a high-tech modern WPF GUI Window showing 11 real-time progress steps.
:: 4. Auto-detects and repairs any corrupt or missing files (fresh download from GitHub).
:: 5. Auto-installs Node.js LTS and Microsoft SQL Server Express if missing.
:: 6. Auto-configures TCP/IP, Mixed Mode Auth, .env, Database Tables, and Firewall.
:: 7. Auto-creates Desktop Shortcut, Auto-starts server, and opens http://localhost:3000.
:: 8. 100%% Data Safe: Never overwrites existing .env, uploaded documents, or database!
:: ============================================================================

:: Auto-elevate to Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator permission for automatic setup...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"

:: Case 1: Running inside existing project directory
if exist "%~dp0scripts\installer_wizard.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\installer_wizard.ps1" -ProjectDir "%~dp0"
    exit /b %errorlevel%
)

:: Case 2: Running standalone (user only downloaded INSTALL_NOW.bat from GitHub into Downloads/Desktop)
set "TARGET_DIR=%USERPROFILE%\CSC-BC-Apna-Hisaab"
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"

echo ======================================================================
echo   CSC ^& BC APNA HISAAB - STANDALONE 1-CLICK INSTALLER
echo ======================================================================
echo.
echo   Target Folder: %TARGET_DIR%
echo   GUI Setup Wizard bootstrap ho raha hai...
echo.

set "WIZARD_URL=https://raw.githubusercontent.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/main/scripts/installer_wizard.ps1"
set "TEMP_WIZARD=%TEMP%\cmbc_installer_wizard.ps1"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" ^
  "for($i=1;$i -le 6;$i++){" ^
  "  try {" ^
  "    Invoke-WebRequest -Uri '%WIZARD_URL%' -OutFile '%TEMP_WIZARD%' -UseBasicParsing -TimeoutSec 45;" ^
  "    if((Test-Path '%TEMP_WIZARD%') -and (Get-Item '%TEMP_WIZARD%').Length -gt 5000){ exit 0 }" ^
  "  } catch { Start-Sleep -Seconds 2 }" ^
  "}; exit 1"

if exist "%TEMP_WIZARD%" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%TEMP_WIZARD%" -ProjectDir "%TARGET_DIR%"
    exit /b %errorlevel%
)

:: Direct fallback: download full zip if raw script download was blocked
echo [!] Fallback: GitHub complete project archive download...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$zipUrl='https://github.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/archive/refs/heads/main.zip';" ^
  "$zipFile=Join-Path $env:TEMP 'cmbc_main.zip';" ^
  "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;" ^
  "Invoke-WebRequest -Uri $zipUrl -OutFile $zipFile -UseBasicParsing -TimeoutSec 180;" ^
  "Expand-Archive -LiteralPath $zipFile -DestinationPath $env:TEMP\cmbc_main_ext -Force;" ^
  "$src=(Get-ChildItem -Path $env:TEMP\cmbc_main_ext -Directory | Select-Object -First 1).FullName;" ^
  "robocopy $src '%TARGET_DIR%' /E /XD (Join-Path $src '.git') (Join-Path $src 'node_modules') (Join-Path $src 'backups') (Join-Path $src 'logs') (Join-Path $src 'public\uploads') (Join-Path $src 'database\data') /XF '.env' /NFL /NDL /NJH /NJS | Out-Null;"

if exist "%TARGET_DIR%\scripts\installer_wizard.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%TARGET_DIR%\scripts\installer_wizard.ps1" -ProjectDir "%TARGET_DIR%"
    exit /b %errorlevel%
)

echo.
echo [X] Installation failed. Internet connection check karein aur dobara chalayein.
pause
exit /b 1
