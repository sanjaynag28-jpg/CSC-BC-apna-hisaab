@echo off
rem ============================================================================
rem CSC & BC Apna Hisaab - Hidden Server Supervisor (SQLite Edition)
rem - Server ko silent background me chalata hai (koi window nahi)
rem - Node v22+ verification + .env PORT live reload + stale .updating guard
rem - Crash / update restart ke baad khud dobara start karta hai
rem ============================================================================
setlocal EnableExtensions DisableDelayedExpansion
set "PROJ_DIR=%~dp0"
if "%PROJ_DIR:~-1%"=="\" if not "%PROJ_DIR:~-2%"==":\" set "PROJ_DIR=%PROJ_DIR:~0,-1%"
cd /d "%PROJ_DIR%"

if not exist "logs" mkdir "logs"
set "CMBC_SUPERVISOR=1"

:: Resolve Node.js >= v22 across local runtime, config/node-path.txt (SYSTEM safe), System, User, Winget, NVM
set "NODE_EXE="
if exist "%PROJ_DIR%\.runtime\nodejs\node.exe" (
    "%PROJ_DIR%\.runtime\nodejs\node.exe" -e "process.exit(parseInt(process.versions.node.split('.')[0],10)>=22?0:1)" >nul 2>&1 && set "NODE_EXE=%PROJ_DIR%\.runtime\nodejs\node.exe"
)
if not defined NODE_EXE if exist "%PROJ_DIR%\config\node-path.txt" (
    for /f "usebackq delims=" %%N in ("%PROJ_DIR%\config\node-path.txt") do (
        if not defined NODE_EXE if exist "%%~N" (
            "%%~N" -e "process.exit(parseInt(process.versions.node.split('.')[0],10)>=22?0:1)" >nul 2>&1 && set "NODE_EXE=%%~N"
        )
    )
)
for %%P in (
    "%ProgramFiles%\nodejs\node.exe"
    "%LOCALAPPDATA%\Programs\nodejs\node.exe"
    "%ProgramFiles(x86)%\nodejs\node.exe"
    "%NVM_SYMLINK%\node.exe"
    "%LOCALAPPDATA%\Microsoft\WinGet\Links\node.exe"
    "%USERPROFILE%\scoop\shims\node.exe"
    "%USERPROFILE%\.volta\bin\node.exe"
) do (
    if not defined NODE_EXE if exist "%%~P" (
        "%%~P" -e "process.exit(parseInt(process.versions.node.split('.')[0],10)>=22?0:1)" >nul 2>&1 && set "NODE_EXE=%%~P"
    )
)
if not defined NODE_EXE (
    for /f "delims=" %%W in ('where node 2^>nul') do (
        if not defined NODE_EXE (
            "%%~W" -e "process.exit(parseInt(process.versions.node.split('.')[0],10)>=22?0:1)" >nul 2>&1 && set "NODE_EXE=%%~W"
        )
    )
)
if not defined NODE_EXE (
    echo [%date% %time%] Node.js v22+ nahi mila - server start nahi ho sakta. SETUP.bat ya AI_DOCTOR_SQLITE.bat chalayein.>> "logs\server-run.log"
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

set "IDLE=0"
set "FAIL_STREAK=0"
set "UPD_WAIT=0"
set "RECOVER_ROUNDS=0"

:loop
if exist "logs\.stop_supervisor" exit /b 0
if exist "logs\.supervisor_relaunch" (
    del /f /q "logs\.supervisor_relaunch" >nul 2>&1
    exit /b 0
)

:: Re-read configured PORT from .env on each pass so port auto-heal changes take effect live
set "CHECK_PORT=4000"
if exist ".env" (
    for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
        set "ENV_K=%%~A"
        set "ENV_V=%%~B"
        call :parse_port
    )
)

if exist "logs\.updating" (
    set /a UPD_WAIT+=1
    if %UPD_WAIT% LSS 20 (
        ping -n 4 127.0.0.1 >nul
        goto loop
    )
    :: Auto-clear stale lock after ~60s wait so boot never gets permanently stuck
    del /f /q "logs\.updating" >nul 2>&1
    del /f /q "logs\.auto_update.lock" >nul 2>&1
)
set "UPD_WAIT=0"

:: Only skip spawning if OUR server (or any healthy service on CHECK_PORT) responds cleanly
"%NODE_EXE%" -e "const h=require('http');const r=h.get('http://127.0.0.1:%CHECK_PORT%/api/health',{timeout:1000},res=>{process.exit(res.statusCode===200||res.statusCode===503?0:1)});r.on('error',()=>process.exit(1));r.on('timeout',()=>{r.destroy();process.exit(1)});" >nul 2>&1
if not errorlevel 1 (
    set /a IDLE+=1
    if %IDLE% GEQ 3 exit /b 0
    ping -n 11 127.0.0.1 >nul
    goto loop
)

set "IDLE=0"
"%NODE_EXE%" "%PROJ_DIR%\server.js" >> "logs\server-run.log" 2>&1
set "SRV_RC=%errorlevel%"
if exist "logs\.stop_supervisor" exit /b 0
if exist "logs\.supervisor_relaunch" (
    del /f /q "logs\.supervisor_relaunch" >nul 2>&1
    exit /b 0
)

:: Wait briefly if updater is applying files before restarting
if exist "logs\.updating" (
    set "FAIL_STREAK=0"
    ping -n 3 127.0.0.1 >nul
    goto loop
)

:: If another healthy instance already took over port, reset streak
"%NODE_EXE%" -e "const h=require('http');const r=h.get('http://127.0.0.1:%CHECK_PORT%/api/health',{timeout:1000},res=>{process.exit(res.statusCode===200||res.statusCode===503?0:1)});r.on('error',()=>process.exit(1));r.on('timeout',()=>{r.destroy();process.exit(1)});" >nul 2>&1
if not errorlevel 1 (
    set "FAIL_STREAK=0"
    goto loop
)

if not "%SRV_RC%"=="0" (
    set /a FAIL_STREAK+=1
) else (
    set "FAIL_STREAK=0"
    set "RECOVER_ROUNDS=0"
    ping -n 2 127.0.0.1 >nul
    goto loop
)

if %FAIL_STREAK% GEQ 5 (
    set /a RECOVER_ROUNDS+=1
    if %RECOVER_ROUNDS% GEQ 3 (
        echo [%date% %time%] Server lagatar fail hua (Exit %SRV_RC%). Loop roka ja raha hai - AI_DOCTOR_SQLITE.bat chalayein.>> "logs\server-run.log"
        exit /b %SRV_RC%
    )
    echo [%date% %time%] Server 5 crashes (Exit %SRV_RC%) - 20s wait ke baad recovery round %RECOVER_ROUNDS%/3...>> "logs\server-run.log"
    set "FAIL_STREAK=0"
    ping -n 21 127.0.0.1 >nul
    goto loop
)

ping -n 4 127.0.0.1 >nul
goto loop

:parse_port
set "ENV_K=%ENV_K: =%"
if /i "%ENV_K%"=="PORT" (
    for /f "tokens=1 delims=# " %%P in ("%ENV_V%") do set "ENV_V=%%~P"
    set "ENV_V=%ENV_V:"=%"
    if not "%ENV_V%"=="" set "CHECK_PORT=%ENV_V%"
)
exit /b 0
