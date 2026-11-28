@echo off
title Cash Management - Full Project & Database Backup for Google Drive
color 0B
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0auto_backup_local.ps1"
pause

