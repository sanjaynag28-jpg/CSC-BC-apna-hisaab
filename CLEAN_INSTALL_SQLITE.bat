@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
title CSC ^& BC Apna Hisaab - 100%% Clean Fresh Re-Installer (SQLite)
color 0C

:: Auto-elevate to Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [..] Administrator permission mang rahe hain...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd.exe -ArgumentList '/k \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"

echo ======================================================================
echo   CSC ^& BC APNA HISAAB - 100%% CLEAN FRESH RE-INSTALLER (SQLITE)
echo ======================================================================
echo.
echo   Yeh tool purane / adhoore installation folder aur SQLite Database ko
echo   100%% naye sire se fresh clean banayega.
echo.

set "TARGET_DIR=%USERPROFILE%\CSC-BC-Apna-Hisaab-SQLite"
set "WIZ_SCRIPT=%TEMP%\cmbc_installer_wizard_sqlite.ps1"

echo [1/3] Latest Setup Engine download ho raha hai...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls11 -bor [Net.SecurityProtocolType]::Tls; $dst='%WIZ_SCRIPT%'; $urls=@('https://raw.githubusercontent.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/sqlite/scripts/installer_wizard_sqlite.ps1','https://cdn.jsdelivr.net/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab@sqlite/scripts/installer_wizard_sqlite.ps1','https://fastly.jsdelivr.net/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab@sqlite/scripts/installer_wizard_sqlite.ps1'); foreach($u in $urls){ try { Write-Host ('  [..] Connecting to ' + ([Uri]$u).Host + '...') -ForegroundColor Yellow; Invoke-WebRequest -Uri ($u + '?t=' + [DateTime]::UtcNow.Ticks) -OutFile $dst -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop; if((Test-Path $dst) -and (Get-Item $dst).Length -gt 5000){ Write-Host '  [OK] Setup Engine loaded!' -ForegroundColor Green; exit 0 } } catch { } }; exit 1"

:: Fallback to curl
if not exist "%WIZ_SCRIPT%" (
    where curl.exe >nul 2>&1
    if not errorlevel 1 (
        echo   [..] Retrying download via curl fallback...
        curl.exe -fSL --retry 3 --connect-timeout 10 "https://cdn.jsdelivr.net/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab@sqlite/scripts/installer_wizard_sqlite.ps1" -o "%WIZ_SCRIPT%" >nul 2>&1
    )
)

if not exist "%WIZ_SCRIPT%" (
    echo.
    echo [ERROR] Setup Engine download nahi ho paya. Kripya Internet / Wi-Fi check karein.
    pause
    exit /b 1
)

echo.
echo [2/3] Purane active processes aur adhoore database saaf kiye ja rahe hain...
ipconfig /flushdns >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM wscript.exe >nul 2>&1

if exist "%TARGET_DIR%\database\data\cash_management.db" (
    del /f /q "%TARGET_DIR%\database\data\cash_management.db*" >nul 2>&1
    echo   [OK] Purana database saaf ho gaya.
)

echo.
echo ======================================================================
echo   [3/3] Launching Graphical Setup ^& Health Wizard (Clean Reset)...
echo ======================================================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%WIZ_SCRIPT%" -ProjectDir "%TARGET_DIR%" -Clean
set "EXIT_CODE=%errorlevel%"

echo.
echo ======================================================================
echo   Clean Re-installation Process Completed (Code: %EXIT_CODE%)
echo   Log File: %TARGET_DIR%\logs\install_wizard_sqlite.log
echo.
echo   Window band karne ke liye koi bhi key dabayein...
echo ======================================================================
pause >nul
exit /b %EXIT_CODE%
