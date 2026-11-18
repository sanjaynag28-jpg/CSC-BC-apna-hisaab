@echo off
title Cash Management BC
cd /d "%~dp0"
where node >nul 2>&1 || (echo Node.js not found. Install from https://nodejs.org & pause & exit /b 1)
:: Automatic silent update check (offline safe, preserves all user data)
node utils\autoUpdater.js --silent >nul 2>&1
start "" cmd /c "node server.js"
timeout /t 3 /nobreak >nul
start http://localhost:3000
