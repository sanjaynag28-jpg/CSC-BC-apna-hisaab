@echo off
title Cash Management - Database Restore
color 0C
cd /d "%~dp0.."
echo ========================================================
echo    Cash Management System - Database Restore Utility
echo ========================================================
echo.
node database/restore-runner.js
echo.
pause
