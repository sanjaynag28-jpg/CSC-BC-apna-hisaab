@echo off
setlocal EnableExtensions
title SQL Server Express Fix - CSC ^& BC Apna Hisaab
:: ============================================================================
:: SQL SERVER SELF-REPAIR (standalone)
::   - Adhoore/broken SQL Express leftovers detect + clean (takeown/icacls)
::   - Purane SQL setup/services band
::   - Fresh instance (CMBCSQL) install - master.mdf conflict se bachne ke liye
::   - Poora log Desktop par: SQL_FIX_LOG.txt
:: ============================================================================

set "RAW=https://raw.githubusercontent.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/main/scripts/sql_fix.ps1"
set "PS1=%TEMP%\cmbc_sql_fix.ps1"

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
echo [1/2] Repair script download (auto-retry)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; $u='%RAW%'; $o='%PS1%'; for($i=1;$i -le 6;$i++){ try { [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; if(Test-Path $o){ Remove-Item $o -Force }; Invoke-WebRequest -Uri $u -OutFile $o -UseBasicParsing -TimeoutSec 90; if((Test-Path $o) -and (Get-Item $o).Length -gt 1000){ exit 0 } } catch { }; Start-Sleep -Seconds (2*$i) }; exit 1"
if errorlevel 1 (
    echo.
    echo [ERR] Repair script download fail. Internet check karke dobara chalayein.
    pause
    exit /b 1
)

echo [2/2] Diagnostics + cleanup + fresh SQL instance install...
echo        (5-10 min lag sakte hain, screen par sab dikhega)
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
set "RC=%errorlevel%"

echo.
if "%RC%"=="0" (
    echo ============================================================
    echo   SQL FIX SUCCESS - ab SETUP.bat dobara chalayein
    echo ============================================================
) else (
    echo ============================================================
    echo   SQL FIX FAIL - Desktop par SQL_FIX_LOG.txt bhejein
    echo ============================================================
)
pause
exit /b %RC%
