' CSC & BC Apna Hisaab - silent boot/logon launcher (SQLite Edition)
' Logon hone par bina console window ke server + Chrome/Edge loading splash start karta hai.
Option Explicit
Dim fso, sh, baseDir, stopFile, psExe, silentPs, nodeExe, port, url, psCmd, rc
Set fso = CreateObject("Scripting.FileSystemObject")
baseDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = baseDir

stopFile = baseDir & "\logs\.stop_supervisor"
On Error Resume Next
If fso.FileExists(stopFile) Then fso.DeleteFile stopFile, True
On Error GoTo 0

psExe = sh.ExpandEnvironmentStrings("%WINDIR%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"
silentPs = baseDir & "\scripts\silent-launch.ps1"

If fso.FileExists(psExe) And fso.FileExists(silentPs) Then
    psCmd = """" & psExe & """ -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & silentPs & """ -ProjectDir """ & baseDir & """ -Mode logon"
    On Error Resume Next
    rc = sh.Run(psCmd, 0, False)
    If Err.Number = 0 Then
        On Error GoTo 0
        WScript.Quit 0
    End If
    On Error GoTo 0
End If

' Pure VBS fallback if PowerShell is restricted by policy
port = ReadEnvPort(baseDir & "\.env", "4000")
url = "http://localhost:" & port

If Not ServerReady(url) Then
    nodeExe = FindNodeExe(sh, baseDir)
    If nodeExe <> "" Then
        If Not fso.FileExists(baseDir & "\node_modules\better-sqlite3\package.json") And Not fso.FileExists(baseDir & "\logs\.updating") Then
            On Error Resume Next
            sh.Run "cmd.exe /c """"" & nodeExe & """ """ & baseDir & "\utils\autoUpdater.js"" --silent >nul 2>&1""", 0, True
            On Error GoTo 0
        End If
    End If
    sh.Run "cmd.exe /c """"" & baseDir & "\server-supervisor.bat""""", 0, False
End If

OpenSplashOrApp sh, fso, baseDir, port, ServerReady(url)

Sub OpenSplashOrApp(shellObj, fileObj, projDir, p, isReady)
    Dim target, splashFile
    splashFile = projDir & "\public\startup-wait.html"
    If isReady Or Not fileObj.FileExists(splashFile) Then
        target = "http://localhost:" & p & "/"
    Else
        target = "file:///" & Replace(splashFile, "\", "/") & "?port=" & p
    End If
    On Error Resume Next
    shellObj.Run """chrome.exe"" """ & target & """", 1, False
    If Err.Number <> 0 Then
        Err.Clear
        shellObj.Run """msedge.exe"" """ & target & """", 1, False
        If Err.Number <> 0 Then
            Err.Clear
            shellObj.Run """" & target & """", 1, False
        End If
    End If
    On Error GoTo 0
End Sub

Function ReadEnvPort(envPath, defaultPort)
    Dim f, line, hashPos, k, v
    ReadEnvPort = defaultPort
    On Error Resume Next
    If Not fso.FileExists(envPath) Then Exit Function
    Set f = fso.OpenTextFile(envPath, 1, False)
    Do While Not f.AtEndOfStream
        line = Trim(f.ReadLine)
        If Left(line, 1) = Chr(239) Then line = Mid(line, 4)
        If line <> "" And Left(line, 1) <> "#" Then
            hashPos = InStr(line, "=")
            If hashPos > 1 Then
                k = UCase(Trim(Left(line, hashPos - 1)))
                If k = "PORT" Then
                    v = Trim(Mid(line, hashPos + 1))
                    If InStr(v, "#") > 0 Then v = Trim(Left(v, InStr(v, "#") - 1))
                    v = Replace(Replace(v, """", ""), "'", "")
                    If IsNumeric(v) And CLng(v) > 0 And CLng(v) <= 65535 Then
                        ReadEnvPort = CStr(CLng(v))
                        Exit Do
                    End If
                End If
            End If
        End If
    Loop
    f.Close
    On Error GoTo 0
End Function

Function ServerReady(u)
    Dim x
    ServerReady = False
    On Error Resume Next
    Set x = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    If Err.Number <> 0 Then
        Err.Clear
        Set x = CreateObject("MSXML2.XMLHTTP")
    End If
    If Err.Number <> 0 Then
        Err.Clear
        On Error GoTo 0
        Exit Function
    End If
    x.setTimeouts 500, 500, 500, 500
    Err.Clear
    x.open "GET", u & "/api/health", False
    If Err.Number = 0 Then x.send
    If Err.Number = 0 Then
        If x.status = 200 Then ServerReady = True
    End If
    Err.Clear
    On Error GoTo 0
End Function

Function FindNodeExe(shellObj, projDir)
    Dim candidates, i, p
    FindNodeExe = ""
    candidates = Array( _
        projDir & "\.runtime\nodejs\node.exe", _
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
