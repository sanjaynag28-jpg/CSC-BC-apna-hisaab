@echo off
setlocal EnableExtensions
title CSC ^& BC Apna Hisaab - 100%% Foolproof Self-Repair ^& Setup
cd /d "%~dp0"

:: Auto-elevate to Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Administrator permission request ki ja rahi hai...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

cls
echo ======================================================================
echo   CSC ^& BC APNA HISAAB - 100%% FOOLPROOF AUTO FIX ^& SETUP
echo ======================================================================
echo.
echo   Yeh tool GitHub se install hone par aayi kisi bhi problem ko
echo   apne aap theek karke software ko 100%% चालू (Live) kar dega:
echo.
echo   [1/4] Node.js, SQL Server Express ^& Services Check
echo   [2/4] Dependencies (node_modules) ^& .env Auto-Configuration
echo   [3/4] Database Tables, Migrations ^& Stored Procedures
echo   [4/4] Server Launch ^& Browser (http://localhost:3000) Auto-Open
echo.
echo ======================================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\auto_setup_windows.ps1"
if %errorlevel% equ 0 (
    echo.
    echo ======================================================================
    echo   [OK] 100%% SUCCESS! Project theek ho gaya aur browser me khul gaya hai!
    echo ======================================================================
    timeout /t 5 >nul
    exit /b 0
)

echo.
echo ======================================================================
echo   [!] Round 1 me dikkat aayi. Deep Diagnostic Doctor try ho raha hai...
echo ======================================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\doctor.ps1"
if %errorlevel% equ 0 (
    echo.
    echo [OK] Doctor ne sabhi issues solve kar diye hain!
    timeout /t 5 >nul
    exit /b 0
)

echo.
echo [X] Kripya Desktop par bana CSC_DOCTOR_LOG.txt dekhein.
pause
exit /b 1
