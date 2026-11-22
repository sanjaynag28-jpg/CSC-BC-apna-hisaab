@echo off
setlocal enabledelayedexpansion
title Publish Update to GitHub - CSC & BC Apna Hisaab
cd /d "%~dp0.."

set "GIT_EXE=git"
where git >nul 2>&1
if %errorlevel% neq 0 (
    if exist "C:\Program Files\Git\bin\git.exe" (
        set "GIT_EXE=C:\Program Files\Git\bin\git.exe"
    ) else (
        echo [ERR] Git not found - please install Git from https://git-scm.com/
        pause
        exit /b 1
    )
)

echo ============================================================
echo   PUBLISH NEW UPDATE TO GITHUB (FULLY AUTOMATIC)
echo   verify -^> version bump -^> leak audit -^> push -^> release
echo ============================================================
echo.

:: Optional: note argument (na dein to auto note ban jayega)
set "REL_NOTES=%~1"

:: Step 0: Koi change hai ya nahi
"%GIT_EXE%" status --porcelain > "%TEMP%\cmbc_changes.tmp" 2>nul
for /f "delims=" %%L in ("%TEMP%\cmbc_changes.tmp") do set "HAS_CHANGES=1"
del "%TEMP%\cmbc_changes.tmp" >nul 2>&1
if not defined HAS_CHANGES (
    echo [INFO] Koi code change nahi mila - publish karne ki zaroorat nahi.
    echo     Code change karke PUBLISH_UPDATE.bat dobara chalayein.
    pause
    exit /b 0
)

:: Step 1: 13/13 integrity verification suite
echo [1/5] Running 13/13 Verification Suite (npm run verify)...
call npm run verify
if %errorlevel% neq 0 (
    echo.
    echo [ERR] Verification FAILED - update publish aborted to protect users.
    pause
    exit /b 1
)

:: Step 2: Auto release note (ya argument) + version bump (koi typing nahi)
echo.
echo [2/5] Release note + version bump...
if not defined REL_NOTES node -e "const cp=require('child_process');const fs=require('fs');const out=cp.execSync('git status --porcelain',{encoding:'utf8'});const files=out.split(/\r?\n/).filter(l=>l.trim()).map(l=>l.slice(3).trim());const areas=[...new Set(files.map(f=>f.split('/')[0]))];const note=('Auto update: '+files.length+' file(s) changed ('+areas.slice(0,6).join(', ')+(areas.length>6?', ...':'')+')').replace(/[&|<>^']/g,'-');fs.writeFileSync('release-note.tmp',note);console.log('  Note: '+note);"
if not defined REL_NOTES if exist release-note.tmp for /f "delims=" %%N in (release-note.tmp) do set "REL_NOTES=%%N"
if exist release-note.tmp del release-note.tmp >nul 2>&1
if not defined REL_NOTES set "REL_NOTES=Automatic update release"

node -e "const fs=require('fs');const v=JSON.parse(fs.readFileSync('version.json','utf8'));const p=v.version.split('.').map(Number);p[2]=(p[2]||0)+1;v.version=p.join('.');v.releasedAt=new Date().toISOString().slice(0,10);v.notes=process.argv[1];fs.writeFileSync('version.json',JSON.stringify(v,null,2)+'\n');const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));pkg.version=v.version;fs.writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\n');try{const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));lock.version=v.version;if(lock.packages&&lock.packages['']){lock.packages[''].version=v.version;}fs.writeFileSync('package-lock.json',JSON.stringify(lock,null,2)+'\n');}catch(e){}console.log('  New version: '+v.version);" "%REL_NOTES%"

for /f "delims=" %%V in ('node -e "console.log(require('./version.json').version)"') do set "NEW_VER=%%V"

:: Step 3: Stage + zero data leak audit
echo [3/5] Staged files check (Zero Data Leak Audit)...
"%GIT_EXE%" add -A
"%GIT_EXE%" diff --cached --name-only | findstr /I /R "\.env$ \.env\. \.mdf$ \.ldf$ \.bak$ \.admin-login \.sql-server-credentials \.auto-update-tmp ^backups/ ^logs/ ^public/uploads/ ^database/data/" >nul 2>&1
if %errorlevel% equ 0 (
    echo.
    echo [ERR] DANGER: Sensitive data file staged - publish aborted.
    "%GIT_EXE%" reset >nul 2>&1
    pause
    exit /b 1
)
echo   [OK] No personal data / secrets staged.

:: Step 4: Commit + Push (auto retry 3x)
echo [4/5] Pushing v%NEW_VER% to GitHub...
"%GIT_EXE%" commit -m "Release v%NEW_VER%: %REL_NOTES%" >nul 2>&1
if %errorlevel% neq 0 "%GIT_EXE%" commit -m "Release v%NEW_VER%"

set "PUSH_OK="
for /l %%i in (1,1,3) do (
    if not defined PUSH_OK (
        echo   push attempt %%i/3...
        "%GIT_EXE%" push origin main
        if !errorlevel! equ 0 (
            set "PUSH_OK=1"
        ) else (
            timeout /t 5 /nobreak >nul
        )
    )
)
if not defined PUSH_OK (
    echo.
    echo [ERR] Push 3 attempts ke baad fail. Internet/GitHub login check karke dobara chalayein.
    pause
    exit /b 1
)

:: Step 5: GitHub Release + installer assets (auto)
echo [5/5] Creating GitHub Release ^& attaching installer...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\utils\publish_release_assets.ps1"

echo.
echo ============================================================
echo   SUCCESS - v%NEW_VER% LIVE on GitHub
echo ============================================================
echo   Installer (naye PC ke liye, direct download):
echo   https://github.com/sanjaynag28-jpg/CSC-BC-apna-hisaab/releases/download/v%NEW_VER%/SETUP.bat
echo.
echo   Purane PC: agle boot ya raat 2:30 AM par automatic silent update
echo   (data safe - .env / uploads / backups / database untouched).
echo ============================================================
pause
exit /b 0
