@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul 2>&1
title CSC ^& BC Apna Hisaab - SQLite AI Live Self-Healing Doctor
color 0B

set "PS_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS_EXE%" set "PS_EXE=powershell.exe"

set "NO_PAUSE=0"
echo %* | findstr /I "\--no-pause" >nul 2>&1 && set "NO_PAUSE=1"

set "ALREADY_ELEVATED=0"
echo %* | findstr /I "\--elevated" >nul 2>&1 && set "ALREADY_ELEVATED=1"

fltmc >nul 2>&1
if not errorlevel 1 goto :elevated_ok
net session >nul 2>&1
if not errorlevel 1 goto :elevated_ok

if "%ALREADY_ELEVATED%"=="0" (
    echo [..] Administrator permission mang rahe hain...
    set "_CMBC_SELF=%~f0"
    "%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -Command "try { Start-Process -FilePath $env:ComSpec -ArgumentList @('/c', ('\"\"' + $env:_CMBC_SELF + '\" --elevated\"')) -Verb RunAs -ErrorAction Stop; exit 0 } catch { exit 1 }"
    if not errorlevel 1 exit /b 0
    echo [!] Standard User mode me AI Doctor chalaya ja raha hai...
)

:elevated_ok
cd /d "%~dp0"

echo ======================================================================
echo   CSC ^& BC APNA HISAAB - SQLITE EDITION AI LIVE DOCTOR
echo ======================================================================
echo.
echo   Yeh AI engine kisi bhi PC par install/boot problems ko diagnose karke
echo   automatically live repair karega (Zero SQL Server setup zaroorat).
echo.

set "TARGET_DIR=%~dp0"
if "%TARGET_DIR:~-1%"=="\" if not "%TARGET_DIR:~-2%"==":\" set "TARGET_DIR=%TARGET_DIR:~0,-1%"
if not exist "%TARGET_DIR%\server.js" if exist "%USERPROFILE%\CSC-BC-Apna-Hisaab-SQLite\server.js" (
    set "TARGET_DIR=%USERPROFILE%\CSC-BC-Apna-Hisaab-SQLite"
)

if exist "%TARGET_DIR%\scripts\ai_doctor_sqlite.ps1" (
    set "DOC_SCRIPT=%TARGET_DIR%\scripts\ai_doctor_sqlite.ps1"
    goto :run_doc
)

set "DOC_SCRIPT=%TEMP%\cmbc_ai_doctor_sqlite_%RANDOM%.ps1"
set "CACHE_BUSTER=%RANDOM%%RANDOM%"
echo [..] Latest AI Doctor engine GitHub se load ho raha hai...
"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType](3072 -bor 12288) } catch { try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]3072 } catch {} }; " ^
  "try { [System.Net.WebRequest]::DefaultWebProxy.Credentials = [System.Net.CredentialCache]::DefaultNetworkCredentials } catch {}; " ^
  "$dst=$env:DOC_SCRIPT; $cb=$env:CACHE_BUSTER;" ^
  "$urls=@(('https://raw.githubusercontent.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/sqlite/scripts/ai_doctor_sqlite.ps1?t=' + $cb),('https://cdn.jsdelivr.net/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab@sqlite/scripts/ai_doctor_sqlite.ps1?t=' + $cb),('https://fastly.jsdelivr.net/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab@sqlite/scripts/ai_doctor_sqlite.ps1?t=' + $cb));" ^
  "foreach($u in $urls){ try { Invoke-WebRequest -Uri $u -OutFile $dst -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop; if(Test-Path -LiteralPath $dst){ $len=(Get-Item -LiteralPath $dst).Length; $h=Get-Content -LiteralPath $dst -TotalCount 15 -Raw -ErrorAction SilentlyContinue; if($len -gt 5000 -and $h -notmatch '<!DOCTYPE|<html'){ exit 0 } Remove-Item -LiteralPath $dst -Force -ErrorAction SilentlyContinue } } catch { } }; exit 1"

if not exist "%DOC_SCRIPT%" (
    where curl.exe >nul 2>&1
    if not errorlevel 1 (
        for %%U in (
            "https://cdn.jsdelivr.net/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab@sqlite/scripts/ai_doctor_sqlite.ps1?t=%CACHE_BUSTER%"
            "https://raw.githubusercontent.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/sqlite/scripts/ai_doctor_sqlite.ps1?t=%CACHE_BUSTER%"
        ) do (
            if not exist "%DOC_SCRIPT%" (
                curl.exe -fSL --doh-url https://cloudflare-dns.com/dns-query --retry 2 --connect-timeout 12 %%U -o "%DOC_SCRIPT%" >nul 2>&1
                if not exist "%DOC_SCRIPT%" curl.exe -fSL --retry 2 --connect-timeout 12 %%U -o "%DOC_SCRIPT%" >nul 2>&1
            )
        )
    )
)

:run_doc
if not exist "%DOC_SCRIPT%" (
    echo [ERROR] AI Doctor download nahi ho saka. Internet connection check karein.
    if "%NO_PAUSE%"=="0" pause
    exit /b 1
)

if "%NO_PAUSE%"=="1" (
    "%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%DOC_SCRIPT%" -ProjectDir "%TARGET_DIR%" -NoPause
) else (
    "%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%DOC_SCRIPT%" -ProjectDir "%TARGET_DIR%"
)
set "DOC_RC=%errorlevel%"

echo "%DOC_SCRIPT%" | findstr /I "%TEMP%" >nul 2>&1 && del /f /q "%DOC_SCRIPT%" >nul 2>&1
exit /b %DOC_RC%
