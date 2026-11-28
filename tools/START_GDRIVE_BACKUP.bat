@echo off
title CMBC Google Drive Auto-Backup
cd /d "%~dp0.."
echo ============================================
echo   CMBC Google Drive Auto-Backup Watcher
echo   (band karne liye ye window close karo)
echo ============================================
if exist "scripts\gdrive_backup.js" (
    node scripts\gdrive_backup.js watch
) else (
    echo [INFO] scripts\gdrive_backup.js unavailable — running local backup instead.
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0auto_backup_local.ps1"
)
pause
