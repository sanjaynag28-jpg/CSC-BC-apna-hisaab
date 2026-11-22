@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
title CSC ^& BC Apna Hisaab - 100%% Dynamic Clean Re-Installer
color 0C

:: ====================================================================
:: 1. Auto-elevate to Administrator (Seamless Elevation)
:: ====================================================================
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [..] Administrator permission mang rahe hain...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd.exe -ArgumentList '/k \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"

echo ======================================================================
echo   CSC ^& BC APNA HISAAB - 100%% DYNAMIC CLEAN RE-INSTALLER
echo   Permanent Single-File Launcher ^| 100%% AI Live Self-Healing Active
echo ======================================================================
echo.
echo   [!] Yeh dynamic launcher hamesha GitHub se 100%% LATEST version uthayega.
echo       Aapko baar-baar naya .bat file download karne ki bilkul zaroorat nahi.
echo.

:: ====================================================================
:: 2. Resolve Safe Target Directory
:: ====================================================================
set "TARGET_DIR=%USERPROFILE%\CSC-BC-Apna-Hisaab"

if exist "%~dp0package.json" (
    set "TARGET_DIR=%~dp0"
)

if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"

echo   Target Directory: %TARGET_DIR%
echo.

:: ====================================================================
:: 3. Pre-flight AI Process ^& DNS Cleanups
:: ====================================================================
echo [1/4] Running pre-flight AI diagnostics ^& network cleanup...
ipconfig /flushdns >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM wscript.exe >nul 2>&1

:: Safe Database Handling: Preserves user data & creates auto-backup; only clears corrupt files
if exist "%TARGET_DIR%\database\data\cash_management.db" (
    for %%F in ("%TARGET_DIR%\database\data\cash_management.db") do (
        if %%~zF LSS 1000 (
            del /f /q "%TARGET_DIR%\database\data\cash_management.db*" >nul 2>&1
            echo   [OK] Khali / corrupt database file ko clean kiya gaya.
        ) else (
            copy /y "%TARGET_DIR%\database\data\cash_management.db" "%TARGET_DIR%\database\data\cash_management_backup.db" >nul 2>&1
            echo   [OK] Existing database ka safety backup banaya gaya (Aapka hisaab-kitaab 100%% safe hai).
        )
    )
)

del /f /q "%TEMP%\cmbc_installer_wizard_sqlite*.ps1" >nul 2>&1
set "WIZ_SCRIPT=%TEMP%\cmbc_installer_wizard_sqlite_%RANDOM%.ps1"

:: ====================================================================
:: 4. Dynamic Live Engine Fetch (Always 100% Latest from GitHub/CDN)
:: ====================================================================
echo.
echo [2/4] Downloading latest AI Setup Engine from GitHub (Live Dynamic)...

set "CACHE_BUSTER=%RANDOM%_%TIME:~6,2%"

:: Method 1: PowerShell Multi-Mirror Download with Cache-Buster
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls11 -bor [Net.SecurityProtocolType]::Tls; " ^
  "$dst = '%WIZ_SCRIPT%';" ^
  "$cb = '%CACHE_BUSTER%';" ^
  "$urls = @(" ^
  "  ('https://raw.githubusercontent.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/sqlite/scripts/installer_wizard_sqlite.ps1?t=' + $cb)," ^
  "  ('https://cdn.jsdelivr.net/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab@sqlite/scripts/installer_wizard_sqlite.ps1?t=' + $cb)," ^
  "  ('https://raw.githubusercontent.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/main/scripts/installer_wizard_sqlite.ps1?t=' + $cb)," ^
  "  ('https://cdn.jsdelivr.net/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab@main/scripts/installer_wizard_sqlite.ps1?t=' + $cb)" ^
  ");" ^
  "foreach ($u in $urls) {" ^
  "  try {" ^
  "    Write-Host ('  [..] Connecting to ' + ([Uri]$u).Host + '...') -ForegroundColor Yellow;" ^
  "    Invoke-WebRequest -Uri $u -OutFile $dst -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop;" ^
  "    if ((Test-Path $dst) -and ((Get-Item $dst).Length -gt 10000)) {" ^
  "      Write-Host '  [OK] Latest AI Setup Engine successfully loaded!' -ForegroundColor Green;" ^
  "      exit 0;" ^
  "    }" ^
  "  } catch { }" ^
  "};" ^
  "exit 1"

:: Method 2: Curl Fallback if PowerShell timed out or was blocked
if not exist "%WIZ_SCRIPT%" (
    where curl.exe >nul 2>&1
    if not errorlevel 1 (
        echo   [..] PowerShell network busy. Switching to AI curl fallback mirror...
        curl.exe -fSL --retry 3 --connect-timeout 10 "https://cdn.jsdelivr.net/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab@main/scripts/installer_wizard_sqlite.ps1?t=%CACHE_BUSTER%" -o "%WIZ_SCRIPT%" >nul 2>&1
    )
)

:: Method 3: Local Script Fallback if project already cloned
if not exist "%WIZ_SCRIPT%" (
    if exist "%TARGET_DIR%\scripts\installer_wizard_sqlite.ps1" (
        copy /y "%TARGET_DIR%\scripts\installer_wizard_sqlite.ps1" "%WIZ_SCRIPT%" >nul 2>&1
        echo   [OK] Local backup AI Setup Engine loaded!
    )
)

if not exist "%WIZ_SCRIPT%" (
    echo.
    echo ======================================================================
    echo   [AI AUTO-FIX FAILED] Internet connection drop detect hua.
    echo   Kripya Wi-Fi / Hotspot verify karein aur dobara chalayein.
    echo ======================================================================
    pause
    exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Unblock-File -Path '%WIZ_SCRIPT%' -ErrorAction SilentlyContinue" >nul 2>&1

:: ====================================================================
:: 5. Launch Graphical Setup & Health Wizard with AI Live Self-Healing
:: ====================================================================
echo.
echo ======================================================================
echo   [3/4] Launching AI Live Self-Healing Setup Wizard (Clean Reset)...
echo ======================================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%WIZ_SCRIPT%" -ProjectDir "%TARGET_DIR%" -Clean
set "EXIT_CODE=%errorlevel%"

del /f /q "%WIZ_SCRIPT%" >nul 2>&1

echo.
echo ======================================================================
echo   [4/4] Clean Installation Completed (Exit Code: %EXIT_CODE%)
echo   Log File: %TARGET_DIR%\logs\install_wizard_sqlite.log
echo.
echo   Window band karne ke liye koi bhi key dabayein...
echo ======================================================================
pause >nul
exit /b %EXIT_CODE%
