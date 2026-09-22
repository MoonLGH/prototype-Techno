Set ws = CreateObject("WScript.Shell")
ws.CurrentDirectory = "C:\prototype-Techno"
ws.Run "node server.js", 0, False
Set fso = CreateObject("Scripting.FileSystemObject")
Set log = fso.CreateTextFile("C:\prototype-Techno\server-vbs.log", True)
log.WriteLine "VBScript launched node server at " & Now()
log.Close
