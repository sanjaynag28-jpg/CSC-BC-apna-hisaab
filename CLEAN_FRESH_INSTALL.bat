@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
title CSC ^& BC Apna Hisaab - 100%% Clean Fresh Re-Installer
color 0B

:: ====================================================================
:: 1. Auto-elevate to Administrator (keeps window open with /k on error)
:: ====================================================================
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [..] Administrator permission mang rahe hain...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd.exe -ArgumentList '/k \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"
cls
echo ======================================================================
echo   CSC ^& BC APNA HISAAB - 100%% CLEAN FRESH RE-INSTALLER
echo ======================================================================
echo.
echo   Yeh tool purane / adhoore installation folder aur Database ko
echo   100%% naye sire se fresh clean banayega.
echo.

set "TARGET_DIR=%USERPROFILE%\CSC-BC-Apna-Hisaab"
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"
set "WIZ_SCRIPT=%TEMP%\cmbc_installer_wizard.ps1"

echo [1/3] Purane adhoore cache saaf kiye ja rahe hain...
if exist "%TARGET_DIR%\.git" (
    echo   [INFO] Source git repository detected; files safe rakhi gayi hain.
) else (
    if exist "%TARGET_DIR%" (
        echo   [..] Deleting old project folder: %TARGET_DIR%...
        rd /s /q "%TARGET_DIR%" >nul 2>&1
    )
    mkdir "%TARGET_DIR%" >nul 2>&1
)
del /f /q "%TEMP%\cmbc_*" >nul 2>&1
echo   [OK] Purana adhoora folder saaf ho gaya.
echo.

echo [2/3] Latest Setup Engine download ho raha hai...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $dst='%WIZ_SCRIPT%'; $urls=@('https://raw.githubusercontent.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/main/scripts/installer_wizard.ps1','https://github.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/raw/main/scripts/installer_wizard.ps1','https://cdn.jsdelivr.net/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab@main/scripts/installer_wizard.ps1'); $ok=$false; foreach($u in $urls){ try { Write-Host ('  [..] Connecting to ' + ([Uri]$u).Host + '...') -ForegroundColor Yellow; Invoke-WebRequest -Uri ($u + '?t=' + [DateTime]::UtcNow.Ticks) -OutFile $dst -UseBasicParsing -TimeoutSec 15; if((Test-Path $dst) -and (Get-Item $dst).Length -gt 5000){ $ok=$true; Write-Host '  [OK] Setup Engine loaded!' -ForegroundColor Green; break } } catch { Write-Host ('  [!] Notice: ' + $_.Exception.Message) -ForegroundColor Gray } }; if(-not $ok){ exit 1 }"

if errorlevel 1 (
    echo.
    echo [!] Direct script blocked. Downloading full package archive from GitHub...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $z=Join-Path $env:TEMP 'cmbc_repo.zip'; Invoke-WebRequest -Uri 'https://github.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/archive/refs/heads/main.zip' -OutFile $z -UseBasicParsing -TimeoutSec 90; $e=Join-Path $env:TEMP ('cmbc_e_' + (Get-Random)); Expand-Archive -LiteralPath $z -DestinationPath $e -Force; $s=(Get-ChildItem -Path $e -Directory | Select-Object -First 1).FullName; robocopy $s '%TARGET_DIR%' /E /XD (Join-Path $s '.git') (Join-Path $s 'node_modules') (Join-Path $s 'backups') (Join-Path $s 'logs') /XF '.env' /NFL /NDL /NJH /NJS | Out-Null; Copy-Item (Join-Path '%TARGET_DIR%' 'scripts\installer_wizard.ps1') '%WIZ_SCRIPT%' -Force"
)

if not exist "%WIZ_SCRIPT%" (
    if exist "%TARGET_DIR%\scripts\installer_wizard.ps1" (
        copy /y "%TARGET_DIR%\scripts\installer_wizard.ps1" "%WIZ_SCRIPT%" >nul
    )
)

if not exist "%WIZ_SCRIPT%" (
    echo.
    echo ======================================================================
    echo [X] Error: Setup Wizard download nahi ho paya.
    echo     Kripya Internet / Mobile Hotspot check karein.
    echo ======================================================================
    echo.
    pause
    exit /b 1
)

echo.
echo ======================================================================
echo   [3/3] Launching Graphical Setup ^& Health Wizard (Clean Reset)...
echo ======================================================================
echo.

set "CLEAN_INSTALL=1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%WIZ_SCRIPT%" -ProjectDir "%TARGET_DIR%" -Clean
set "EXIT_CODE=%errorlevel%"

echo.
echo ======================================================================
echo   Clean Re-installation Process Completed (Code: %EXIT_CODE%)
echo   Log File: %TARGET_DIR%\logs\install_wizard.log
echo.
echo   Window band karne ke liye koi bhi key dabayein...
echo ======================================================================
pause
exit /b %EXIT_CODE%
