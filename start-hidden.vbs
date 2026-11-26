' CSC & BC Apna Hisaab - silent server launcher (SQLite Edition)
' Startup par pehle update/dependency repair, phir hidden supervisor.
Option Explicit
Dim fso, sh, baseDir, stopFile, nodeExe
Set fso = CreateObject("Scripting.FileSystemObject")
baseDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = baseDir

stopFile = baseDir & "\logs\.stop_supervisor"
On Error Resume Next
If fso.FileExists(stopFile) Then fso.DeleteFile stopFile, True
On Error GoTo 0

nodeExe = FindNodeExe(sh)
If nodeExe <> "" Then
    On Error Resume Next
    sh.Run "cmd.exe /c """"" & nodeExe & """ """ & baseDir & "\utils\autoUpdater.js"" --silent >nul 2>&1""", 0, True
    On Error GoTo 0
End If
sh.Run "cmd.exe /c """"" & baseDir & "\server-supervisor.bat""""", 0, False

Function FindNodeExe(shellObj)
    Dim candidates, i, p
    FindNodeExe = ""
    candidates = Array( _
        shellObj.ExpandEnvironmentStrings("%ProgramFiles%\nodejs\node.exe"), _
        shellObj.ExpandEnvironmentStrings("%LOCALAPPDATA%\Programs\nodejs\node.exe"), _
        shellObj.ExpandEnvironmentStrings("%ProgramFiles(x86)%\nodejs\node.exe"), _
        shellObj.ExpandEnvironmentStrings("%NVM_SYMLINK%\node.exe"), _
        shellObj.ExpandEnvironmentStrings("%LOCALAPPDATA%\Microsoft\WinGet\Links\node.exe"), _
        shellObj.ExpandEnvironmentStrings("%USERPROFILE%\scoop\shims\node.exe"), _
        shellObj.ExpandEnvironmentStrings("%USERPROFILE%\.volta\bin\node.exe") _
    )
    For i = 0 To UBound(candidates)
        p = candidates(i)
        If p <> "" And InStr(p, "%") = 0 Then
            If fso.FileExists(p) Then
                FindNodeExe = p
                Exit Function
            End If
        End If
    Next
    FindNodeExe = "node"
End Function
