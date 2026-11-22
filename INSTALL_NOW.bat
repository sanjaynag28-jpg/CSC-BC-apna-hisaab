@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
title CSC ^& BC Apna Hisaab - 100%% Dynamic 1-Click Installer
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

:: Kill old lingering processes upfront
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM wscript.exe >nul 2>&1

:: ====================================================================
:: 2. Network Check & Interactive Retry (Internet / Wi-Fi disconnected guard)
:: ====================================================================
:check_net
ipconfig /flushdns >nul 2>&1
ping -n 1 -w 1500 8.8.8.8 >nul 2>&1
if errorlevel 1 (
    ping -n 1 -w 1500 1.1.1.1 >nul 2>&1
)
if errorlevel 1 (
    cls
    echo ======================================================================
    echo   CSC ^& BC APNA HISAAB - 100%% AUTOMATIC 1-CLICK INSTALLER
    echo ======================================================================
    echo.
    echo   [!] INTERNET / WI-FI DISCONNECTED DETECTED
    echo.
    echo   Aapke is computer par Internet / Wi-Fi band ya disconnected hai.
    echo.
    echo   1. Kripya apna Wi-Fi ya Mobile Hotspot connect karein.
    echo   2. Hotspot / Wi-Fi connect karne ke baad koi bhi key dabayein...
    echo.
    echo ======================================================================
    pause >nul
    goto check_net
)

:: ====================================================================
:: 3. Dynamic Online Self-Update (Safe single-line, zero caret bug)
:: ====================================================================
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $c='%~f0'; $t=Join-Path $env:TEMP ('cmbc_chk_' + (Get-Random) + '.bat'); $urls=@('https://raw.githubusercontent.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/main/INSTALL_NOW.bat','https://cdn.jsdelivr.net/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab@main/INSTALL_NOW.bat','https://fastly.jsdelivr.net/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab@main/INSTALL_NOW.bat'); foreach($u in $urls){ try { Invoke-WebRequest -Uri ($u + '?t=' + [DateTime]::UtcNow.Ticks) -OutFile $t -UseBasicParsing -TimeoutSec 6; if((Test-Path $t) -and (Get-Item $t).Length -gt 500){ if((Get-FileHash -Path $c -Algorithm MD5).Hash -ne (Get-FileHash -Path $t -Algorithm MD5).Hash){ Write-Host '  [OK] Naya launcher version online mila! Updating launcher...' -ForegroundColor Green; Copy-Item $t $c -Force; Remove-Item $t -Force -ErrorAction SilentlyContinue; Start-Process -FilePath $c; exit 99 } break } } catch { } }; Remove-Item $t -Force -ErrorAction SilentlyContinue"
if errorlevel 99 exit /b 0

:: Case 1: Running inside existing project folder
if exist "%~dp0scripts\installer_wizard.ps1" (
    echo ======================================================================
    echo   CSC ^& BC APNA HISAAB - SETUP ^& HEALTH ENGINE
    echo ======================================================================
    echo.
    echo   [..] Checking for latest Setup Engine updates...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; try { Invoke-WebRequest -Uri ('https://raw.githubusercontent.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/main/scripts/installer_wizard.ps1?t=' + [DateTime]::UtcNow.Ticks) -OutFile '%~dp0scripts\installer_wizard.ps1' -UseBasicParsing -TimeoutSec 10 } catch { }"
    
    echo   [..] Launching Graphical Setup Wizard...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\installer_wizard.ps1" -ProjectDir "%~dp0"
    set "EXIT_CODE=%errorlevel%"
    
    echo.
    echo ======================================================================
    echo   Setup complete (Code: %EXIT_CODE%).
    echo   Log File: %~dp0logs\install_wizard.log
    echo.
    echo   Window band karne ke liye koi bhi key dabayein...
    echo ======================================================================
    pause
    exit /b %EXIT_CODE%
)

:: Case 2: Standalone mode (single file on new / incomplete PC)
set "TARGET_DIR=%USERPROFILE%\CSC-BC-Apna-Hisaab"
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"
set "WIZ_SCRIPT=%TEMP%\cmbc_installer_wizard.ps1"

