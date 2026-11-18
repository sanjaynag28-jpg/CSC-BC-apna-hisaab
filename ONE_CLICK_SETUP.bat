@echo off
setlocal EnableExtensions
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
echo ============================================================
echo   CSC ^& BC APNA HISAAB - COMPLETE AUTO SETUP (auto-retry)
echo ============================================================

set "ATTEMPT=1"
:run_setup
echo.
echo [Attempt %ATTEMPT%/2] Setup engine start...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\auto_setup_windows.ps1"
if %errorlevel% equ 0 goto setup_ok

if "%ATTEMPT%"=="1" (
    echo.
    echo [!] Setup me rukawat aayi - automatic retry (round 2, 5 sec baad)...
    timeout /t 5 /nobreak >nul
    set "ATTEMPT=2"
    goto run_setup
)

echo.
echo [X] Setup 2 attempts ke baad bhi complete nahi hua.
echo     Log dekhein: "%~dp0logs\install.log"
echo     Internet / SQL Server check karke isi file ko dobara chalayein - retry automatic hai.
echo     Aapka data (.env, uploads, backups, database) safe rehta hai.
pause
exit /b 1

:setup_ok
echo.
echo [OK] Setup complete - server background me chal raha hai.
exit /b 0
