@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul 2>&1
title CSC ^& BC Apna Hisaab - Stop Server
color 0C
cd /d "%~dp0"

if not exist "logs" mkdir "logs"
echo stop> "logs\.stop_supervisor"

set "APP_PORT=4000"
if exist ".env" (
    for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
        set "K=%%~A"
        set "V=%%~B"
        call :check_port
    )
)

echo Stopping CSC ^& BC Apna Hisaab server (Port %APP_PORT% ^& Supervisor)...
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command ^
  "$dir = (Get-Location).Path;" ^
  "Get-CimInstance Win32_Process -Filter \"Name='cmd.exe'\" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and $_.CommandLine -like '*server-supervisor.bat*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue };" ^
  "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and ($_.CommandLine -like '*server.js*') -and ($_.CommandLine -like \"*$dir*\" -or -not $_.CommandLine.Contains('\\')) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue };" ^
  "Get-NetTCPConnection -LocalPort %APP_PORT% -State Listen -ErrorAction SilentlyContinue | ForEach-Object { if ($_.OwningProcess -gt 4) { $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue; if ($p -and $p.ProcessName -ieq 'node') { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } } }" >nul 2>&1

echo.
echo [OK] Server and background supervisor stopped successfully.
ping -n 3 127.0.0.1 >nul
exit /b 0

:check_port
set "K=%K: =%"
if /i "%K%"=="PORT" (
    for /f "tokens=1 delims=# " %%P in ("%V%") do set "V=%%~P"
    set "V=%V:"=%"
    if not "%V%"=="" set "APP_PORT=%V%"
)
exit /b 0
