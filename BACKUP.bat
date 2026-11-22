@echo off
title CSC ^& BC Apna Hisaab - 1-Click Database Backup
color 0A
cd /d "%~dp0"

echo ========================================================
echo   CSC ^& BC Apna Hisaab - 1-Click Database Backup
echo ========================================================
echo.
node database/backup-runner.js
echo.
echo Backup process complete.
pause
