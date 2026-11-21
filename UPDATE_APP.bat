@echo off
cd /d "%~dp0"
echo CSC ^& BC Apna Hisaab update ho raha hai; is window ko band na karein.
node utils\autoUpdater.js --force
set "UPDATE_RC=%errorlevel%"
if not "%UPDATE_RC%"=="0" echo Update/repair fail hua. Details: logs\auto-update.log
start "" wscript.exe "%~dp0open-app.vbs"
exit /b %UPDATE_RC%