cls
echo ======================================================================
echo   CSC ^& BC APNA HISAAB - 100%% AUTOMATIC 1-CLICK INSTALLER
echo ======================================================================
echo.
echo   Target Folder : %TARGET_DIR%
echo   Status        : Connecting to CDN / GitHub...
echo.

echo [1/3] Downloading Latest Setup Engine...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $dst='%WIZ_SCRIPT%'; $urls=@('https://raw.githubusercontent.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/main/scripts/installer_wizard.ps1','https://cdn.jsdelivr.net/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab@main/scripts/installer_wizard.ps1','https://fastly.jsdelivr.net/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab@main/scripts/installer_wizard.ps1','https://gcore.jsdelivr.net/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab@main/scripts/installer_wizard.ps1','https://raw.githack.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/main/scripts/installer_wizard.ps1','https://github.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/raw/main/scripts/installer_wizard.ps1'); $ok=$false; foreach($u in $urls){ try { Write-Host ('  [..] Connecting to ' + ([Uri]$u).Host + '...') -ForegroundColor Yellow; Invoke-WebRequest -Uri ($u + '?t=' + [DateTime]::UtcNow.Ticks) -OutFile $dst -UseBasicParsing -TimeoutSec 15; if((Test-Path $dst) -and (Get-Item $dst).Length -gt 5000){ $ok=$true; Write-Host '  [OK] Setup Engine loaded!' -ForegroundColor Green; break } } catch { Write-Host ('  [!] Notice: ' + $_.Exception.Message) -ForegroundColor Gray } }; if(-not $ok){ exit 1 }"

if errorlevel 1 (
    echo.
    echo [!] Direct script blocked. Downloading full package archive from GitHub...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $dst='%WIZ_SCRIPT%'; try { $z=Join-Path $env:TEMP 'cmbc_repo.zip'; Invoke-WebRequest -Uri 'https://github.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/archive/refs/heads/main.zip' -OutFile $z -UseBasicParsing -TimeoutSec 90; if(Test-Path $z){ $e=Join-Path $env:TEMP ('cmbc_e_' + (Get-Random)); Expand-Archive -LiteralPath $z -DestinationPath $e -Force; $s=(Get-ChildItem -Path $e -Directory | Select-Object -First 1).FullName; if($s -and (Test-Path (Join-Path $s 'scripts\installer_wizard.ps1'))){ Copy-Item (Join-Path $s 'scripts\installer_wizard.ps1') $dst -Force } } } catch { Write-Host ('  [!] Archive error: ' + $_.Exception.Message) -ForegroundColor Gray }"
)

if not exist "%WIZ_SCRIPT%" (
    if exist "%TARGET_DIR%\scripts\installer_wizard.ps1" (
        copy /y "%TARGET_DIR%\scripts\installer_wizard.ps1" "%WIZ_SCRIPT%" >nul
    ) else if exist "%~dp0scripts\installer_wizard.ps1" (
        copy /y "%~dp0scripts\installer_wizard.ps1" "%WIZ_SCRIPT%" >nul
    )
)

if not exist "%WIZ_SCRIPT%" (
    echo.
    echo ======================================================================
    echo [X] Error: Setup Wizard download nahi ho paya.
    echo.
    echo     Aapka Internet / Hotspot connect nahi ho pa raha hai.
    echo     Kripya Wi-Fi / Hotspot check karke dobara double click karein.
    echo ======================================================================
    echo.
    pause
    exit /b 1
)

echo.
echo ======================================================================
echo   [2/3] Launching Graphical Setup ^& Health Wizard...
echo ======================================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%WIZ_SCRIPT%" -ProjectDir "%TARGET_DIR%"
set "EXIT_CODE=%errorlevel%"

echo.
echo ======================================================================
echo   Installation Process Completed (Code: %EXIT_CODE%)
echo   Log File: %TARGET_DIR%\logs\install_wizard.log
echo.
echo   Window band karne ke liye koi bhi key dabayein...
echo ======================================================================
pause
exit /b %EXIT_CODE%
