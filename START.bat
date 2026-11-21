@echo off
setlocal EnableExtensions
title CSC ^& BC Apna Hisaab
cd /d "%~dp0"

:: Check if Node.js is installed
where node >nul 2>&1
if errorlevel 1 (
    echo ========================================================
    echo   [!] Node.js nahi mila ya PATH me nahi hai.
    echo   Auto-Setup shuru kiya ja raha hai...
    echo ========================================================
    call "%~dp0ONE_CLICK_SETUP.bat"
    exit /b
)

:: Check if initial setup was completed (node_modules + .env exist)
if not exist "%~dp0node_modules" (
    echo ========================================================
    echo   [!] Project dependencies (node_modules) nahi mile.
    echo   Pehli baar setup chalaya ja raha hai...
    echo ========================================================
    call "%~dp0ONE_CLICK_SETUP.bat"
    exit /b
)

if not exist "%~dp0.env" (
    echo ========================================================
    echo   [!] Database configuration (.env) nahi mili.
    echo   Pehli baar setup chalaya ja raha hai...
    echo ========================================================
    call "%~dp0ONE_CLICK_SETUP.bat"
    exit /b
)

:: Silent update check (offline safe, data safe)
node utils\autoUpdater.js --silent >nul 2>&1

:: Server ko hidden background me start karo aur browser kholo (koi console window nahi)
start "" wscript.exe "%~dp0open-app.vbs"
exit /b 0
