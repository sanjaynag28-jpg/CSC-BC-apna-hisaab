@echo off
setlocal EnableExtensions
title CSC ^& BC Apna Hisaab - Dynamic Clean Re-Installer
color 0B

:: ====================================================================
:: [Auto-Updater] Check if a newer version of this launcher exists online
:: ====================================================================
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" ^
  "$curr = '%~f0';" ^
  "$tempBat = Join-Path $env:TEMP ('cmbc_chk_' + (Get-Random) + '.bat');" ^
  "$urls = @(" ^
  "  'https://raw.githubusercontent.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/main/CLEAN_FRESH_INSTALL.bat'," ^
  "  'https://github.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/raw/main/CLEAN_FRESH_INSTALL.bat'," ^
  "  'https://github.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/releases/latest/download/CLEAN_FRESH_INSTALL.bat'" ^
  ");" ^
  "foreach($u in $urls){" ^
  "  try {" ^
  "    Invoke-WebRequest -Uri ($u + '?t=' + [DateTime]::UtcNow.Ticks) -OutFile $tempBat -UseBasicParsing -TimeoutSec 6;" ^
  "    if ((Test-Path $tempBat) -and (Get-Item $tempBat).Length -gt 500) {" ^
  "      $cHash = (Get-FileHash -Path $curr -Algorithm MD5).Hash;" ^
  "      $nHash = (Get-FileHash -Path $tempBat -Algorithm MD5).Hash;" ^
  "      if ($cHash -ne $nHash) {" ^
  "        Write-Host '  [OK] Naya re-installer version online mila! Updating launcher...' -ForegroundColor Green;" ^
  "        Copy-Item $tempBat $curr -Force;" ^
  "        Remove-Item $tempBat -Force -ErrorAction SilentlyContinue;" ^
  "        Start-Process -FilePath $curr; exit 99;" ^
  "      }" ^
  "      Remove-Item $tempBat -Force -ErrorAction SilentlyContinue;" ^
  "      break;" ^
  "    }" ^
  "  } catch { }" ^
  "};"
if %errorlevel% equ 99 exit /b 0

:: ====================================================================
:: Auto-elevate to Administrator (safe for paths with spaces)
:: ====================================================================
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [..] Requesting Administrator permission for Clean Re-installation...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

set "TARGET_DIR=%USERPROFILE%\CSC-BC-Apna-Hisaab"
set "TEMP_WIZ=%TEMP%\cmbc_installer_wizard.ps1"

cls
echo ======================================================================
echo   CSC ^& BC APNA HISAAB - 100%% CLEAN FRESH RE-INSTALLER
echo ======================================================================
echo.
echo   Yeh tool purane / adhoore installation folder ko saaf karke
echo   100%% naye sire se fresh installation shuru karega.
echo.
echo   Target Folder : %TARGET_DIR%
echo   Logs Location : %TARGET_DIR%\logs\install_wizard.log
echo.
echo ======================================================================
echo.
echo Press any key to start Clean Re-installation...
pause >nul

echo.
echo ======================================================================
echo   [1/3] Purane adhoore files aur temp cache saaf kiye ja rahe hain...
echo ======================================================================
echo.

if exist "%TARGET_DIR%" (
    echo   [..] Deleting old project folder: %TARGET_DIR%...
    rd /s /q "%TARGET_DIR%" >nul 2>&1
)
mkdir "%TARGET_DIR%" >nul 2>&1
del /f /q "%TEMP%\cmbc_*" >nul 2>&1
echo   [OK] Purana adhoora folder saaf ho gaya.

echo.
echo ======================================================================
echo   [2/3] Latest Setup Engine download ho raha hai...
echo ======================================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $p='%TEMP_WIZ%'; $urls=@(('https://cdn.jsdelivr.net/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab@main/scripts/installer_wizard.ps1?t=' + [DateTime]::UtcNow.Ticks),('https://raw.githubusercontent.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/main/scripts/installer_wizard.ps1?t=' + [DateTime]::UtcNow.Ticks)); $ok=$false; foreach($u in $urls){ try { Write-Host ('  [..] Connecting to ' + ([Uri]$u).Host + '...') -ForegroundColor Yellow; Invoke-WebRequest -Uri $u -OutFile $p -UseBasicParsing -TimeoutSec 15; if((Test-Path $p) -and (Get-Item $p).Length -gt 5000){ $ok=$true; Write-Host '  [OK] Setup Engine loaded!' -ForegroundColor Green; break } } catch { Write-Host ('  [!] Notice: ' + $_.Exception.Message) -ForegroundColor Gray } }; if(-not $ok){ exit 1 }"

if errorlevel 1 (
    echo.
    echo [!] Direct script blocked. Downloading full package archive from GitHub...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $z=Join-Path $env:TEMP 'cmbc_repo.zip'; Invoke-WebRequest -Uri 'https://github.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/archive/refs/heads/main.zip' -OutFile $z -UseBasicParsing -TimeoutSec 90; $e=Join-Path $env:TEMP ('cmbc_e_' + (Get-Random)); Expand-Archive -LiteralPath $z -DestinationPath $e -Force; $s=(Get-ChildItem -Path $e -Directory | Select-Object -First 1).FullName; robocopy $s '%TARGET_DIR%' /E /XD (Join-Path $s '.git') (Join-Path $s 'node_modules') (Join-Path $s 'backups') (Join-Path $s 'logs') /XF '.env' /NFL /NDL /NJH /NJS | Out-Null; Copy-Item (Join-Path '%TARGET_DIR%' 'scripts\installer_wizard.ps1') '%TEMP_WIZ%' -Force"
)

echo.
echo ======================================================================
echo   [3/3] Launching Graphical Setup ^& Health Wizard...
echo ======================================================================
echo.

set "FINAL_WIZ=%TEMP_WIZ%"
if not exist "%FINAL_WIZ%" (
    if exist "%TARGET_DIR%\scripts\installer_wizard.ps1" (
        set "FINAL_WIZ=%TARGET_DIR%\scripts\installer_wizard.ps1"
    )
)

if not exist "%FINAL_WIZ%" (
    echo [X] Error: Setup Wizard download nahi ho paya.
    echo     Kripya Internet / Mobile Hotspot check karein.
    echo.
    pause
    exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%FINAL_WIZ%" -ProjectDir "%TARGET_DIR%"
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
