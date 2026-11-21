@echo off
cd /d "%~dp0"
node utils\autoUpdater.js --silent >nul 2>&1
start "" wscript.exe "%~dp0open-app.vbs"
exit /b 0
