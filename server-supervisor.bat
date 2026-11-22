@echo off
rem ============================================================================
rem CSC & BC Apna Hisaab - Hidden Server Supervisor
rem - Server ko silent background me chalata hai (koi window nahi)
rem - Crash / update restart ke baad khud dobara start karta hai
rem - Agar port 4000 par pehle se server chal raha hai to duplicate nahi banata
rem ============================================================================
setlocal EnableDelayedExpansion
cd /d "%~dp0"

if not exist "logs" mkdir "logs"
set "CMBC_SUPERVISOR=1"

set "NODE_EXE=node"
where node >nul 2>&1
if errorlevel 1 if exist "C:\Program Files\nodejs\node.exe" set "NODE_EXE=C:\Program Files\nodejs\node.exe"

"%NODE_EXE%" -v >nul 2>&1
if errorlevel 1 (
    echo [%date% %time%] Node.js nahi mila - server start nahi ho sakta. SETUP.bat chalayein.>> "logs\server-run.log"
    exit /b 1
)

set "IDLE=0"

:loop
netstat -ano | findstr /R /C:":4000 .*LISTENING" >nul 2>&1
if not errorlevel 1 (
    rem Port already busy: ya to server chal raha hai, ya doosra supervisor.
    rem 30 second tak busy rahe to duplicate supervisor band ho jata hai.
    set /a IDLE+=1
    if !IDLE! GEQ 3 exit /b 0
    timeout /t 10 /nobreak >nul
    goto loop
)

set "IDLE=0"
"%NODE_EXE%" server.js >> "logs\server-run.log" 2>&1
timeout /t 5 /nobreak >nul
goto loop
