@echo off
setlocal EnableExtensions
title CSC ^& BC Apna Hisaab - SQLite AI Live Doctor
cd /d "%~dp0.."

:: Auto-elevate to Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Administrator permission request ki ja rahi hai...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo ======================================================================
echo   CSC ^& BC APNA HISAAB - SQLITE EDITION AI LIVE DOCTOR (SELF-HEAL)
echo ======================================================================
echo.
echo   Yeh tool system ki sabhi problems:
echo   - Visual C++ runtime, TLS 1.2 registry keys
echo   - Port 4000 collision, .env credentials
echo   - Corrupt/missing files auto-repair
echo   - Embedded SQLite Database auto-repair ^& live server launch
echo   ko 100%% live AI diagnostic se theek karta hai (Zero SQL Server needed).
echo.
echo ======================================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\scripts\ai_doctor_sqlite.ps1" -ProjectDir "%~dp0.."

echo.
echo ======================================================================
echo   Diagnostic complete ho gaya. Log Desktop par CSC_SQLITE_AI_DOCTOR_LOG.txt hai.
echo ======================================================================
pause
exit /b %errorlevel%
