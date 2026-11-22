@echo off
title Cash Management - Full Project & Database Backup for Google Drive
color 0B
cd /d "%~dp0.."
node scripts/create_project_zip.js
pause

