@echo off
setlocal EnableExtensions
title CSC ^& BC Apna Hisaab - Master 1-Click Installer
color 0B

:: Auto-elevate to Administrator (safe for paths with spaces)
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [..] Requesting Administrator permission for automatic installation...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"

:: Case 1: Running inside existing project folder
if exist "%~dp0scripts\installer_wizard.ps1" (
    echo ======================================================================
    echo   CSC ^& BC APNA HISAAB - SETUP ^& HEALTH ENGINE
    echo ======================================================================
    echo.
    echo   [..] Checking for latest Setup Engine updates from CDN...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; try { Invoke-WebRequest -Uri 'https://cdn.jsdelivr.net/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab@main/scripts/installer_wizard.ps1' -OutFile '%~dp0scripts\installer_wizard.ps1' -UseBasicParsing -TimeoutSec 10 } catch { }"
    
    echo   [..] Launching Graphical Setup Wizard...
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\installer_wizard.ps1" -ProjectDir "%~dp0"
    set "EXIT_CODE=%errorlevel%"
    
    echo.
    echo ======================================================================
    echo   Setup complete (Code: %EXIT_CODE%).
    echo   Log File: %~dp0logs\install_wizard.log
    echo.
    echo   Window band karne ke liye koi bhi key dabayein...
    echo ======================================================================
    pause
    exit /b %EXIT_CODE%
)

:: Case 2: Standalone mode (single file on new / incomplete PC)
set "TARGET_DIR=%USERPROFILE%\CSC-BC-Apna-Hisaab"
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"
set "TEMP_WIZ=%TEMP%\cmbc_installer_wizard.ps1"

cls
echo ======================================================================
echo   CSC ^& BC APNA HISAAB - 100%% AUTOMATIC 1-CLICK INSTALLER
echo ======================================================================
echo.
echo   Target Folder : %TARGET_DIR%
echo   Status        : Connecting to High-Speed CDN...
echo.

echo [1/3] Downloading High-Speed Setup Engine...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $p='%TEMP_WIZ%'; $urls=@('https://cdn.jsdelivr.net/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab@main/scripts/installer_wizard.ps1','https://raw.githubusercontent.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/main/scripts/installer_wizard.ps1'); $ok=$false; foreach($u in $urls){ try { Write-Host ('  [..] Connecting to ' + ([Uri]$u).Host + '...') -ForegroundColor Yellow; Invoke-WebRequest -Uri $u -OutFile $p -UseBasicParsing -TimeoutSec 15; if((Test-Path $p) -and (Get-Item $p).Length -gt 5000){ $ok=$true; Write-Host '  [OK] Setup Engine loaded!' -ForegroundColor Green; break } } catch { Write-Host ('  [!] Notice: ' + $_.Exception.Message) -ForegroundColor Gray } }; if(-not $ok){ exit 1 }"

if errorlevel 1 (
    echo.
    echo [!] Direct script blocked. Downloading full package archive from GitHub...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $z=Join-Path $env:TEMP 'cmbc_repo.zip'; Invoke-WebRequest -Uri 'https://github.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/archive/refs/heads/main.zip' -OutFile $z -UseBasicParsing -TimeoutSec 90; $e=Join-Path $env:TEMP ('cmbc_e_' + (Get-Random)); Expand-Archive -LiteralPath $z -DestinationPath $e -Force; $s=(Get-ChildItem -Path $e -Directory | Select-Object -First 1).FullName; robocopy $s '%TARGET_DIR%' /E /XD (Join-Path $s '.git') (Join-Path $s 'node_modules') (Join-Path $s 'backups') (Join-Path $s 'logs') /XF '.env' /NFL /NDL /NJH /NJS | Out-Null; Copy-Item (Join-Path '%TARGET_DIR%' 'scripts\installer_wizard.ps1') '%TEMP_WIZ%' -Force"
)

echo.
echo ======================================================================
echo   [2/3] Launching Graphical Setup ^& Health Wizard...
echo ======================================================================
echo.

set "FINAL_WIZ=%TEMP_WIZ%"
if not exist "%FINAL_WIZ%" (
    if exist "%TARGET_DIR%\scripts\installer_wizard.ps1" (
        set "FINAL_WIZ=%TARGET_DIR%\scripts\installer_wizard.ps1"
    )
)

if not exist "%FINAL_WIZ%" (
    echo [X] Error: Setup Wizard download nahi ho paya.
    echo     Kripya Internet / Mobile Hotspot check karein.
    echo.
    pause
    exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%FINAL_WIZ%" -ProjectDir "%TARGET_DIR%"
set "EXIT_CODE=%errorlevel%"

echo.
echo ======================================================================
echo   [3/3] Setup Engine Process Completed (Code: %EXIT_CODE%)
echo   Log File: %TARGET_DIR%\logs\install_wizard.log
echo.
echo   Window band karne ke liye koi bhi key dabayein...
echo ======================================================================
pause
exit /b %EXIT_CODE%
