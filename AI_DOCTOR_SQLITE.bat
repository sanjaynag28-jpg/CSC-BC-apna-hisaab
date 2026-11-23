@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
title CSC ^& BC Apna Hisaab - SQLite AI Live Doctor
color 0B

:: Auto-elevate to Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [..] Administrator permission mang rahe hain...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%comspec%' -ArgumentList @('/k', 'call', ([char]34 + '%~f0' + [char]34)) -Verb RunAs"
    exit /b
)

cd /d "%~dp0"

echo ======================================================================
echo   CSC ^& BC APNA HISAAB - SQLITE EDITION AI LIVE DOCTOR
echo ======================================================================
echo.
echo   Yeh AI tool kisi bhi problem ko automatically diagnose karke
echo   live repair karega (Zero SQL Server setup zaroorat).
echo.

set "TARGET_DIR=%~dp0"
if "%TARGET_DIR:~-1%"=="\" set "TARGET_DIR=%TARGET_DIR:~0,-1%"

if exist "%TARGET_DIR%\scripts\ai_doctor_sqlite.ps1" (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%TARGET_DIR%\scripts\ai_doctor_sqlite.ps1" -ProjectDir "%TARGET_DIR%"
    exit /b %errorlevel%
)

:: Standalone download mode
set "DOC_SCRIPT=%TEMP%\cmbc_ai_doctor_sqlite_%RANDOM%.ps1"
echo [..] Latest AI Doctor engine load ho raha hai...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $dst='%DOC_SCRIPT%'; $cb='%RANDOM%%RANDOM%'; $urls=@(('https://raw.githubusercontent.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/sqlite/scripts/ai_doctor_sqlite.ps1?t=' + $cb),('https://cdn.jsdelivr.net/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab@sqlite/scripts/ai_doctor_sqlite.ps1?t=' + $cb),('https://fastly.jsdelivr.net/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab@sqlite/scripts/ai_doctor_sqlite.ps1?t=' + $cb)); foreach($u in $urls){ try { Invoke-WebRequest -Uri $u -OutFile $dst -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop; if((Test-Path $dst) -and (Get-Item $dst).Length -gt 1000){ exit 0 } } catch { } }; exit 1"

if exist "%DOC_SCRIPT%" (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%DOC_SCRIPT%" -ProjectDir "%TARGET_DIR%"
    del /f /q "%DOC_SCRIPT%" >nul 2>&1
) else (
    echo [ERROR] AI Doctor download nahi ho saka. Internet connection check karein.
    pause
)
exit /b
