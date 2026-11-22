@echo off
title Cash Management - Reset to Fresh Database
color 0C
cd /d "%~dp0.."
echo ========================================================
echo   SAFE ABORT - DATABASE RESET NOT PERFORMED
echo ========================================================
echo.
echo WARNING: No reset was performed. This command is intentionally disabled
echo to prevent data loss or mixing with another database.
echo.
echo Use a verified backup and a manually reviewed, database-specific safe
echo recovery process instead. Do not run a destructive reset on production data.
echo.
pause
exit /b 1
