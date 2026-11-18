@echo off
title CSC & BC Apna Hisaab - Manual Update
cd /d "%~dp0"
echo ============================================================
echo   CSC ^& BC Apna Hisaab - Checking for Latest GitHub Update
echo ============================================================
echo.
node utils\autoUpdater.js --force
echo.
where pm2 >nul 2>&1
if %errorlevel% equ 0 (
    pm2 describe cash-management >nul 2>&1
    if %errorlevel% equ 0 (
        echo Restarting background server (PM2)...
        call pm2 restart cash-management
    )
)
echo.
echo Done! Agar browser khula hai to Ctrl+F5 ya refresh karein.
pause
