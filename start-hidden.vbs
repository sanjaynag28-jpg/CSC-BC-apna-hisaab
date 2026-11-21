' CSC & BC Apna Hisaab - silent server launcher
' Startup par pehle update/dependency repair, phir hidden supervisor.
Option Explicit
Dim fso, sh, baseDir
Set fso = CreateObject("Scripting.FileSystemObject")
baseDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = baseDir
sh.Run "cmd.exe /c node """ & baseDir & "\utils\autoUpdater.js"" --silent >nul 2>&1", 0, True
sh.Run "cmd /c """ & baseDir & "\server-supervisor.bat""", 0, False
