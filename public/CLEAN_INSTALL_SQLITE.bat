@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
title CSC ^& BC Apna Hisaab - 100%% Clean Reset ^& Re-Installer (SQLite)
color 0C

:: Auto-elevate to Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [..] Administrator permission mang rahe hain...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd.exe -ArgumentList '/k \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"

echo ======================================================================
echo   CSC ^& BC APNA HISAAB - 100%% CLEAN RESET ^& RE-INSTALLER (SQLITE)
echo ======================================================================
echo.
echo   Yeh tool purane cache, node_modules ya database ko 100%% naye sire se
echo   saaf karke fresh clean install karega.
echo.
echo   Agar aap continue karna chahte hain, to koi bhi key dabayein...
echo   (Rukne ke liye ye window band kar dein)
echo.
pause >nul

echo [1/3] Purane active processes band kiye ja rahe hain...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM wscript.exe >nul 2>&1
echo   [OK] Processes band ho gaye.

echo.
echo [2/3] SQLite data aur cache reset kiya ja raha hai...
if exist "%~dp0database\data\cash_management.db" (
    del /f /q "%~dp0database\data\cash_management.db*" >nul 2>&1
    echo   [OK] Purana database clean ho gaya.
)

set "TARGET_DIR=%USERPROFILE%\CSC-BC-Apna-Hisaab-SQLite"
if exist "%TARGET_DIR%\database\data" (
    del /f /q "%TARGET_DIR%\database\data\cash_management.db*" >nul 2>&1
)

echo.
echo [3/3] Fresh Re-Installation shuru ho raha hai...
call "%~dp0INSTALL_SQLITE.bat"
exit /b %errorlevel%
