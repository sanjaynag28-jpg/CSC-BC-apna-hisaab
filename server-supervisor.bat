@echo off
rem ============================================================================
rem CSC & BC Apna Hisaab - Hidden Server Supervisor
rem - Server ko silent background me chalata hai (koi window nahi)
rem - Crash / update restart ke baad khud dobara start karta hai
rem - Agar port 3000 par pehle se server chal raha hai to duplicate nahi banata
rem ============================================================================
setlocal
cd /d "%~dp0"

if not exist "logs" mkdir "logs"
set "CMBC_SUPERVISOR=1"

set "NODE_EXE=node"
where node >nul 2>&1
if errorlevel 1 if exist "C:\Program Files\nodejs\node.exe" set "NODE_EXE=C:\Program Files\nodejs\node.exe"

:loop
netstat -ano | findstr /R /C:":3000 .*LISTENING" >nul 2>&1
if not errorlevel 1 (
    timeout /t 10 /nobreak >nul
    goto loop
)

"%NODE_EXE%" server.js >> "logs\server-run.log" 2>&1
timeout /t 5 /nobreak >nul
goto loop
