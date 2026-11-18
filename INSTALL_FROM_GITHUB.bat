@echo off
setlocal EnableExtensions
title CSC ^& BC Apna Hisaab - Smart 1-Click Installer
:: ============================================================================
:: SMART 1-CLICK INSTALLER (self-healing)
::   - Network fail  -> auto retry (6 attempts, backoff)
::   - Corrupt/miss  -> fresh copy download (repair mode)
::   - Setup fail    -> automatic second attempt
::   - Install dir   -> %USERPROFILE%\CSC-BC-Apna-Hisaab
::   - Data safe     -> .env / uploads / backups / database never overwritten
:: ============================================================================

set "REPO_RAW=https://raw.githubusercontent.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/main"
set "INSTALL_DIR=%USERPROFILE%\CSC-BC-Apna-Hisaab"
set "BOOTSTRAP=%TEMP%\cmbc_install_bootstrap.ps1"

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator permission for automatic installation...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo ============================================================
echo   CSC ^& BC APNA HISAAB - SMART 1-CLICK INSTALLER
echo   (auto-retry + resume + corrupt-file repair)
echo ============================================================
echo.
echo   Install folder: %INSTALL_DIR%
echo.

echo [1/3] Installer engine download (auto-retry)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; $u='%REPO_RAW%/utils/install_bootstrap.ps1'; $o='%BOOTSTRAP%'; for($i=1;$i -le 6;$i++){ try { [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; if(Test-Path $o){ Remove-Item $o -Force }; Invoke-WebRequest -Uri $u -OutFile $o -UseBasicParsing -TimeoutSec 90; if((Test-Path $o) -and (Get-Item $o).Length -gt 2000){ exit 0 } } catch { }; Start-Sleep -Seconds (2*$i) }; exit 1"

if errorlevel 1 goto FALLBACK
if not exist "%BOOTSTRAP%" goto FALLBACK

echo [2/3] Smart install running (Node.js + SQL Server + Database + Auto-Start)...
echo       (net slow ho to bhi rukna nahi - khud retry hota rahega)
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%BOOTSTRAP%" -InstallDir "%INSTALL_DIR%"
set "RC=%errorlevel%"

if "%RC%"=="0" goto DONE

echo.
echo [!] Pehli koshish me rukawat aayi (code %RC%). Automatic retry round 2...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%BOOTSTRAP%" -InstallDir "%INSTALL_DIR%"
if errorlevel 1 goto FALLBACK
goto DONE

:FALLBACK
echo.
echo [2/3] Fallback mode: direct GitHub ZIP download with retry + repair...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;" ^
  "$zipUrl='https://github.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/archive/refs/heads/main.zip';" ^
  "$installDir='%INSTALL_DIR%';" ^
  "$tmp=Join-Path $env:TEMP ('cmbc_fb_' + (Get-Random));" ^
  "New-Item -ItemType Directory -Force -Path $tmp | Out-Null;" ^
  "$zip=Join-Path $tmp 'app.zip';" ^
  "$ok=$false;" ^
  "for($round=1;$round -le 4 -and -not $ok;$round++){ for($i=1;$i -le 5;$i++){ try { if(Test-Path $zip){Remove-Item $zip -Force}; Invoke-WebRequest -Uri $zipUrl -OutFile $zip -UseBasicParsing -TimeoutSec 300; Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[System.IO.Compression.ZipFile]::OpenRead($zip); $n=$z.Entries.Count; $z.Dispose(); if($n -gt 20){ $ok=$true; break } } catch { Start-Sleep -Seconds (3*$i) } } };" ^
  "if(-not $ok){ throw 'Download 4 rounds ke baad bhi fail/corrupt - internet check karein.' };" ^
  "$ext=Join-Path $tmp 'ext'; if(Test-Path $ext){Remove-Item $ext -Recurse -Force};" ^
  "Expand-Archive -LiteralPath $zip -DestinationPath $ext -Force;" ^
  "$src=(Get-ChildItem -Path $ext -Directory | Select-Object -First 1).FullName;" ^
  "New-Item -ItemType Directory -Force -Path $installDir | Out-Null;" ^
  "& robocopy.exe $src $installDir /E /XD (Join-Path $src '.git') (Join-Path $src 'node_modules') (Join-Path $src 'backups') (Join-Path $src 'logs') (Join-Path $src '.auto-update-tmp') (Join-Path $src '.previous-release') (Join-Path $src '.antigravity') (Join-Path $src 'bin') (Join-Path $src 'database\data') (Join-Path $src 'public\uploads') /XF '.env' /R:3 /W:2 /NFL /NDL /NJH /NJS | Out-Null;" ^
  "if($LASTEXITCODE -ge 8){ throw ('File copy failed (robocopy code ' + $LASTEXITCODE + ')') };" ^
  "Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue;" ^
  "Write-Host '  [OK] Project files ready (fresh + verified)' -ForegroundColor Green"

if errorlevel 1 (
    echo.
    echo [X] Project download fail ho gaya. Internet connection check karke isi file ko dobara chalayein.
    echo     Retry automatic hai - bas double-click karein.
    pause
    exit /b 1
)

echo.
echo [3/3] Running complete setup (auto-retry if any step fails)...
cd /d "%INSTALL_DIR%"
call "%INSTALL_DIR%\ONE_CLICK_SETUP.bat"
if errorlevel 1 (
    echo.
    echo [!] Setup me rukawat - automatic second attempt...
    call "%INSTALL_DIR%\ONE_CLICK_SETUP.bat"
    if errorlevel 1 (
        echo.
        echo [X] Setup fail. Log: "%INSTALL_DIR%\logs\install.log"
        echo     Internet/SQL check karke SETUP.bat dobara chalayein (data safe rahega).
        pause
        exit /b 1
    )
)

:DONE
echo.
echo ============================================================
echo   INSTALL COMPLETE - SAB KUCH AUTOMATIC
echo ============================================================
echo   App:        http://localhost:3000
echo   Folder:     %INSTALL_DIR%
echo   Auto-Start: ON  (PC on hote hi server silently chalu)
echo   Auto-Update: ON (boot + raat 2:30 AM, idle par restart)
echo   Desktop:    "CSC BC Apna Hisaab" shortcut
echo ============================================================
echo.
echo   Browser khul raha hai... (agar na khule to upar wala link khol lein)
start "" "http://localhost:3000"
timeout /t 5 /nobreak >nul
exit /b 0
