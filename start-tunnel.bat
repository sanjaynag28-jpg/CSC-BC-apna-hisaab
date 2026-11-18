@echo off
title Cash Management Permanent Cloud Tunnel
cls
echo ========================================================
echo   Cash Management BC - Permanent Cloud Tunnel
echo ========================================================
echo.
if not exist "tunnel-service.js" (
    echo [!] Tunnel launcher is unavailable: tunnel-service.js was not found.
    echo No tunnel was started.
    pause
    exit /b 1
)
echo Tunnel shuru ho raha hai...
echo.
node tunnel-service.js
if errorlevel 1 (
    echo [!] Tunnel launcher failed.
    pause
    exit /b 1
)
pause
exit /b 0
