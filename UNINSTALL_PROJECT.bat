@echo off
setlocal EnableExtensions
title CSC ^& BC Apna Hisaab - Project Uninstaller

powershell -NoProfile -Command "$p=[Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent(); if ($p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { exit 0 } else { exit 1 }" >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator permission...
    set "UNINSTALL_BATCH=%~f0"
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath $env:UNINSTALL_BATCH -Verb RunAs"
    exit /b
)

for %%I in ("%~dp0.") do set "BAT_DIR=%%~fI"
for %%I in ("%BAT_DIR%") do set "BAT_LEAF=%%~nxI"
set "TARGET_DIR=%USERPROFILE%\CSC-BC-Apna-Hisaab"
if /I "%BAT_LEAF%"=="CSC-BC-Apna-Hisaab" set "TARGET_DIR=%BAT_DIR%"

if not exist "%TARGET_DIR%\" (
    echo Default project folder nahi mila: "%TARGET_DIR%"
    set /p "TARGET_DIR=Project folder ka poora path likhein: "
)

set "SOURCE_PS1=%~dp0scripts\uninstall_project.ps1"
if exist "%SOURCE_PS1%" goto :source_ready
set "SOURCE_PS1=%~dp0uninstall_project.ps1"
if exist "%SOURCE_PS1%" goto :source_ready
set "SOURCE_PS1=%TEMP%\uninstall_project_%RANDOM%_%RANDOM%.ps1"
set "DOWNLOADED_PS1=%SOURCE_PS1%"
echo Uninstaller script download ho rahi hai...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/main/scripts/uninstall_project.ps1' -OutFile $env:SOURCE_PS1 -UseBasicParsing -TimeoutSec 45"
if errorlevel 1 goto :download_failed

:source_ready

set "TEMP_PS1=%TEMP%\csc_bc_uninstall_%RANDOM%_%RANDOM%.ps1"
copy /y "%SOURCE_PS1%" "%TEMP_PS1%" >nul
if errorlevel 1 (
    echo Uninstaller script ko TEMP folder mein copy nahi kar paye.
    if defined DOWNLOADED_PS1 del "%DOWNLOADED_PS1%" >nul 2>&1
    pause
    exit /b 1
)

cd /d "%TEMP%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%TEMP_PS1%" -ProjectDir "%TARGET_DIR%"
set "UNINSTALL_RC=%errorlevel%"
del "%TEMP_PS1%" >nul 2>&1
if defined DOWNLOADED_PS1 del "%DOWNLOADED_PS1%" >nul 2>&1
echo.
if "%UNINSTALL_RC%"=="0" (
    echo Uninstaller process complete.
) else if "%UNINSTALL_RC%"=="2" (
    echo Project folder removed, lekin kuch optional cleanup steps skip hue. Log check karein.
) else (
    echo Uninstall complete nahi hua; details: %TEMP%\CSC-BC-Apna-Hisaab-uninstall.log
)
pause
exit /b %UNINSTALL_RC%

:download_failed
del "%SOURCE_PS1%" >nul 2>&1
echo Uninstaller download fail hua. Internet check karein aur dobara chalayein.
pause
exit /b 1
