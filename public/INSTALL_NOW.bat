@echo off
setlocal EnableExtensions
title CSC ^& BC Apna Hisaab - Master 1-Click Installer

:: Auto-elevate to Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator permission for automatic installation...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"

:: Case 1: Running inside existing project folder
if exist "%~dp0scripts\installer_wizard.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\installer_wizard.ps1" -ProjectDir "%~dp0"
    exit /b %errorlevel%
)

:: Case 2: Standalone mode (single file on new PC)
set "TARGET_DIR=%USERPROFILE%\CSC-BC-Apna-Hisaab"
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"

cls
echo ======================================================================
echo   CSC ^& BC APNA HISAAB - 100%% AUTOMATIC 1-CLICK INSTALLER
echo ======================================================================
echo.
echo   Target Folder : %TARGET_DIR%
echo   Status        : Connecting to GitHub...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ProgressPreference = 'SilentlyContinue';" ^
  "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" ^
  "$targetDir = '%TARGET_DIR%';" ^
  "$tempWiz = Join-Path $env:TEMP 'cmbc_installer_wizard.ps1';" ^
  "$urls = @(" ^
  "  'https://cdn.jsdelivr.net/gh/sanjaynag28-jpg/CSC-BC-apna-hisaab@main/scripts/installer_wizard.ps1'," ^
  "  'https://raw.githubusercontent.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/main/scripts/installer_wizard.ps1'," ^
  "  'https://github.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/raw/main/scripts/installer_wizard.ps1'" ^
  ");" ^
  "$downloaded = $false;" ^
  "foreach($u in $urls){" ^
  "  for($i=1; $i -le 2 -and -not $downloaded; $i++){" ^
  "    try {" ^
  "      Write-Host ('  [..] Connecting to GitHub (' + ([Uri]$u).Host + ' attempt ' + $i + ')...') -ForegroundColor Yellow;" ^
  "      Invoke-WebRequest -Uri $u -OutFile $tempWiz -UseBasicParsing -TimeoutSec 12;" ^
  "      if((Test-Path $tempWiz) -and (Get-Item $tempWiz).Length -gt 5000){" ^
  "        $downloaded = $true;" ^
  "        Write-Host '  [OK] GUI Setup Wizard loaded successfully!' -ForegroundColor Green;" ^
  "        break;" ^
  "      }" ^
  "    } catch { Write-Host ('  [!] Server notice: ' + $_.Exception.Message) -ForegroundColor Gray; Start-Sleep -Seconds 1 }" ^
  "  }" ^
  "};" ^
  "if($downloaded){" ^
  "  & $tempWiz -ProjectDir $targetDir;" ^
  "  exit $LASTEXITCODE;" ^
  "}" ^
  "Write-Host '  [!] Direct script blocked by ISP. Downloading full package from GitHub...' -ForegroundColor Yellow;" ^
  "$zipUrl = 'https://github.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/archive/refs/heads/main.zip';" ^
  "$zipFile = Join-Path $env:TEMP 'cmbc_archive.zip';" ^
  "try {" ^
  "  Invoke-WebRequest -Uri $zipUrl -OutFile $zipFile -UseBasicParsing -TimeoutSec 90;" ^
  "  $extDir = Join-Path $env:TEMP ('cmbc_ext_' + (Get-Random));" ^
  "  Expand-Archive -LiteralPath $zipFile -DestinationPath $extDir -Force;" ^
  "  $src = (Get-ChildItem -Path $extDir -Directory | Select-Object -First 1).FullName;" ^
  "  robocopy $src $targetDir /E /XD (Join-Path $src '.git') (Join-Path $src 'node_modules') (Join-Path $src 'backups') (Join-Path $src 'logs') /XF '.env' /NFL /NDL /NJH /NJS | Out-Null;" ^
  "  $localWiz = Join-Path $targetDir 'scripts\installer_wizard.ps1';" ^
  "  if(Test-Path $localWiz){ & $localWiz -ProjectDir $targetDir; exit 0 }" ^
  "} catch { Write-Host ('  [X] Error: ' + $_.Exception.Message) -ForegroundColor Red; }" ^
  "exit 1"

if errorlevel 1 (
    echo.
    echo [X] Internet timeout: ISP ne GitHub download block kiya hua hai.
    echo     Kripya phone ke hotspot se connect karein ya Pendrive se install karein.
    pause
    exit /b 1
)
exit /b 0
