' CSC & BC Apna Hisaab - open app silently (SQLite Edition)
' 1) Server band ho to hidden background me start karta hai
' 2) Server ready hone ka intezaar karta hai (max 45 sec, hang nahi hoga)
' 3) Phir browser kholta hai.
Option Explicit

Dim fso, sh, baseDir, url, port, tries, stopFile
Set fso = CreateObject("Scripting.FileSystemObject")
baseDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = baseDir

' Clear any previous STOP sentinel before starting
stopFile = baseDir & "\logs\.stop_supervisor"
On Error Resume Next
If fso.FileExists(stopFile) Then fso.DeleteFile stopFile, True
On Error GoTo 0

port = ReadEnvPort(baseDir & "\.env", "4000")
url = "http://localhost:" & port

If Not ServerReady(url) Then
    sh.Run "cmd.exe /c """"" & baseDir & "\server-supervisor.bat""""", 0, False
End If

tries = 0
Do While Not ServerReady(url)
    tries = tries + 1
    If tries >= 60 Then
        MsgBox "Server 45 second me start nahi ho paya (Port " & port & "). Kripya START.bat ya AI_DOCTOR_SQLITE.bat chalayein, ya logs\server-run.log dekhein.", vbExclamation, "CSC & BC Apna Hisaab"
        WScript.Quit 1
    End If
    WScript.Sleep 750
Loop

On Error Resume Next
sh.Run """" & url & """", 1, False
If Err.Number <> 0 Then
    Err.Clear
    sh.Run "explorer.exe """ & url & """", 1, False
End If
On Error GoTo 0

Function ReadEnvPort(envPath, defaultPort)
    Dim f, line, parts, k, v, hashPos
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
    x.setTimeouts 1000, 1000, 1000, 1000
    Err.Clear
    x.open "GET", u & "/api/health", False
    If Err.Number = 0 Then
        x.send
    End If
    If Err.Number = 0 Then
        If x.status = 200 Then ServerReady = True
    End If
    Err.Clear
    On Error GoTo 0
End Function
