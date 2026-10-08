# Build the Windows installer for LocalShare.
#
#   pwsh ./packaging/windows/build.ps1 [-Version 0.1.0]
#
# Requires: Flutter, Inno Setup 6 (ISCC.exe). Produces
# build\packages\LocalShare-<version>-setup.exe
param(
  [string]$Version = ""
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path "$PSScriptRoot\..\.."

if (-not $Version) {
  $line = Select-String -Path "$Root\pubspec.yaml" -Pattern '^version:\s*([0-9.]+)' | Select-Object -First 1
  $Version = if ($line) { $line.Matches[0].Groups[1].Value } else { "0.1.0" }
}

Write-Host "==> Building release bundle (version $Version)"
Push-Location $Root
try {
  flutter build windows --release
} finally {
  Pop-Location
}

$Bundle = "$Root\build\windows\x64\runner\Release"
if (-not (Test-Path $Bundle)) { throw "Release bundle not found at $Bundle" }

$OutDir = "$Root\build\packages"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$Iscc = @(
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $Iscc) {
  Write-Warning "Inno Setup 6 (ISCC.exe) not found; skipping installer."
  Write-Host "Install it from https://jrsoftware.org/isdl.php"
  Write-Host "The portable bundle is ready at: $Bundle"
  exit 0
}

Write-Host "==> Compiling installer"
& $Iscc `
  "/DMyAppVersion=$Version" `
  "/DMySourceDir=$Bundle" `
  "/DMyIcon=$Root\assets\icon\localshare.ico" `
  "/DMyOutputDir=$OutDir" `
  "$PSScriptRoot\localshare.iss"

Write-Host "==> Done. Artifacts in $OutDir"
