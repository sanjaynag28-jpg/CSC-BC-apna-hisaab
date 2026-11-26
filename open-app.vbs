' CSC & BC Apna Hisaab - open app silently (SQLite Edition)
' 1) Turant Chrome (ya Edge fallback) me live animated loading screen ya app kholta hai
'    (kabhi "This site can't be reached" nahi dikhta!)
' 2) Saath-saath background me server-supervisor.bat ko safely start karta hai.
Option Explicit

Dim fso, sh, baseDir, url, port, stopFile, psExe, silentPs, psCmd, splashFile, targetUrl
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
    psCmd = """" & psExe & """ -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & silentPs & """ -ProjectDir """ & baseDir & """ -Mode open"
    On Error Resume Next
    sh.Run psCmd, 0, False
    If Err.Number = 0 Then
        On Error GoTo 0
        WScript.Quit 0
    End If
    On Error GoTo 0
End If

' Fallback if PowerShell is unavailable
port = ReadEnvPort(baseDir & "\.env", "4000")
url = "http://localhost:" & port

If Not ServerReady(url) Then
    sh.Run "cmd.exe /c """"" & baseDir & "\server-supervisor.bat""""", 0, False
    splashFile = baseDir & "\public\startup-wait.html"
    If fso.FileExists(splashFile) Then
        targetUrl = "file:///" & Replace(splashFile, "\", "/") & "?port=" & port
    Else
        targetUrl = url
    End If
Else
    targetUrl = url & "/"
End If

On Error Resume Next
sh.Run """chrome.exe"" """ & targetUrl & """", 1, False
If Err.Number <> 0 Then
    Err.Clear
    sh.Run """msedge.exe"" """ & targetUrl & """", 1, False
    If Err.Number <> 0 Then
        Err.Clear
        sh.Run """" & targetUrl & """", 1, False
        If Err.Number <> 0 Then
            Err.Clear
            sh.Run "explorer.exe """ & targetUrl & """", 1, False
        End If
    End If
End If
On Error GoTo 0

Function ReadEnvPort(envPath, defaultPort)
    Dim f, line, k, v, hashPos
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
