@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul 2>&1
title CSC ^& BC Apna Hisaab - Cloudflare Worker + D1 Setup
color 0B
cd /d "%~dp0"

echo ========================================================================
echo   CLOUDFLARE WORKER + D1 DATABASE SETUP (100%% FREE FLEET MONITOR)
echo ========================================================================
echo.
echo Ye script aapke free Cloudflare account par:
echo   1. D1 SQLite Database ("cmbc-fleet-db") banayegi
echo   2. Tables aur indexes create karegi (schema.sql)
echo   3. Secure INGEST_TOKEN (PCs write-only) aur ADMIN_KEY (Aapka master password) set karegi
echo   4. Cloudflare Worker deploy karegi aur live URL degi
echo.

where npx >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js / npx nahi mila. Pehle Node.js install karein.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [1/6] Installing wrangler CLI locally...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo [ERROR] npm install fail hua.
        pause
        exit /b 1
    )
)

echo.
echo [2/6] Cloudflare login check / browser login...
call npx wrangler whoami >nul 2>&1
if errorlevel 1 (
    echo Browser khulega — apne free Cloudflare account se Allow dabayein...
    call npx wrangler login
    if errorlevel 1 (
        echo [ERROR] Cloudflare login nahi ho paya.
        pause
        exit /b 1
    )
)

echo.
echo [3/6] Creating Cloudflare D1 database "cmbc-fleet-db"...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$out = (& npx wrangler d1 create cmbc-fleet-db 2>&1) -join \"`n\";" ^
  "Write-Host $out;" ^
  "if ($out -match 'database_id\s*=\s*\"([a-f0-9-]+)\"') {" ^
  "  $id = $Matches[1];" ^
  "  $toml = Get-Content -LiteralPath 'wrangler.toml' -Raw;" ^
  "  $toml = [regex]::Replace($toml, 'database_id\s*=\s*\"[^\"]+\"', ('database_id = \"' + $id + '\"'));" ^
  "  [System.IO.File]::WriteAllText((Join-Path (Get-Location) 'wrangler.toml'), $toml, (New-Object System.Text.UTF8Encoding($false)));" ^
  "  Write-Host ('[OK] database_id saved in wrangler.toml: ' + $id) -ForegroundColor Green;" ^
  "} else {" ^
  "  $list = (& npx wrangler d1 info cmbc-fleet-db 2>&1) -join \"`n\";" ^
  "  if ($list -match '([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})') {" ^
  "    $id = $Matches[1];" ^
  "    $toml = Get-Content -LiteralPath 'wrangler.toml' -Raw;" ^
  "    $toml = [regex]::Replace($toml, 'database_id\s*=\s*\"[^\"]+\"', ('database_id = \"' + $id + '\"'));" ^
  "    [System.IO.File]::WriteAllText((Join-Path (Get-Location) 'wrangler.toml'), $toml, (New-Object System.Text.UTF8Encoding($false)));" ^
  "    Write-Host ('[OK] Existing database_id linked: ' + $id) -ForegroundColor Green;" ^
  "  }" ^
  "}"

echo.
echo [4/6] Applying schema.sql to Cloudflare D1...
call npx wrangler d1 execute cmbc-fleet-db --remote --file=./schema.sql --yes
if errorlevel 1 (
    echo [ERROR] D1 schema execution failed!
    pause
    exit /b 1
)

echo.
echo [5/6] Generating & setting INGEST_TOKEN and ADMIN_KEY secrets...
for /f "delims=" %%I in ('node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"') do set "ING_TOK=%%I"
set /p ADM_KEY="Apna Master Admin Key likhein (ya Enter dabayein auto-generate ke liye): "
if "%ADM_KEY%"=="" (
    for /f "delims=" %%A in ('node -e "console.log('ADM-'+require('crypto').randomBytes(16).toString('hex'))"') do set "ADM_KEY=%%A"
)

node -e "const cp=require('child_process');cp.execSync('npx wrangler secret put INGEST_TOKEN',{input:process.env.ING_TOK,stdio:['pipe','inherit','inherit'],shell:true});cp.execSync('npx wrangler secret put ADMIN_KEY',{input:process.env.ADM_KEY,stdio:['pipe','inherit','inherit'],shell:true});"
if errorlevel 1 (
    echo [ERROR] Cloudflare secret upload failed!
    pause
    exit /b 1
)

echo.
echo [6/6] Deploying Worker to Cloudflare...
call npx wrangler deploy
if errorlevel 1 (
    echo [ERROR] Cloudflare Worker deployment failed!
    pause
    exit /b 1
)

echo.
echo ========================================================================
echo   SETUP COMPLETE! Niche diye gaye keys sambhal kar rakhein:
echo   INGEST_TOKEN : "%ING_TOK%"
echo   ADMIN_KEY    : "%ADM_KEY%"
echo ========================================================================
echo.
echo Agla step: Apne App ke Settings -> All PCs Monitor tab me Worker URL,
echo INGEST_TOKEN aur ADMIN_KEY save karein.
pause
