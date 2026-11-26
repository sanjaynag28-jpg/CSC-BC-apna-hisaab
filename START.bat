@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul 2>&1
title CSC ^& BC Apna Hisaab (SQLite Edition)
color 0A
set "PROJ_DIR=%~dp0"
if "%PROJ_DIR:~-1%"=="\" if not "%PROJ_DIR:~-2%"==":\" set "PROJ_DIR=%PROJ_DIR:~0,-1%"
cd /d "%PROJ_DIR%"

:: Remove previous stop signal
if exist "logs\.stop_supervisor" del /f /q "logs\.stop_supervisor" >nul 2>&1

:: Resolve Node.js across local portable runtime first, then config/node-path.txt, then System/User/Winget/NVM/Scoop/Volta
set "NODE_EXE="
if exist "%PROJ_DIR%\.runtime\nodejs\node.exe" (
    "%PROJ_DIR%\.runtime\nodejs\node.exe" -e "process.exit(parseInt(process.versions.node.split('.')[0],10)>=22?0:1)" >nul 2>&1 && set "NODE_EXE=%PROJ_DIR%\.runtime\nodejs\node.exe"
)
if not defined NODE_EXE if exist "%PROJ_DIR%\config\node-path.txt" (
    for /f "usebackq delims=" %%N in ("%PROJ_DIR%\config\node-path.txt") do (
        if not defined NODE_EXE if exist "%%~N" (
            "%%~N" -e "process.exit(parseInt(process.versions.node.split('.')[0],10)>=22?0:1)" >nul 2>&1 && set "NODE_EXE=%%~N"
        )
    )
)
if not defined NODE_EXE (
    for /f "delims=" %%W in ('where node 2^>nul') do (
        if not defined NODE_EXE (
            "%%~W" -e "process.exit(parseInt(process.versions.node.split('.')[0],10)>=22?0:1)" >nul 2>&1 && set "NODE_EXE=%%~W"
        )
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
        if not defined NODE_EXE if exist "%%~P" (
            "%%~P" -e "process.exit(parseInt(process.versions.node.split('.')[0],10)>=22?0:1)" >nul 2>&1 && set "NODE_EXE=%%~P"
        )
    )
)
if defined NODE_EXE for %%I in ("%NODE_EXE%") do set "PATH=%%~dpI;%PATH%"

:: Ensure Node.js exists and is >= v22 (required by better-sqlite3 N-API v10)
if not defined NODE_EXE (
    echo ========================================================
    echo   [!] Node.js v22+ x64 nahi mila ya incompatible hai.
    echo   Automatic SQLite Setup shuru kiya ja raha hai...
    echo ========================================================
    if exist "%PROJ_DIR%\INSTALL_SQLITE.bat" (
        call "%PROJ_DIR%\INSTALL_SQLITE.bat"
    ) else if exist "%PROJ_DIR%\SETUP.bat" (
        call "%PROJ_DIR%\SETUP.bat"
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
if not exist "%PROJ_DIR%\node_modules" goto :repair_deps
"%NODE_EXE%" -e "const D=require('better-sqlite3');require('express');const d=new D(':memory:');d.close();" >nul 2>&1
if errorlevel 1 goto :repair_deps
goto :deps_ok

:repair_deps
echo ========================================================
echo   [!] Core npm/SQLite modules incomplete ya repair zaroori hai.
echo   Automatic setup/repair chalaya ja raha hai...
echo ========================================================
if exist "%PROJ_DIR%\INSTALL_SQLITE.bat" (
    call "%PROJ_DIR%\INSTALL_SQLITE.bat"
) else if exist "%PROJ_DIR%\SETUP.bat" (
    call "%PROJ_DIR%\SETUP.bat"
) else (
    echo [ERROR] Setup script nahi mila.
    pause
)
exit /b %errorlevel%

:deps_ok
:: Determine configured PORT (default 4000)
set "APP_PORT=4000"
for /f "delims=" %%P in ('"%NODE_EXE%" -e "try{const m=require('fs').readFileSync('.env','utf8').match(/^\s*PORT\s*=\s*(\d+)/m);if(m)console.log(m[1]);else console.log(4000);}catch{console.log(4000)}" 2^>nul') do set "APP_PORT=%%P"

:: Start hidden supervisor + immediately launch Chrome/Edge with live animated splash screen
echo Starting CSC ^& BC Apna Hisaab (SQLite Edition) on Port %APP_PORT%...
set "PS_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if exist "%PROJ_DIR%\scripts\silent-launch.ps1" if exist "%PS_EXE%" (
    "%PS_EXE%" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "%PROJ_DIR%\scripts\silent-launch.ps1" -ProjectDir "%PROJ_DIR%" -Mode open
    if not errorlevel 1 exit /b 0
)

set "WSH_OK=1"
reg query "HKCU\Software\Microsoft\Windows Script Host\Settings" /v Enabled 2>nul | findstr /R /C:"0x0" >nul 2>&1 && set "WSH_OK=0"
reg query "HKLM\Software\Microsoft\Windows Script Host\Settings" /v Enabled 2>nul | findstr /R /C:"0x0" >nul 2>&1 && set "WSH_OK=0"

if "%WSH_OK%"=="1" if exist "%PROJ_DIR%\open-app.vbs" if exist "%SystemRoot%\System32\wscript.exe" (
    start "" "%SystemRoot%\System32\wscript.exe" "%PROJ_DIR%\open-app.vbs"
    exit /b 0
)

start "" /min cmd.exe /d /c ""%PROJ_DIR%\server-supervisor.bat""
start "" "file:///%PROJ_DIR:\=/%/public/startup-wait.html?port=%APP_PORT%"
exit /b 0
