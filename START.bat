@echo off
title CSC & BC Apna Hisaab
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo Node.js nahi mila. Kripya ONE_CLICK_SETUP.bat chalayein.
    pause
    exit /b 1
)

rem Silent update check (offline safe, data safe)
node utils\autoUpdater.js --silent >nul 2>&1

rem Server ko hidden background me start karo aur browser kholo (koi console window nahi)
start "" wscript.exe "%~dp0open-app.vbs"
exit /b 0
