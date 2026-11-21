@echo off
setlocal EnableExtensions
title CSC ^& BC Apna Hisaab - DOCTOR (Auto-Diagnose ^& Fix)
cd /d "%~dp0"

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator permission...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo ============================================================
echo   CSC ^& BC APNA HISAAB - DOCTOR (Auto-Diagnose ^& Fix)
echo ============================================================
echo.

if exist "%~dp0scripts\ai_doctor.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\ai_doctor.ps1" -ProjectDir "%~dp0" -AutoFix
    set "RC=%errorlevel%"
    goto finish
)
if exist "%~dp0scripts\doctor.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\doctor.ps1"
    set "RC=%errorlevel%"
    goto finish
)

echo Local doctor script nahi mili, GitHub se download kar rahe hain...
set "PS1=%TEMP%\cmbc_doctor.ps1"
set "RAW=https://raw.githubusercontent.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/main/scripts/doctor.ps1"
set "REL=https://github.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/releases/latest/download/doctor.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; $o='%PS1%'; $urls=@('%REL%','%RAW%'); foreach($u in $urls){ for($i=1;$i -le 4;$i++){ try { [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; if(Test-Path $o){ Remove-Item $o -Force }; Invoke-WebRequest -Uri $u -OutFile $o -UseBasicParsing -TimeoutSec 90; if((Test-Path $o) -and (Get-Item $o).Length -gt 2000){ exit 0 } } catch { }; Start-Sleep -Seconds (2*$i) } }; exit 1"
if errorlevel 1 (
    echo.
    echo [ERR] Doctor script download fail. Internet check karke dobara chalayein.
    pause
    exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
set "RC=%errorlevel%"

:finish
echo.
if "%RC%"=="0" (
    echo ============================================================
    echo   DOCTOR SUCCESS - ab http://localhost:3000 kholein
    echo ============================================================
) else (
    echo ============================================================
    echo   DOCTOR: server abhi start nahi hua
    echo   Desktop par CSC_DOCTOR_LOG.txt dekhein
    echo ============================================================
)
pause
exit /b %RC%
