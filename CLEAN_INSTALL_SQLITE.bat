@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul 2>&1
title CSC ^& BC Apna Hisaab - SQLite Edition 100%% Dynamic Clean Installer
color 0C

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
echo   CSC ^& BC APNA HISAAB - 100% DYNAMIC CLEAN INSTALLER (SQLITE)
echo   Permanent Single-File Launcher ^| 100% AI Live Self-Healing Active
echo ======================================================================
echo.
echo   [!] Yeh dynamic launcher hamesha GitHub se 100% LATEST version uthayega.
echo       Aapko baar-baar naya .bat file download karne ki bilkul zaroorat nahi.
echo.

:: ====================================================================
:: 2. Resolve Safe Target Directory
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
)
echo.

:: ====================================================================
:: 3. Pre-flight AI Process Stop ^& Safe Database WAL Backup
:: ====================================================================
echo [1/4] Running pre-flight AI diagnostics ^& network cleanup...
if not exist "%TARGET_DIR%\logs" mkdir "%TARGET_DIR%\logs" >nul 2>&1
echo setup> "%TARGET_DIR%\logs\.stop_supervisor"

ipconfig /flushdns >nul 2>&1
set "_CMBC_TDIR=%TARGET_DIR%"
"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -Command ^
  "$td = $env:_CMBC_TDIR;" ^
  "Get-CimInstance Win32_Process -Filter \"Name='cmd.exe'\" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and $_.CommandLine -like '*server-supervisor.bat*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue };" ^
  "Get-CimInstance Win32_Process -Filter \"Name='wscript.exe'\" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and ($_.CommandLine -like '*open-app.vbs*' -or $_.CommandLine -like '*start-hidden.vbs*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue };" ^
  "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and (($_.CommandLine -like \"*$td*\") -or ($_.CommandLine -like '*server.js*')) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1

:: Safe Database Handling: Preserves DB + WAL + SHM cleanly; only clears corrupt (<1KB) empty shells
if exist "%TARGET_DIR%\database\data\cash_management.db" (
    for %%F in ("%TARGET_DIR%\database\data\cash_management.db") do (
        if %%~zF LSS 1000 (
            del /f /q "%TARGET_DIR%\database\data\cash_management.db*" >nul 2>&1
            echo   [OK] Khali / corrupt database file ko clean kiya gaya.
        ) else (
            copy /y "%TARGET_DIR%\database\data\cash_management.db" "%TARGET_DIR%\database\data\cash_management_backup.db" >nul 2>&1
            if exist "%TARGET_DIR%\database\data\cash_management.db-wal" copy /y "%TARGET_DIR%\database\data\cash_management.db-wal" "%TARGET_DIR%\database\data\cash_management_backup.db-wal" >nul 2>&1
            if exist "%TARGET_DIR%\database\data\cash_management.db-shm" copy /y "%TARGET_DIR%\database\data\cash_management.db-shm" "%TARGET_DIR%\database\data\cash_management_backup.db-shm" >nul 2>&1
            echo   [OK] Existing database + WAL ka safety backup banaya gaya (Aapka hisaab-kitaab 100% safe hai).
        )
    )
)

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
    echo   Kripya Wi-Fi / Mobile Hotspot check karein aur dobara chalayein.
    echo ======================================================================
    pause
    exit /b 1
)

"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -Command "Unblock-File -LiteralPath $env:WIZ_SCRIPT -ErrorAction SilentlyContinue" >nul 2>&1
if exist "%TARGET_DIR%\logs\.stop_supervisor" del /f /q "%TARGET_DIR%\logs\.stop_supervisor" >nul 2>&1

:: ====================================================================
:: 5. Launch Graphical Setup & Health Wizard (Clean Reset)
:: ====================================================================
echo.
echo ======================================================================
echo   [3/4] Launching AI Live Self-Healing Setup Wizard (Clean Reset)...
echo ======================================================================
echo.

"%PS_EXE%" -STA -NoProfile -ExecutionPolicy Bypass -File "%WIZ_SCRIPT%" -ProjectDir "%TARGET_DIR%" -Clean
set "EXIT_CODE=%errorlevel%"

if not "%EXIT_CODE%"=="0" if not exist "%TARGET_DIR%\logs\install_wizard_sqlite.log" (
    echo [..] PowerShell GPO fallback mode active...
    set "CLEAN_INSTALL=1"
    "%PS_EXE%" -STA -NoProfile -Command "& ([scriptblock]::Create([IO.File]::ReadAllText($env:WIZ_SCRIPT))) -ProjectDir $env:TARGET_DIR -Clean"
    set "EXIT_CODE=%errorlevel%"
    set "CLEAN_INSTALL="
)

del /f /q "%WIZ_SCRIPT%" >nul 2>&1

if not "%EXIT_CODE%"=="0" (
    echo.
    echo [!] Clean Setup me dikkat aayi ^(Exit Code: %EXIT_CODE%^). AI Live Doctor chalaya ja raha hai...
    if exist "%TARGET_DIR%\AI_DOCTOR_SQLITE.bat" (
        call "%TARGET_DIR%\AI_DOCTOR_SQLITE.bat" --no-pause
        set "EXIT_CODE=%errorlevel%"
    )
)

echo.
echo ======================================================================
echo   [4/4] Clean Installation Completed ^(Exit Code: %EXIT_CODE%^)
echo   Log File: "%TARGET_DIR%\logs\install_wizard_sqlite.log"
echo.
echo   Window band karne ke liye koi bhi key dabayein...
echo ======================================================================
pause >nul
exit /b %EXIT_CODE%
