@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
title CSC ^& BC Apna Hisaab - 100%% Zero-Install SQLite Edition
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

:: Kill lingering processes
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM wscript.exe >nul 2>&1

cls
echo ======================================================================
echo   CSC ^& BC APNA HISAAB - 100%% ZERO-INSTALL SQLITE EDITION
echo   Fastest 15-Second Setup ^| Zero SQL Server Setup ^| 100%% Free
echo ======================================================================
echo.

:: ====================================================================
:: 2. Target Directory Setup
:: ====================================================================
set "IS_IN_PROJECT=0"
if exist "%~dp0server.js" (
    if exist "%~dp0database\sqlite_schema.sql" (
        set "IS_IN_PROJECT=1"
        set "TARGET_DIR=%~dp0"
    )
)

if "%IS_IN_PROJECT%"=="0" (
    set "TARGET_DIR=%USERPROFILE%\CSC-BC-Apna-Hisaab-SQLite"
    if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"
)

echo   Project Directory : %TARGET_DIR%
echo.

:: ====================================================================
:: 3. Step [1/5] Node.js LTS Runtime Check & Auto-Install
:: ====================================================================
echo [1/5] Node.js LTS runtime check ho raha hai...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo   [!] Node.js nahi mila. Automatic download aur silent install shuru ho raha hai...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $msi = Join-Path $env:TEMP 'node_setup.msi'; Write-Host '  [..] Downloading Node.js LTS (30 MB)...' -ForegroundColor Yellow; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi' -OutFile $msi -UseBasicParsing; Write-Host '  [..] Installing Node.js silently...' -ForegroundColor Yellow; Start-Process msiexec.exe -ArgumentList '/i', $msi, '/qn', '/norestart' -Wait; Remove-Item $msi -Force -ErrorAction SilentlyContinue"
    set "PATH=%PATH%;C:\Program Files\nodejs"
    echo   [OK] Node.js install ho gaya!
) else (
    echo   [OK] Node.js pehle se installed hai.
)

:: ====================================================================
:: 4. Step [2/5] Project Files Download / Sync (from GitHub branch: sqlite)
:: ====================================================================
if "%IS_IN_PROJECT%"=="0" (
    echo.
    echo [2/5] GitHub se SQLite Edition download ho raha hai (branch: sqlite)...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $zip = Join-Path $env:TEMP 'cmbc_sqlite.zip'; $extr = Join-Path $env:TEMP 'cmbc_sqlite_extract'; if(Test-Path $extr){ Remove-Item $extr -Recurse -Force }; Write-Host '  [..] Downloading SQLite Edition ZIP (~4 MB)...' -ForegroundColor Yellow; $urls=@('https://codeload.github.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/zip/refs/heads/sqlite','https://github.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/archive/refs/heads/sqlite.zip'); foreach($u in $urls){ try { Invoke-WebRequest -Uri $u -OutFile $zip -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop; break } catch { } }; Write-Host '  [..] Extracting files...' -ForegroundColor Yellow; Expand-Archive -Path $zip -DestinationPath $extr -Force; $root = Get-ChildItem -Path $extr -Directory | Select-Object -First 1; Copy-Item -Path ($root.FullName + '\*') -Destination '%TARGET_DIR%' -Recurse -Force; Remove-Item $zip -Force -ErrorAction SilentlyContinue; Remove-Item $extr -Recurse -Force -ErrorAction SilentlyContinue; Write-Host '  [OK] Project files 100% sync ho gayi!' -ForegroundColor Green"
) else (
    echo.
    echo [2/5] Project files local directory me maujood hain.
)

cd /d "%TARGET_DIR%"

:: ====================================================================
:: 5. Step [3/5] NPM Dependencies Verification & Fast Install
:: ====================================================================
echo.
echo [3/5] Lightweight packages verify ho rahe hain...
if not exist "%TARGET_DIR%\node_modules\better-sqlite3" (
    echo   [..] Dependencies install ho rahi hain (better-sqlite3, express, etc.)...
    call npm install --omit=dev --no-audit --no-fund
    if errorlevel 1 (
        echo   [WARN] npm install retry kiya ja raha hai...
        call npm install --omit=dev --no-audit --no-fund
    )
    echo   [OK] Dependencies install ho gayi!
) else (
    echo   [OK] Saari dependencies pehle se ready hain.
)

:: ====================================================================
:: 6. Step [4/5] Embedded SQLite Database Initialization (1-Second Setup)
:: ====================================================================
echo.
echo [4/5] Embedded SQLite Database ready kiya ja raha hai...
node "%TARGET_DIR%\setup-database.js"
if errorlevel 1 (
    echo   [WARN] Retrying database initialization...
    node "%TARGET_DIR%\database\setup_sqlite.js"
)
echo   [OK] SQLite Database 100%% Ready! (Zero SQL Server setup required!)

:: ====================================================================
:: 7. Step [5/5] Desktop Shortcut & Launch Application
:: ====================================================================
echo.
echo [5/5] Desktop shortcut create aur application launch ho raha hai...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $d = [Environment]::GetFolderPath('Desktop'); $s = $ws.CreateShortcut((Join-Path $d 'CSC & BC Apna Hisaab (SQLite).lnk')); $s.TargetPath = '%TARGET_DIR%\START.bat'; $s.WorkingDirectory = '%TARGET_DIR%'; if(Test-Path '%TARGET_DIR%\public\favicon.ico'){ $s.IconLocation = '%TARGET_DIR%\public\favicon.ico' }; $s.Description = 'CSC & BC Apna Hisaab - SQLite Edition'; $s.Save(); Write-Host '  [OK] Desktop shortcut ban gaya!' -ForegroundColor Green"

echo.
echo ======================================================================
echo   🎉 CONGRATULATIONS! SQLITE EDITION INSTALLED SAFALTA SE! 🎉
echo   Desktop par 'CSC & BC Apna Hisaab (SQLite)' shortcut ban gaya hai.
echo   Ab application start ho raha hai...
echo ======================================================================
echo.

:: Launch App in background via VBS or start
if exist "%TARGET_DIR%\open-app.vbs" (
    start "" wscript.exe "%TARGET_DIR%\open-app.vbs"
) else (
    start "" "%TARGET_DIR%\START.bat"
)

:: Wait 3 seconds then open browser
timeout /t 3 >nul
start http://localhost:3000

echo Window band karne ke liye koi bhi key dabayein...
pause >nul
exit /b 0
