@echo off
setlocal EnableExtensions
title CSC ^& BC Apna Hisaab - Sync SQLite (4000) to SQL Server (3000)
color 0B
cd /d "%~dp0"

echo ======================================================================
echo    CSC ^& BC Apna Hisaab - Bi-Directional Safe Sync
echo    Syncing: SQLite (Port 4000) ---^> SQL Server (Port 3000)
echo ======================================================================
echo.

node "%~dp0scripts\sync_delta_sqlite_to_sqlserver.js"

echo.
echo ======================================================================
pause
