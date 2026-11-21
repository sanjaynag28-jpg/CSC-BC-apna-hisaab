@echo off
setlocal EnableExtensions
title CSC ^& BC Apna Hisaab - Clean Fresh Re-Installer
color 0B

net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

cls
echo ======================================================================
echo   CSC ^& BC APNA HISAAB - 100%% CLEAN FRESH RE-INSTALLER
echo ======================================================================
echo.
echo   Yeh tool purane / adhoore installation folder ko saaf karke
echo   100%% naye sire se fresh installation shuru karega.
echo.
echo   Target Folder: %USERPROFILE%\CSC-BC-Apna-Hisaab
echo.
echo ======================================================================
echo.
echo Press any key to start Clean Re-installation...
pause >nul

echo.
echo [1/3] Purane adhoore files aur cache saaf kiya ja raha hai...
if exist "%USERPROFILE%\CSC-BC-Apna-Hisaab" (
    rmdir /s /q "%USERPROFILE%\CSC-BC-Apna-Hisaab" >nul 2>&1
)
del /f /q "%TEMP%\cmbc_*" >nul 2>&1

echo [2/3] Clean Setup Engine shuru ho raha hai...
echo.

set "SCRIPT_DIR=%~dp0"
if exist "%SCRIPT_DIR%INSTALL_NOW.bat" (
    call "%SCRIPT_DIR%INSTALL_NOW.bat"
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $p=Join-Path $env:TEMP 'INSTALL_NOW.bat'; Invoke-WebRequest -Uri 'https://cdn.jsdelivr.net/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab@main/INSTALL_NOW.bat' -OutFile $p -UseBasicParsing; & $p"
)

exit /b 0
