@echo off
title HisaabBC - Master License and Cloud Control Wizard
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\license_control_wizard.ps1"
exit /b 0
