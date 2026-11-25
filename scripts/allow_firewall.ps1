# LocalShare - allow the phone to reach this PC on any network profile.
#
# A phone's hotspot shows up in Windows as a "Public" network, where inbound connections
# are blocked unless a rule allows them. Without this, sending FROM the phone TO the PC and
# clipboard sync fail while connected without Wi-Fi (PC -> phone still works).
#
# Run once:  powershell -ExecutionPolicy Bypass -File scripts\allow_firewall.ps1
# Remove:    powershell -ExecutionPolicy Bypass -File scripts\allow_firewall.ps1 -Remove

param([switch]$Remove)

$ErrorActionPreference = 'Stop'
$ruleName = 'LocalShare (TCP 53317-53318)'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host 'Asking for administrator rights to change the firewall...'
  $argsList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
  if ($Remove) { $argsList += '-Remove' }
  $proc = Start-Process -FilePath 'powershell.exe' -ArgumentList $argsList -Verb RunAs -Wait -PassThru
  exit $proc.ExitCode
}

Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule

if ($Remove) {
  Write-Host "Removed firewall rule '$ruleName'."
  exit 0
}

New-NetFirewallRule `
  -DisplayName $ruleName `
  -Description 'Lets phones running LocalShare send files and clipboard to this PC, including over a phone hotspot.' `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort 53317, 53318 `
  -Profile Any | Out-Null

Write-Host "Added firewall rule '$ruleName' (inbound TCP 53317-53318, all network profiles)."
exit 0
