@echo off
title Cash Management - Database Backup
color 0A
cd /d "%~dp0"
echo ========================================================
echo    Cash Management System - 1-Click Database Backup
echo ========================================================
echo.
node database/backup-runner.js
echo.
pause