@echo off
title Cash Management - Mobile / LAN Access Link
cls
echo ========================================================
echo   CASH MANAGEMENT - MOBILE / OTHER PC ACCESS
echo ========================================================
echo.
echo Make sure your Mobile and this PC are on the SAME Wi-Fi!
echo.
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address" /c:"IPv4-Adresse"') do (
    for /f "tokens=1" %%b in ("%%a") do (
        echo   [+] Mobile ya Doosre PC me ye URL kholein:
        echo       http://%%b:3000
        echo.
    )
)
echo ========================================================
echo Press any key to close this window...
pause >nul
