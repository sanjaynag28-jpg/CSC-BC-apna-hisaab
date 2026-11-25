@echo off
setlocal EnableExtensions
title CSC ^& BC Apna Hisaab (SQLite Edition)
color 0A
cd /d "%~dp0"

:: Ensure Node.js path is available even in a pre-existing Explorer session
where node >nul 2>&1
if errorlevel 1 (
    if exist "C:\Program Files\nodejs\node.exe" set "PATH=C:\Program Files\nodejs;%PATH%"
    if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
)

:: Ensure .env is configured
if not exist ".env" (
    if exist ".env.example" copy /y ".env.example" ".env" >nul 2>&1
)

:: Check if Node.js is installed
where node >nul 2>&1
if errorlevel 1 (
    echo ========================================================
    echo   [!] Node.js nahi mila ya PATH me nahi hai.
    echo   Automatic SQLite Setup shuru kiya ja raha hai...
    echo ========================================================
    call "%~dp0INSTALL_SQLITE.bat"
    exit /b
)

:: Check if core dependencies (express + better-sqlite3) load cleanly
if not exist "%~dp0node_modules" (
    echo ========================================================
    echo   [!] Project dependencies nahi mile.
    echo   Automatic SQLite Setup shuru kiya ja raha hai...
    echo ========================================================
    call "%~dp0INSTALL_SQLITE.bat"
    exit /b
)
node -e "require('express');require('better-sqlite3');" >nul 2>&1
if errorlevel 1 (
    echo ========================================================
    echo   [!] Core npm modules incomplete/corrupt mile.
    echo   Automatic repair chalaya ja raha hai...
    echo ========================================================
    call "%~dp0INSTALL_SQLITE.bat"
    exit /b
)

:: Database self-healing & schema integrity check (< 50ms)
node "%~dp0setup-database.js"

:: Start hidden server and open browser
echo Starting CSC ^& BC Apna Hisaab (SQLite Edition)...
if exist "%~dp0open-app.vbs" (
    start "" wscript.exe "%~dp0open-app.vbs"
) else (
    start "" node "%~dp0server.js"
    timeout /t 2 >nul
    start http://localhost:4000
)
exit /b 0
