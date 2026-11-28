' Restore npm packages on an older install where the updater cannot run npm.cmd.
Option Explicit

Dim fso, sh, baseDir, logDir, logPath, command, exitCode
Set fso = CreateObject("Scripting.FileSystemObject")
baseDir = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
logDir = fso.BuildPath(baseDir, "logs")
logPath = fso.BuildPath(logDir, "dependency-repair.log")
If Not fso.FolderExists(logDir) Then fso.CreateFolder(logDir)

Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = baseDir
command = "cmd.exe /d /c npm.cmd install --omit=dev --ignore-scripts --no-audit --no-fund > """ & logPath & """ 2>&1"
exitCode = sh.Run(command, 0, True)

If exitCode = 0 Then
    command = "cmd.exe /d /c node -e ""require('sharp')"" >> """ & logPath & """ 2>&1"
    exitCode = sh.Run(command, 0, True)
End If

If exitCode = 0 Then
    sh.Run "wscript.exe """ & fso.BuildPath(baseDir, "open-app.vbs") & """", 0, False
Else
    MsgBox "Dependency repair fail hua. Log khul raha hai: " & logPath, vbExclamation, "Cash Management Repair"
    sh.Run "notepad.exe """ & logPath & """", 1, False
End If
