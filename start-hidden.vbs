' CSC & BC Apna Hisaab - silent server launcher
' Koi console window nahi khulegi. Supervisor background me chalta rahega.
Option Explicit
Dim fso, sh, baseDir
Set fso = CreateObject("Scripting.FileSystemObject")
baseDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = baseDir
sh.Run "cmd /c """ & baseDir & "\server-supervisor.bat""", 0, False
