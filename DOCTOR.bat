@echo off
setlocal EnableExtensions
title CSC ^& BC Apna Hisaab - DOCTOR (auto fix)
:: ============================================================================
:: CSC & BC APNA HISAAB - DOCTOR
::   PC restart ke baad server start na ho to ye ek click me:
::   1) Sab checks karta hai (node, .env, SQL service, port 3000, auto-start)
::   2) Jo toota hai use theek karta hai (startup entry / run key / login task)
::   3) Server start karke verify karta hai
::   Poora log Desktop par: CSC_DOCTOR_LOG.txt
:: ============================================================================

set "RAW=https://raw.githubusercontent.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/main/scripts/doctor.ps1"
set "REL=https://github.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/releases/latest/download/doctor.ps1"
set "PS1=%TEMP%\cmbc_doctor.ps1"

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator permission...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo ============================================================
echo   CSC ^& BC APNA HISAAB - DOCTOR
echo ============================================================
echo.
echo [1/2] Doctor script download (auto-retry)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; $o='%PS1%'; $urls=@('%REL%','%RAW%'); foreach($u in $urls){ for($i=1;$i -le 4;$i++){ try { [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; if(Test-Path $o){ Remove-Item $o -Force }; Invoke-WebRequest -Uri $u -OutFile $o -UseBasicParsing -TimeoutSec 90; if((Test-Path $o) -and (Get-Item $o).Length -gt 2000){ exit 0 } } catch { }; Start-Sleep -Seconds (2*$i) } }; exit 1"
if errorlevel 1 (
    echo.
    echo [ERR] Doctor script download fail. Internet check karke dobara chalayein.
    pause
    exit /b 1
)

echo [2/2] Checks + auto-fix + server start...
echo        (2-3 min lag sakte hain, screen par sab dikhega)
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
set "RC=%errorlevel%"

echo.
if "%RC%"=="0" (
    echo ============================================================
    echo   DOCTOR SUCCESS - ab http://localhost:3000 kholein
    echo ============================================================
) else (
    echo ============================================================
    echo   DOCTOR: server abhi start nahi hua
    echo   Desktop par CSC_DOCTOR_LOG.txt bhejein
    echo ============================================================
)
pause
exit /b %RC%
