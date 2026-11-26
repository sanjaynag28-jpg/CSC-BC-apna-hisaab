@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul 2>&1
title CSC ^& BC Apna Hisaab (SQLite Edition)
color 0A
cd /d "%~dp0"

:: Remove previous stop signal
if exist "logs\.stop_supervisor" del /f /q "logs\.stop_supervisor" >nul 2>&1

:: Resolve Node.js across local portable runtime first, then System/User/Winget/NVM/Scoop/Volta
set "NODE_EXE="
if exist "%~dp0.runtime\nodejs\node.exe" set "NODE_EXE=%~dp0.runtime\nodejs\node.exe"
if not defined NODE_EXE (
    where node >nul 2>&1
    if not errorlevel 1 (
        for /f "delims=" %%W in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%~W"
    )
)
if not defined NODE_EXE (
    for %%P in (
        "%ProgramFiles%\nodejs\node.exe"
        "%LOCALAPPDATA%\Programs\nodejs\node.exe"
        "%ProgramFiles(x86)%\nodejs\node.exe"
        "%NVM_SYMLINK%\node.exe"
        "%LOCALAPPDATA%\Microsoft\WinGet\Links\node.exe"
        "%USERPROFILE%\scoop\shims\node.exe"
        "%USERPROFILE%\.volta\bin\node.exe"
    ) do (
        if not defined NODE_EXE if exist "%%~P" set "NODE_EXE=%%~P"
    )
)
if defined NODE_EXE for %%I in ("%NODE_EXE%") do set "PATH=%%~dpI;%PATH%"

:: Ensure Node.js exists and is >= v22 (required by better-sqlite3 N-API v10)
set "NODE_OK=0"
if defined NODE_EXE (
    "%NODE_EXE%" -e "const m=parseInt(process.versions.node.split('.')[0],10); if(m>=22 && (process.arch==='x64'||process.arch==='arm64')) process.exit(0); process.exit(1);" >nul 2>&1
    if not errorlevel 1 set "NODE_OK=1"
)
if "%NODE_OK%"=="0" (
    echo ========================================================
    echo   [!] Node.js v22+ x64 nahi mila ya incompatible hai.
    echo   Automatic SQLite Setup shuru kiya ja raha hai...
    echo ========================================================
    if exist "%~dp0INSTALL_SQLITE.bat" (
        call "%~dp0INSTALL_SQLITE.bat"
    ) else if exist "%~dp0SETUP.bat" (
        call "%~dp0SETUP.bat"
    ) else (
        echo [ERROR] SETUP.bat / INSTALL_SQLITE.bat nahi mila.
        pause
    )
    exit /b %errorlevel%
)

:: Ensure .env is configured with strong JWT_SECRET
if not exist ".env" if exist ".env.example" copy /y ".env.example" ".env" >nul 2>&1
"%NODE_EXE%" -e "const fs=require('fs'),c=require('crypto'),p='.env'; if(!fs.existsSync(p)) fs.writeFileSync(p,'PORT=4000\r\nHOST=0.0.0.0\r\nDB_TYPE=sqlite\r\nDB_FILE=database/data/cash_management.db\r\nJWT_SECRET=\r\nALLOW_LOCAL_AUTO_LOGIN=true\r\nAUTO_UPDATE_DISABLED=false\r\n'); let s=fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''); if(!/^JWT_SECRET=\S+/m.test(s)){ const sec=c.randomBytes(48).toString('base64url'); s=/^JWT_SECRET=/m.test(s)?s.replace(/^JWT_SECRET=.*$/m,'JWT_SECRET='+sec):s.trimEnd()+'\r\nJWT_SECRET='+sec+'\r\n'; fs.writeFileSync(p,s,'utf8'); }" >nul 2>&1

:: Check core dependencies (express + better-sqlite3 native driver load)
if not exist "%~dp0node_modules" goto :repair_deps
"%NODE_EXE%" -e "const D=require('better-sqlite3');require('express');const d=new D(':memory:');d.close();" >nul 2>&1
if errorlevel 1 goto :repair_deps
goto :deps_ok

:repair_deps
echo ========================================================
echo   [!] Core npm/SQLite modules incomplete ya repair zaroori hai.
echo   Automatic setup/repair chalaya ja raha hai...
echo ========================================================
if exist "%~dp0INSTALL_SQLITE.bat" (
    call "%~dp0INSTALL_SQLITE.bat"
) else if exist "%~dp0SETUP.bat" (
    call "%~dp0SETUP.bat"
) else (
    echo [ERROR] Setup script nahi mila.
    pause
)
exit /b %errorlevel%

:deps_ok
:: Database self-healing & schema integrity check
"%NODE_EXE%" "%~dp0setup-database.js"
if errorlevel 1 (
    echo [!] SQLite database setup issue detected. Launching AI Doctor...
    if exist "%~dp0AI_DOCTOR_SQLITE.bat" call "%~dp0AI_DOCTOR_SQLITE.bat"
    exit /b 1
)

:: Determine configured PORT (default 4000)
set "APP_PORT=4000"
for /f "delims=" %%P in ('"%NODE_EXE%" -e "try{const m=require('fs').readFileSync('.env','utf8').match(/^\s*PORT\s*=\s*(\d+)/m);if(m)console.log(m[1]);else console.log(4000);}catch{console.log(4000)}" 2^>nul') do set "APP_PORT=%%P"

:: Start hidden server and open browser (handle Windows Script Host disabled fallback cleanly)
echo Starting CSC ^& BC Apna Hisaab (SQLite Edition) on Port %APP_PORT%...
set "WSH_OK=1"
reg query "HKCU\Software\Microsoft\Windows Script Host\Settings" /v Enabled 2>nul | findstr /R /C:"0x0" >nul 2>&1 && set "WSH_OK=0"
reg query "HKLM\Software\Microsoft\Windows Script Host\Settings" /v Enabled 2>nul | findstr /R /C:"0x0" >nul 2>&1 && set "WSH_OK=0"

if "%WSH_OK%"=="1" if exist "%~dp0open-app.vbs" if exist "%SystemRoot%\System32\wscript.exe" (
    start "" "%SystemRoot%\System32\wscript.exe" "%~dp0open-app.vbs"
    exit /b 0
)

"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', ('\"\"' + '%~dp0server-supervisor.bat' + '\"\"')) -WorkingDirectory '%~dp0' -WindowStyle Hidden" >nul 2>&1
ping -n 3 127.0.0.1 >nul
start "" "http://localhost:%APP_PORT%"
exit /b 0
