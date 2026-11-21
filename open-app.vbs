' CSC & BC Apna Hisaab - open app silently
' 1) Server band ho to hidden background me start karta hai
' 2) Server ready hone ka intezaar karta hai (browser me "site can't be reached" na aaye)
' 3) Phir browser kholta hai. DB connect hone tak app khud "Please wait" screen dikhata hai.
Option Explicit

Dim fso, sh, baseDir, url
Set fso = CreateObject("Scripting.FileSystemObject")
baseDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = baseDir
url = "http://localhost:3000"

If Not ServerReady(url) Then
    sh.Run "cmd /c """ & baseDir & "\server-supervisor.bat""", 0, False
End If

Do While Not ServerReady(url)
    WScript.Sleep 750
Loop

sh.Run url, 1, False

' Server up hai ya nahi - HTTP se seedha check (DB down ho to bhi server "ready" hai,
' kyunki tab app khud "Please wait" page dikhata hai).
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
