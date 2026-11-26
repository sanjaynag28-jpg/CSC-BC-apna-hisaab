@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul 2>&1
title CSC ^& BC Apna Hisaab - SQLite Edition 100%% Dynamic 1-Click Wizard
color 0A

set "PS_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS_EXE%" set "PS_EXE=powershell.exe"

:: ====================================================================
:: 1. Seamless Auto-Elevation (No Quote Injection, No Loop, Non-Admin Fallback)
:: ====================================================================
set "ALREADY_ELEVATED=0"
echo %* | findstr /I "\--elevated" >nul 2>&1 && set "ALREADY_ELEVATED=1"

fltmc >nul 2>&1
if not errorlevel 1 goto :elevated_ok
net session >nul 2>&1
if not errorlevel 1 goto :elevated_ok

if "%ALREADY_ELEVATED%"=="0" (
    echo [..] Administrator permission mang rahe hain...
    set "_CMBC_SELF=%~f0"
    "%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -Command "try { Start-Process -FilePath $env:ComSpec -ArgumentList @('/c', ('\"\"' + $env:_CMBC_SELF + '\" --elevated\"')) -Verb RunAs -ErrorAction Stop; exit 0 } catch { exit 1 }"
    if not errorlevel 1 exit /b 0
    echo [!] Admin permission nahi mili - Standard User mode me setup continue ho raha hai...
)

:elevated_ok
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
:: 2. Resolve Safe Target Directory (Quoted, OneDrive-Aware, Drive-Root Safe)
:: ====================================================================
set "TARGET_DIR=%USERPROFILE%\CSC-BC-Apna-Hisaab-SQLite"

if exist "%~dp0package.json" if exist "%~dp0database\setup_sqlite.js" (
    pushd "%~dp0"
    set "TARGET_DIR=%CD%"
    popd
)

if "%TARGET_DIR:~-1%"=="\" if not "%TARGET_DIR:~-2%"==":\" set "TARGET_DIR=%TARGET_DIR:~0,-1%"
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%" >nul 2>&1

echo   Target Directory: "%TARGET_DIR%"
echo "%TARGET_DIR%" | findstr /I "OneDrive" >nul 2>&1 && (
    echo   [!] WARNING: Folder OneDrive ke andar hai. Cloud sync SQLite database lock kar sakta hai.
    echo       Behtar stability ke liye C:\CSC-BC-Apna-Hisaab-SQLite ya local drive use karein.
)
echo.

:: ====================================================================
:: 3. Pre-flight AI Process Stop ^& DNS Cleanup (Scoped, Zero Data Loss)
:: ====================================================================
echo [1/4] Running pre-flight AI diagnostics ^& safe process cleanup...
if not exist "%TARGET_DIR%\logs" mkdir "%TARGET_DIR%\logs" >nul 2>&1
echo setup> "%TARGET_DIR%\logs\.stop_supervisor"

ipconfig /flushdns >nul 2>&1
set "_CMBC_TDIR=%TARGET_DIR%"
"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -Command ^
  "$td = $env:_CMBC_TDIR;" ^
  "Get-CimInstance Win32_Process -Filter \"Name='cmd.exe'\" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and $_.CommandLine -like '*server-supervisor.bat*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue };" ^
  "Get-CimInstance Win32_Process -Filter \"Name='wscript.exe'\" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and ($_.CommandLine -like '*open-app.vbs*' -or $_.CommandLine -like '*start-hidden.vbs*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue };" ^
  "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and (($_.CommandLine -like \"*$td*\") -or ($_.CommandLine -like '*server.js*')) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1

del /f /q "%TEMP%\cmbc_installer_wizard_sqlite*.ps1" >nul 2>&1
set "WIZ_SCRIPT=%TEMP%\cmbc_installer_wizard_sqlite_%RANDOM%.ps1"

:: ====================================================================
:: 4. Dynamic Live Engine Fetch (Multi-Mirror + DoH + Captive-Portal Check)
:: ====================================================================
echo.
echo [2/4] Downloading latest AI Setup Engine from GitHub (Live Dynamic)...

set "CACHE_BUSTER=%RANDOM%%RANDOM%"

