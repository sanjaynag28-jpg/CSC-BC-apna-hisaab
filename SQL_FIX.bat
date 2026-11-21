@echo off
setlocal EnableExtensions
title SQL Server Express Fix - CSC ^& BC Apna Hisaab
cd /d "%~dp0"

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator permission...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo ============================================================
echo   SQL SERVER EXPRESS - SELF REPAIR
echo ============================================================
echo.

if exist "%~dp0scripts\sql_fix.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\sql_fix.ps1"
    set "RC=%errorlevel%"
    goto finish
)

echo Local sql_fix script nahi mili, GitHub se download kar rahe hain...
set "PS1=%TEMP%\cmbc_sql_fix.ps1"
set "RAW=https://raw.githubusercontent.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/main/scripts/sql_fix.ps1"
set "REL=https://github.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/releases/latest/download/sql_fix.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; $o='%PS1%'; $urls=@('%REL%','%RAW%'); foreach($u in $urls){ for($i=1;$i -le 4;$i++){ try { [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; if(Test-Path $o){ Remove-Item $o -Force }; Invoke-WebRequest -Uri $u -OutFile $o -UseBasicParsing -TimeoutSec 90; if((Test-Path $o) -and (Get-Item $o).Length -gt 1000){ exit 0 } } catch { }; Start-Sleep -Seconds (2*$i) } }; exit 1"
if errorlevel 1 (
    echo.
    echo [ERR] Repair script download fail. Internet check karke dobara chalayein.
    pause
    exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
set "RC=%errorlevel%"

:finish
echo.
if "%RC%"=="0" (
    echo ============================================================
    echo   SQL FIX SUCCESS - ab ONE_CLICK_SETUP.bat dobara chalayein
    echo ============================================================
) else (
    echo ============================================================
    echo   SQL FIX FAIL - Desktop par SQL_FIX_LOG.txt dekhein
    echo ============================================================
)
pause
exit /b %RC%
