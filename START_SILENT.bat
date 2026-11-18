@echo off
title Cash Management - Start Silent Background Server
color 0A
cls

cd /d "%~dp0"

echo.
echo  ==============================================================
echo   Starting Cash Management Server in Silent Background Mode...
echo  ==============================================================
echo.

:: Automatic silent update check before starting background server
node utils\autoUpdater.js --silent >nul 2>&1

call pm2 start server.js --name "cash-management"
call pm2 save

echo.
echo  ✅ Server background me silent run ho raha hai!
echo  ✅ PC band karke on karenge tab bhi automatically chalu ho jayega.
echo.
timeout /t 3 >nul
start http://localhost:3000
