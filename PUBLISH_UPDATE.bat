@echo off
setlocal enabledelayedexpansion
title Publish Update to GitHub - CSC & BC Apna Hisaab
cd /d "%~dp0"

set "GIT_EXE=git"
where git >nul 2>&1
if %errorlevel% neq 0 (
    if exist "C:\Program Files\Git\bin\git.exe" (
        set "GIT_EXE=C:\Program Files\Git\bin\git.exe"
    ) else (
        echo [!] Git not found! Please install Git from https://git-scm.com/
        pause
        exit /b 1
    )
)

echo ============================================================
echo   PUBLISH NEW UPDATE TO GITHUB (SAFE CODE-ONLY RELEASE)
echo ============================================================
echo.

:: Step 1: Run 13/13 integrity verification suite
echo [1/4] Running 13/13 Verification Suite (npm run verify)...
call npm run verify
if %errorlevel% neq 0 (
    echo.
    echo [!] Verification FAILED! Update publish aborted to protect users.
    pause
    exit /b 1
)

:: Step 2: Prompt for release note & bump patch version
echo.
set /p "REL_NOTES=Release note likhein (Enter for default): "
if "%REL_NOTES%"=="" set "REL_NOTES=Bug fixes and performance improvements"

echo [2/4] Bumping version in version.json & package.json...
node -e "const fs=require('fs'); const v=JSON.parse(fs.readFileSync('version.json','utf8')); const p=v.version.split('.').map(Number); p[2]=(p[2]||0)+1; v.version=p.join('.'); v.releasedAt=new Date().toISOString().slice(0,10); v.notes=process.argv[1]; fs.writeFileSync('version.json', JSON.stringify(v,null,2)+'\n'); const pkg=JSON.parse(fs.readFileSync('package.json','utf8')); pkg.version=v.version; fs.writeFileSync('package.json', JSON.stringify(pkg,null,2)+'\n'); console.log('New Version:', v.version);" "%REL_NOTES%"

:: Step 3: Stage & verify NO personal data / secrets are staged
echo [3/4] Checking staged files (Zero Data Leak Audit)...
"%GIT_EXE%" add -A
"%GIT_EXE%" diff --cached --name-only | findstr /I /R "\.env$ \.mdf$ \.ldf$ \.bak$ ^backups/ ^public/uploads/ ^database/data/" >nul 2>&1
if %errorlevel% equ 0 (
    echo [!] DANGER: Sensitive data file detected in git staging! Aborting!
    "%GIT_EXE%" reset
    pause
    exit /b 1
)

for /f "delims=" %%V in ('node -e "console.log(require('./version.json').version)"') do set "NEW_VER=%%V"

:: Step 4: Commit & Push to GitHub
echo [4/4] Pushing v%NEW_VER% to GitHub...
"%GIT_EXE%" commit -m "Release v%NEW_VER%: %REL_NOTES%"
"%GIT_EXE%" push origin main
if %errorlevel% neq 0 (
    echo.
    echo [!] Git push failed! Check internet or GitHub login.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   SUCCESS! v%NEW_VER% published to GitHub!
echo   Sabhi users ko agle app open par automatic silent update mil jayega.
echo ============================================================
pause
