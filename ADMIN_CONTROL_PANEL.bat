@echo off
title HisaabBC - Master License and Cloud Control Wizard
cd /d "%~dp0"
echo ============================================================
echo   HisaabBC - Master License and Cloud Control Wizard
echo   Opening Desktop WPF Control Panel...
echo ============================================================
powershell.exe -STA -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\license_control_wizard.ps1"
if %errorlevel% neq 0 (
    echo.
    echo ============================================================
    echo [ERROR] Wizard ko open karne me samasya aayi!
    echo Error Code: %errorlevel%
    echo ============================================================
    pause
)
