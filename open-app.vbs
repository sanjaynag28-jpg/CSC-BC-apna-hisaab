' CSC & BC Apna Hisaab - open app silently
' 1) Server band ho to hidden background me start karta hai
' 2) Server ready hone ka intezaar karta hai (max 45 sec, hang nahi hoga)
' 3) Phir browser kholta hai.
Option Explicit

Dim fso, sh, baseDir, url, tries
Set fso = CreateObject("Scripting.FileSystemObject")
baseDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = baseDir
url = "http://localhost:4000"

If Not ServerReady(url) Then
    sh.Run "cmd /c """ & baseDir & "\server-supervisor.bat""", 0, False
End If

tries = 0
Do While Not ServerReady(url)
    tries = tries + 1
    If tries >= 60 Then
        MsgBox "Server 45 second me start nahi ho paya. Kripya START.bat ya SETUP.bat dubara chalayein, ya logs\server-run.log dekhein.", vbExclamation, "CSC & BC Apna Hisaab"
        WScript.Quit 1
    End If
    WScript.Sleep 750
Loop

sh.Run url, 1, False

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
        If x.status >= 200 And x.status < 600 Then ServerReady = True
    End If
    Err.Clear
    On Error GoTo 0
End Function