"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType](3072 -bor 12288) } catch { try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]3072 } catch {} }; " ^
  "try { [System.Net.WebRequest]::DefaultWebProxy.Credentials = [System.Net.CredentialCache]::DefaultNetworkCredentials } catch {}; " ^
  "$dst = $env:WIZ_SCRIPT; $cb = $env:CACHE_BUSTER;" ^
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
  "    Invoke-WebRequest -Uri $u -OutFile $dst -UseBasicParsing -TimeoutSec 18 -ErrorAction Stop;" ^
  "    if (Test-Path -LiteralPath $dst) {" ^
  "      $len = (Get-Item -LiteralPath $dst).Length;" ^
  "      $head = Get-Content -LiteralPath $dst -TotalCount 20 -Raw -ErrorAction SilentlyContinue;" ^
  "      if ($len -gt 20000 -and $head -match 'installer_wizard_sqlite|SQLite' -and $head -notmatch '<!DOCTYPE|<html') {" ^
  "        Write-Host '  [OK] Latest AI Setup Engine successfully loaded!' -ForegroundColor Green;" ^
  "        exit 0;" ^
  "      }" ^
  "      Remove-Item -LiteralPath $dst -Force -ErrorAction SilentlyContinue;" ^
  "    }" ^
  "  } catch { if (Test-Path -LiteralPath $dst) { Remove-Item -LiteralPath $dst -Force -ErrorAction SilentlyContinue } }" ^
  "};" ^
  "exit 1"

:: Method 2: Curl + DNS-over-HTTPS (DoH) Fallback with HTML Guard
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
                if exist "%WIZ_SCRIPT%" (
                    "%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -Command "$d=$env:WIZ_SCRIPT; $len=(Get-Item -LiteralPath $d).Length; $h=Get-Content -LiteralPath $d -TotalCount 20 -Raw -ErrorAction SilentlyContinue; if($len -le 20000 -or $h -match '<!DOCTYPE|<html'){ Remove-Item -LiteralPath $d -Force; exit 1 }" >nul 2>&1
                )
            )
        )
    )
)

:: Method 3: Local Script Fallback (existing folder or current script folder)
if not exist "%WIZ_SCRIPT%" if exist "%TARGET_DIR%\scripts\installer_wizard_sqlite.ps1" (
    copy /y "%TARGET_DIR%\scripts\installer_wizard_sqlite.ps1" "%WIZ_SCRIPT%" >nul 2>&1
    if exist "%WIZ_SCRIPT%" echo   [OK] Local backup AI Setup Engine loaded!
)
if not exist "%WIZ_SCRIPT%" if exist "%~dp0scripts\installer_wizard_sqlite.ps1" (
    copy /y "%~dp0scripts\installer_wizard_sqlite.ps1" "%WIZ_SCRIPT%" >nul 2>&1
    if exist "%WIZ_SCRIPT%" echo   [OK] Local package AI Setup Engine loaded!
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

"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -Command "Unblock-File -LiteralPath $env:WIZ_SCRIPT -ErrorAction SilentlyContinue" >nul 2>&1

:: Remove STOP sentinel before launching server at end of Wizard
if exist "%TARGET_DIR%\logs\.stop_supervisor" del /f /q "%TARGET_DIR%\logs\.stop_supervisor" >nul 2>&1

:: ====================================================================
:: 5. Launch Graphical Setup & Health Wizard with GPO Policy Fallback
:: ====================================================================
echo.
echo ======================================================================
echo   [3/4] Launching AI Live Self-Healing Setup Wizard...
echo ======================================================================
echo.

"%PS_EXE%" -STA -NoProfile -ExecutionPolicy Bypass -File "%WIZ_SCRIPT%" -ProjectDir "%TARGET_DIR%"
set "EXIT_CODE=%errorlevel%"

if not "%EXIT_CODE%"=="0" if not exist "%TARGET_DIR%\logs\install_wizard_sqlite.log" (
    echo [..] PowerShell GPO fallback mode active...
    "%PS_EXE%" -STA -NoProfile -Command "& ([scriptblock]::Create([IO.File]::ReadAllText($env:WIZ_SCRIPT))) -ProjectDir $env:TARGET_DIR"
    set "EXIT_CODE=%errorlevel%"
)

del /f /q "%WIZ_SCRIPT%" >nul 2>&1

if not "%EXIT_CODE%"=="0" (
    echo.
    echo [!] Setup me dikkat aayi ^(Exit Code: %EXIT_CODE%^). AI Live Doctor auto-heal chalaya ja raha hai...
    if exist "%TARGET_DIR%\AI_DOCTOR_SQLITE.bat" (
        call "%TARGET_DIR%\AI_DOCTOR_SQLITE.bat" --no-pause
        set "EXIT_CODE=%errorlevel%"
    ) else if exist "%~dp0AI_DOCTOR_SQLITE.bat" (
        call "%~dp0AI_DOCTOR_SQLITE.bat" --no-pause
        set "EXIT_CODE=%errorlevel%"
    )
)

echo.
echo ======================================================================
echo   [4/4] Installation Completed ^(Exit Code: %EXIT_CODE%^)
echo   Log File: "%TARGET_DIR%\logs\install_wizard_sqlite.log"
echo.
echo   Window band karne ke liye koi bhi key dabayein...
echo ======================================================================
pause >nul
exit /b %EXIT_CODE%
