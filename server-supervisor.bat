@echo off
rem ============================================================================
rem CSC & BC Apna Hisaab - Hidden Server Supervisor (SQLite Edition)
rem - Server ko silent background me chalata hai (koi window nahi)
rem - Crash / update restart ke baad khud dobara start karta hai
rem - Port busy ya logs\.stop_supervisor sentinel hone par cleanly band hota hai
rem ============================================================================
setlocal EnableExtensions DisableDelayedExpansion
set "PROJ_DIR=%~dp0"
if "%PROJ_DIR:~-1%"=="\" if not "%PROJ_DIR:~-2%"==":\" set "PROJ_DIR=%PROJ_DIR:~0,-1%"
cd /d "%PROJ_DIR%"

if not exist "logs" mkdir "logs"
set "CMBC_SUPERVISOR=1"

:: Resolve Node.js across local portable runtime first, then System/User/NVM/Scoop/Winget/Volta
set "NODE_EXE="
for %%P in (
    "%PROJ_DIR%\.runtime\nodejs\node.exe"
    "%ProgramFiles%\nodejs\node.exe"
    "%LOCALAPPDATA%\Programs\nodejs\node.exe"
    "%ProgramFiles(x86)%\nodejs\node.exe"
    "%NVM_SYMLINK%\node.exe"
    "%LOCALAPPDATA%\Microsoft\WinGet\Links\node.exe"
    "%USERPROFILE%\scoop\shims\node.exe"
    "%USERPROFILE%\.volta\bin\node.exe"
) do (
    if not defined NODE_EXE if exist "%%~P" set "NODE_EXE=%%~P"
)
if not defined NODE_EXE (
    for /f "delims=" %%W in ('where node 2^>nul') do (
        if not defined NODE_EXE set "NODE_EXE=%%~W"
    )
)
if not defined NODE_EXE (
    echo [%date% %time%] Node.js nahi mila - server start nahi ho sakta. SETUP.bat chalayein.>> "logs\server-run.log"
    exit /b 1
)

for %%I in ("%NODE_EXE%") do set "PATH=%%~dpI;%PATH%"

:: Rotate log file if > 5MB
if exist "logs\server-run.log" (
    for %%F in ("logs\server-run.log") do (
        if %%~zF GTR 5242880 (
            move /y "logs\server-run.log" "logs\server-run.prev.log" >nul 2>&1
        )
    )
)

:: Parse PORT safely from .env (ignore BOM, spaces, quotes, # comments)
set "CHECK_PORT=4000"
if exist ".env" (
    for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
        set "ENV_K=%%~A"
        set "ENV_V=%%~B"
        call :parse_port
    )
)

set "IDLE=0"
set "FAIL_STREAK=0"
set "UPD_WAIT=0"

:loop
if exist "logs\.stop_supervisor" exit /b 0

if exist "logs\.updating" (
    set /a UPD_WAIT+=1
    if %UPD_WAIT% LSS 40 (
        ping -n 4 127.0.0.1 >nul
        goto loop
    )
)
set "UPD_WAIT=0"

netstat -ano | findstr /R /C:":%CHECK_PORT% .*LISTENING" >nul 2>&1
if not errorlevel 1 (
    set /a IDLE+=1
    if %IDLE% GEQ 3 exit /b 0
    ping -n 11 127.0.0.1 >nul
    goto loop
)

set "IDLE=0"
"%NODE_EXE%" server.js >> "logs\server-run.log" 2>&1
set "SRV_RC=%errorlevel%"
if exist "logs\.stop_supervisor" exit /b 0

:: Wait briefly if updater is applying files before restarting
if exist "logs\.updating" (
    set "FAIL_STREAK=0"
    ping -n 3 127.0.0.1 >nul
    goto loop
)

:: If another instance already bound the port, treat as handoff (not a crash)
netstat -ano | findstr /R /C:":%CHECK_PORT% .*LISTENING" >nul 2>&1
if not errorlevel 1 (
    set "FAIL_STREAK=0"
    goto loop
)

if not "%SRV_RC%"=="0" (
    set /a FAIL_STREAK+=1
) else (
    set "FAIL_STREAK=0"
    ping -n 3 127.0.0.1 >nul
    goto loop
)
if %FAIL_STREAK% GEQ 5 (
    echo [%date% %time%] Server 5 baar lagatar fail hua (Exit %SRV_RC%). Loop roka ja raha hai - AI_DOCTOR_SQLITE.bat chalayein.>> "logs\server-run.log"
    exit /b %SRV_RC%
)

ping -n 6 127.0.0.1 >nul
goto loop

:parse_port
set "ENV_K=%ENV_K: =%"
if /i "%ENV_K%"=="PORT" (
    for /f "tokens=1 delims=# " %%P in ("%ENV_V%") do set "ENV_V=%%~P"
    set "ENV_V=%ENV_V:"=%"
    if not "%ENV_V%"=="" set "CHECK_PORT=%ENV_V%"
)
exit /b 0
