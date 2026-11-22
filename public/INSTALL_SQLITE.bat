@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
title CSC ^& BC Apna Hisaab - SQLite Edition 1-Click Wizard
color 0A

:: ====================================================================
:: 1. Auto-elevate to Administrator
:: ====================================================================
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [..] Administrator permission mang rahe hain...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd.exe -ArgumentList '/k \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"

:: Kill lingering processes upfront
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM wscript.exe >nul 2>&1

:: ====================================================================
:: 2. Launch Graphical Wizard (Inside Project Folder)
:: ====================================================================
if exist "%~dp0scripts\installer_wizard_sqlite.ps1" (
    echo ======================================================================
    echo   CSC ^& BC APNA HISAAB - SQLITE EDITION GRAPHICAL WIZARD
    echo ======================================================================
    echo.
    echo   [..] Launching Graphical Setup Wizard...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\installer_wizard_sqlite.ps1" -ProjectDir "%~dp0"
    set "EXIT_CODE=%errorlevel%"
    echo.
    echo ======================================================================
    echo   Setup complete (Code: %EXIT_CODE%).
    echo   Window band karne ke liye koi bhi key dabayein...
    echo ======================================================================
    pause >nul
    exit /b %EXIT_CODE%
)

:: ====================================================================
:: 3. Standalone Mode (On Brand-New PC)
:: ====================================================================
set "TARGET_DIR=%USERPROFILE%\CSC-BC-Apna-Hisaab-SQLite"
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"
set "WIZ_SCRIPT=%TEMP%\cmbc_installer_wizard_sqlite.ps1"

if exist "%TARGET_DIR%\scripts\installer_wizard_sqlite.ps1" (
    copy /y "%TARGET_DIR%\scripts\installer_wizard_sqlite.ps1" "%WIZ_SCRIPT%" >nul 2>&1
)

cls
echo ======================================================================
echo   CSC ^& BC APNA HISAAB - SQLITE EDITION 1-CLICK WIZARD
echo ======================================================================
echo.
echo   Target Folder : %TARGET_DIR%
echo   Status        : Graphical Setup Engine download ho raha hai...
echo.

echo [1/2] Latest SQLite Setup Engine download ho raha hai...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $dst='%WIZ_SCRIPT%'; $urls=@('https://raw.githubusercontent.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/sqlite/scripts/installer_wizard_sqlite.ps1','https://cdn.jsdelivr.net/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab@sqlite/scripts/installer_wizard_sqlite.ps1','https://fastly.jsdelivr.net/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab@sqlite/scripts/installer_wizard_sqlite.ps1'); foreach($u in $urls){ try { Write-Host ('  [..] Connecting to ' + ([Uri]$u).Host + '...') -ForegroundColor Yellow; Invoke-WebRequest -Uri ($u + '?t=' + [DateTime]::UtcNow.Ticks) -OutFile $dst -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop; if((Test-Path $dst) -and (Get-Item $dst).Length -gt 2000){ Write-Host '  [OK] Setup Engine loaded!' -ForegroundColor Green; exit 0 } } catch { } }; exit 1"

if errorlevel 1 (
    echo.
    echo [ERROR] Setup Engine download nahi ho paya. Kripya Internet / Wi-Fi check karein.
    pause
    exit /b 1
)

echo.
echo ======================================================================
echo   [2/2] Launching Graphical Setup ^& Health Wizard...
echo ======================================================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%WIZ_SCRIPT%" -ProjectDir "%TARGET_DIR%"
set "EXIT_CODE=%errorlevel%"

echo.
echo ======================================================================
echo   Setup Process Completed (Code: %EXIT_CODE%)
echo   Log File: %TARGET_DIR%\logs\install_wizard_sqlite.log
echo.
echo   Window band karne ke liye koi bhi key dabayein...
echo ======================================================================
pause >nul
exit /b %EXIT_CODE%
