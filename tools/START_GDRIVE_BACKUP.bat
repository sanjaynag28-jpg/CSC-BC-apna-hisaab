@echo off
title CMBC Google Drive Auto-Backup
cd /d "%~dp0.."
echo ============================================
echo   CMBC Google Drive Auto-Backup Watcher
echo   (band karne liye ye window close karo)
echo ============================================
node scripts\gdrive_backup.js watch
pause
