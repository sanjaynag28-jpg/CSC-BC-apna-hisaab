@echo off
title Cash Management - 1-Click Complete Project & Data Restore
color 0A
cd /d "%~dp0.."

echo ========================================================
echo    CASH MANAGEMENT BC — 1-CLICK DISASTER RESTORE
echo ========================================================
echo.
echo ⏳ Step 1: Checking libraries (node_modules)...
if not exist "node_modules\" (
    echo Downloading required packages...
    call npm install
    if errorlevel 1 goto install_failed
) else (
    echo Packages already installed.
)

echo.
echo ⏳ Step 2: Restoring SQL Server Database from latest backup...
node database/restore-runner.js
if errorlevel 1 goto restore_failed

echo.
echo ========================================================
echo 🎉 CONGRATULATIONS! PROJECT 100%% RESTORE HO GAYA HAI!
echo    Ab aap "START.bat" par double click karke chala sakte hain.
echo ========================================================
echo.
pause
exit /b 0

:install_failed
echo.
echo [!] Package installation failed. Restore was not started.
pause
exit /b 1

:restore_failed
echo.
echo [!] Database restore failed. Project restore was NOT successful.
pause
exit /b 1

