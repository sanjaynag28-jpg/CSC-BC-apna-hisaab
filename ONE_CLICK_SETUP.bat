@echo off
cd /d "%~dp0"
call "%~dp0INSTALL_NOW.bat"
exit /b %errorlevel%
