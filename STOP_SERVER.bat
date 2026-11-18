@echo off
title Stop Cash Management Server
color 0C
cls

echo Stopping Cash Management server...
call pm2 stop cash-management >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1

echo.
echo ✅ Cash Management Server stopped successfully!
echo.
pause
