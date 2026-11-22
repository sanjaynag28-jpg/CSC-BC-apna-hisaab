@echo off
setlocal EnableExtensions
title CSC ^& BC Apna Hisaab
color 0B
cd /d "%~dp0"

:: Check if Node.js is installed
where node >nul 2>&1
if errorlevel 1 (
    echo ========================================================
    echo   [!] Node.js nahi mila ya PATH me nahi hai.
    echo   Automatic Setup shuru kiya ja raha hai...
    echo ========================================================
    call "%~dp0INSTALL_NOW.bat"
    exit /b
)

:: Check if initial setup was completed (node_modules + .env exist)
if not exist "%~dp0node_modules" (
    echo ========================================================
    echo   [!] Project dependencies nahi mile.
    echo   Automatic Setup shuru kiya ja raha hai...
    echo ========================================================
    call "%~dp0INSTALL_NOW.bat"
    exit /b
)

if not exist "%~dp0.env" (
    echo ========================================================
    echo   [!] Database configuration nahi mili.
    echo   Automatic Setup shuru kiya ja raha hai...
    echo ========================================================
    call "%~dp0INSTALL_NOW.bat"
    exit /b
)

:: Silent update check (offline safe, data safe)
node utils\autoUpdater.js --silent >nul 2>&1

:: Start hidden server and open browser
echo Starting CSC ^& BC Apna Hisaab...
start "" wscript.exe "%~dp0open-app.vbs"
exit /b 0
