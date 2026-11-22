@echo off
title CSC ^& BC Apna Hisaab - Stop Server
color 0C
cd /d "%~dp0"

echo Stopping CSC ^& BC Apna Hisaab server (Port 3000)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo.
echo [OK] Server stopped successfully.
timeout /t 2 >nul
