@echo off
title CSC & BC Apna Hisaab - One Click Setup
cd /d "%~dp0"

echo ============================================
echo   CSC ^& BC Apna Hisaab - One Click Setup
echo ============================================
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Node.js not found. Opening download page...
    start https://nodejs.org/en/download/
    echo Please install Node.js LTS, then run this script again.
    pause
    exit /b 1
)

echo [1/5] Node.js found:
node --version

:: Create .env from .env.example if missing
if not exist ".env" (
    if exist ".env.example" (
        copy /Y ".env.example" ".env" >nul
        echo.
        echo [2/5] .env file ban gayi hai ^(.env.example se^).
        echo       Kripya .env file mein apna SQL Server DB_SERVER aur DB_PASSWORD check/set karein!
        notepad ".env"
    )
) else (
    echo [2/5] .env file already exists.
)

echo.
echo [3/5] Installing dependencies (npm install)...
call npm install
if %errorlevel% neq 0 (
    echo [!] npm install failed. Check internet connection.
    pause
    exit /b 1
)

echo.
echo [4/5] Setting up database...
node setup-database.js
if %errorlevel% neq 0 (
    echo [!] Database setup failed. Ensure SQL Server is running and .env is configured.
    pause
    exit /b 1
)

echo.
echo [5/5] Starting server...
start "" cmd /c "node server.js"
timeout /t 4 /nobreak >nul
start http://localhost:3000

echo.
echo ============================================
echo   Setup complete! Browser opened.
echo   Server running at http://localhost:3000
echo ============================================
pause
