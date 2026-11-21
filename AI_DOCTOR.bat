@echo off
setlocal EnableExtensions
title CSC ^& BC Apna Hisaab - Free AI Auto-Fix ^& Doctor
cd /d "%~dp0"

:: Auto-elevate to Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Administrator permission request ki ja rahi hai...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo ======================================================================
echo   CSC ^& BC APNA HISAAB - FREE AI LIVE AUTO-FIX ^& DOCTOR (SELF-HEAL)
echo ======================================================================
echo.
echo   Yeh tool system ki sabhi problems:
echo   - SQL Server Express service ^& TCP/IP protocols
echo   - Visual C++ runtime, TLS 1.2 registry keys
echo   - Port 3000 collision, .env credentials
echo   - Corrupt/missing files auto-repair
echo   - Database reconciliation ^& live server launch
echo   ko 100%% live AI diagnostic se theek karta hai.
echo.
echo ======================================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\ai_doctor.ps1" -ProjectDir "%~dp0" -AutoFix

echo.
echo ======================================================================
echo   Diagnostic complete ho gaya. Log Desktop par CSC_AI_DOCTOR_LOG.txt hai.
echo ======================================================================
pause
exit /b %errorlevel%
