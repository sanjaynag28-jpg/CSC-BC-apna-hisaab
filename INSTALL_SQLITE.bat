@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
title CSC ^& BC Apna Hisaab - SQLite Edition 100%% Dynamic 1-Click Wizard
color 0A

:: ====================================================================
:: 1. Auto-elevate to Administrator (Seamless Elevation)
:: ====================================================================
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [..] Administrator permission mang rahe hain...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%comspec%' -ArgumentList @('/c', 'call', ([char]34 + '%~f0' + [char]34)) -Verb RunAs"
    exit /b
)

cd /d "%~dp0"

echo ======================================================================
echo   CSC ^& BC APNA HISAAB - 100%% DYNAMIC 1-CLICK WIZARD (SQLITE)
echo   Permanent Single-File Launcher ^| 100%% AI Live Self-Healing Active
echo ======================================================================
echo.
echo   [!] Yeh dynamic launcher hamesha GitHub se 100%% LATEST version uthayega.
echo       Aapko baar-baar naya .bat file download karne ki bilkul zaroorat nahi.
echo.

:: ====================================================================
:: 2. Resolve Safe Target Directory
:: ====================================================================
set "TARGET_DIR=%USERPROFILE%\CSC-BC-Apna-Hisaab-SQLite"

if exist "%~dp0package.json" (
    if not "%~dp0"=="D:\Cash Managment BC\" (
        if not "%~dp0"=="d:\Cash Managment BC\" (
            pushd "%~dp0"
            set "TARGET_DIR=%CD%"
            popd
        )
    )
)

if "%TARGET_DIR:~-1%"=="\" set "TARGET_DIR=%TARGET_DIR:~0,-1%"
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

del /f /q "%TEMP%\cmbc_installer_wizard_sqlite*.ps1" >nul 2>&1
set "WIZ_SCRIPT=%TEMP%\cmbc_installer_wizard_sqlite_%RANDOM%.ps1"

:: ====================================================================
:: 4. Dynamic Live Engine Fetch (Multi-Mirror + DoH Network Bypass)
:: ====================================================================
echo.
echo [2/4] Downloading latest AI Setup Engine from GitHub (Live Dynamic)...

set "CACHE_BUSTER=%RANDOM%%RANDOM%"

:: Method 1: PowerShell Multi-Mirror Download (TLS 1.2/1.3 + System Proxy)
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor 3072 -bor 12288 } catch { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 }; " ^
  "try { [System.Net.WebRequest]::DefaultWebProxy.Credentials = [System.Net.CredentialCache]::DefaultNetworkCredentials } catch {}; " ^
  "$dst = '%WIZ_SCRIPT%';" ^
  "$cb = '%CACHE_BUSTER%';" ^
  "$urls = @(" ^
  "  ('https://raw.githubusercontent.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/sqlite/scripts/installer_wizard_sqlite.ps1?t=' + $cb)," ^
  "  ('https://cdn.jsdelivr.net/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab@sqlite/scripts/installer_wizard_sqlite.ps1?t=' + $cb)," ^
  "  ('https://fastly.jsdelivr.net/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab@sqlite/scripts/installer_wizard_sqlite.ps1?t=' + $cb)," ^
  "  'https://github.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/releases/latest/download/installer_wizard_sqlite.ps1'," ^
  "  ('https://cdn.statically.io/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab/sqlite/scripts/installer_wizard_sqlite.ps1?t=' + $cb)" ^
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

:: Method 2: Curl + DNS-over-HTTPS (DoH) Fallback if ISP/DNS blocks GitHub
if not exist "%WIZ_SCRIPT%" (
    where curl.exe >nul 2>&1
    if not errorlevel 1 (
        echo   [..] PowerShell network blocked/busy. Trying AI Curl + DoH bypass mirrors...
        for %%U in (
            "https://cdn.jsdelivr.net/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab@sqlite/scripts/installer_wizard_sqlite.ps1?t=%CACHE_BUSTER%"
            "https://github.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/releases/latest/download/installer_wizard_sqlite.ps1"
            "https://raw.githubusercontent.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/sqlite/scripts/installer_wizard_sqlite.ps1?t=%CACHE_BUSTER%"
        ) do (
            if not exist "%WIZ_SCRIPT%" (
                curl.exe -fSL --doh-url https://cloudflare-dns.com/dns-query --retry 2 --connect-timeout 12 %%U -o "%WIZ_SCRIPT%" >nul 2>&1
                if not exist "%WIZ_SCRIPT%" curl.exe -fSL --retry 2 --connect-timeout 12 %%U -o "%WIZ_SCRIPT%" >nul 2>&1
            )
        )
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
    echo   [AI AUTO-FIX FAILED] Internet connection / DNS block detect hua.
    echo   Kripya Wi-Fi / Mobile Hotspot check karein ya Defender/VPN check karke
    echo   dobara chalayein.
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
echo   [3/4] Launching AI Live Self-Healing Setup Wizard...
echo ======================================================================
echo.

powershell.exe -STA -NoProfile -ExecutionPolicy Bypass -File "%WIZ_SCRIPT%" -ProjectDir "%TARGET_DIR%"
set "EXIT_CODE=%errorlevel%"

del /f /q "%WIZ_SCRIPT%" >nul 2>&1

echo.
echo ======================================================================
echo   [4/4] Installation Completed (Exit Code: %EXIT_CODE%)
echo   Log File: %TARGET_DIR%\logs\install_wizard_sqlite.log
echo.
echo   Window band karne ke liye koi bhi key dabayein...
echo ======================================================================
pause >nul
exit /b %EXIT_CODE%
