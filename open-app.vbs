' CSC & BC Apna Hisaab - open app silently
' Server band ho to background me start karta hai, phir browser kholta hai.
Option Explicit
Dim fso, sh, baseDir, rc
Set fso = CreateObject("Scripting.FileSystemObject")
baseDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = baseDir

rc = sh.Run("cmd /c netstat -ano | findstr /R /C:"":3000 .*LISTENING"" >nul 2>&1", 0, True)
If rc <> 0 Then
    sh.Run "cmd /c """ & baseDir & "\server-supervisor.bat""", 0, False
    WScript.Sleep 2500
End If

sh.Run "http://localhost:3000", 1, False
