@echo off
title Cash Management - Auto Startup Setup
color 0A
cls

cd /d "%~dp0"

echo.
echo ================================================================
echo    Cash Management BC - PC Auto-Start Setup
echo ================================================================
echo.

echo [*] Registering server in PM2...
where pm2 >nul 2>&1
if errorlevel 1 goto pm2_missing

call pm2 start server.js --name "cash-management" >nul 2>&1
if errorlevel 1 goto pm2_start_failed

call pm2 describe "cash-management" >nul 2>&1
if errorlevel 1 goto pm2_verify_failed

call pm2 save
if errorlevel 1 goto pm2_save_failed

echo [*] Creating Startup VBScript...
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "VBS_FILE=%STARTUP_FOLDER%\AutoStart_CashManagement.vbs"

(
echo ' Silent Auto-Start for Cash Management BC on Windows Startup
echo Set WshShell = CreateObject^("WScript.Shell"^)
echo WshShell.Run """C:\Program Files\nodejs\node.exe"" """ ^& "%APPDATA%\npm\node_modules\pm2\bin\pm2" ^& """ resurrect", 0, False
) > "%VBS_FILE%"
if not exist "%VBS_FILE%" goto vbs_failed

echo.
echo ================================================================
echo   [SUCCESS] PC On hote hi Cash Management automatically start hoga!
echo   Website: http://localhost:3000/
echo ================================================================
echo.
pause
exit /b 0

:pm2_missing
echo [!] PM2 was not found. Install PM2 and retry; startup was not registered.
goto failed

:pm2_start_failed
echo [!] PM2 could not start the server; startup was not registered.
goto failed

:pm2_verify_failed
echo [!] PM2 did not confirm the cash-management process; startup was not registered.
goto failed

:pm2_save_failed
echo [!] PM2 could not save its process list; startup was not registered.
goto failed

:vbs_failed
echo [!] Could not create the Windows Startup launcher.
goto failed

:failed
pause
exit /b 1
