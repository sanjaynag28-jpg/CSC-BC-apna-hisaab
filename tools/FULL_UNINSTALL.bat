@echo off
setlocal EnableExtensions EnableDelayedExpansion
title CSC ^& BC Apna Hisaab - FULL UNINSTALL (100% Clean Reset)
color 0C

:: Auto-elevate to Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Administrator permission request ki ja rahi hai...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0.."

echo ======================================================================
echo   CSC ^& BC APNA HISAAB - FULL UNINSTALL (100% Clean Reset)
echo ======================================================================
echo.
echo   Yeh tool project ko poori tarah saaf karega taaki aap
echo   fresh naya install kar sakein.
echo ======================================================================
echo.

set "TARGET=%USERPROFILE%\CSC-BC-Apna-Hisaab-SQLite"
set "LOCAL_PS1=%~dp0..\utils\full_uninstall.ps1"

if exist "%LOCAL_PS1%" goto RUN_LOCAL

echo Local uninstall script nahi mila, GitHub se download kar rahe hain...
set "PS1=%TEMP%\cmbc_full_uninstall.ps1"
set "RAW=https://raw.githubusercontent.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/sqlite/utils/full_uninstall.ps1"
set "REL=https://github.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/releases/latest/download/full_uninstall.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; $o=$env:PS1; $urls=@($env:REL,$env:RAW); foreach($u in $urls){ for($i=1;$i -le 4;$i++){ try { [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; if(Test-Path $o){ Remove-Item $o -Force }; Invoke-WebRequest -Uri $u -OutFile $o -UseBasicParsing -TimeoutSec 90; if((Test-Path $o) -and (Get-Item $o).Length -gt 2000){ exit 0 } } catch { }; Start-Sleep -Seconds (2*$i) } }; exit 1"
if errorlevel 1 goto DL_FAIL

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -ProjectDir "%TARGET%"
set "RC=%errorlevel%"
goto finish

:RUN_LOCAL
powershell -NoProfile -ExecutionPolicy Bypass -File "%LOCAL_PS1%" -ProjectDir "%TARGET%"
set "RC=%errorlevel%"
goto finish

:DL_FAIL
echo.
echo [ERR] Uninstall script download fail. Internet check karke dobara chalayein.
pause
exit /b 1

:finish
echo.
if "%RC%"=="0" (
    echo ======================================================================
    echo   UNINSTALL COMPLETE - ab INSTALL_FROM_GITHUB.bat se fresh install karein
    echo ======================================================================
) else (
    echo ======================================================================
    echo   Uninstall poora nahi hua. Upar error dekhein ya PC restart karke
    echo   dobara FULL_UNINSTALL.bat chalayein.
    echo ======================================================================
)
pause
exit /b %RC%