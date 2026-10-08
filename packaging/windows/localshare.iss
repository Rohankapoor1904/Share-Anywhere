; Inno Setup script for LocalShare.
; Compile via packaging/windows/build.ps1, which passes the defines below.

#define MyAppName "LocalShare"
#ifndef MyAppVersion
  #define MyAppVersion "0.1.0"
#endif
#ifndef MySourceDir
  #define MySourceDir "..\..\build\windows\x64\runner\Release"
#endif
#ifndef MyIcon
  #define MyIcon "..\..\assets\icon\localshare.ico"
#endif
#ifndef MyOutputDir
  #define MyOutputDir "..\..\build\packages"
#endif

[Setup]
AppId={{9F2C6B0E-1D7A-4A1E-9B2E-4C6F0A9E7D31}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=LocalShare
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir={#MyOutputDir}
OutputBaseFilename=LocalShare-{#MyAppVersion}-setup
SetupIconFile={#MyIcon}
UninstallDisplayIcon={app}\localshare.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; mDNS/BLE need local network access; add a firewall rule on install.
[Files]
Source: "{#MySourceDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\localshare.exe"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\localshare.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"

[Run]
Filename: "{app}\localshare.exe"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent
; Allow inbound LAN traffic so receivers can reach the HTTPS transfer port.
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall add rule name=""LocalShare (LAN)"" dir=in action=allow program=""{app}\localshare.exe"" enable=yes"; Flags: runhidden
