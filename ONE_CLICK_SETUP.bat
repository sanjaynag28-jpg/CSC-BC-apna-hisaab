@echo off
title CSC & BC Apna Hisaab - 1-Click Complete Setup
cd /d "%~dp0"

:: Auto-elevate to Administrator so Node.js / SQL Server Express & TCP/IP configure cleanly in 1 click
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator permission for automatic Node.js ^& SQL Server setup...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\auto_setup_windows.ps1"
if %errorlevel% neq 0 (
    echo.
    echo [!] Setup me koi rukawat aayi. Upar diye gaye error ko dekhein.
    pause
    exit /b 1
)

echo.
pause
