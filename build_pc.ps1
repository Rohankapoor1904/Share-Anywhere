<#
.SYNOPSIS
  LocalShare Pure Desktop Application Build & Packaging Script.
  Builds standalone Windows desktop executable (LocalShare.exe), verifies runtime and assets.
#>

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " LocalShare Pure Desktop App Build & Pack" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Environment Verification
Write-Host "`n[1/5] Verifying PC Desktop Toolchain..." -ForegroundColor Yellow
$nodeVer = node -v
Write-Host "Node.js:  $nodeVer" -ForegroundColor Green
$npmVer = npm -v
Write-Host "npm:      $npmVer" -ForegroundColor Green

# 2. Asset Integrity Check
Write-Host "`n[2/5] Verifying PC Desktop Source Assets..." -ForegroundColor Yellow
$requiredFiles = @(
    "desktop\main.js",
    "desktop\preload.js",
    "desktop\engine\desktop-node.js",
    "desktop\public\index.html",
    "desktop\public\style.css",
    "desktop\public\app.js",
    "scripts\build_desktop.js",
    "LocalShare-PC.bat"
)

foreach ($f in $requiredFiles) {
    if (-not (Test-Path $f)) {
        Write-Host "ERROR: Missing required desktop asset: $f" -ForegroundColor Red
        exit 1
    }
    Write-Host " - Verified: $f" -ForegroundColor DarkGray
}

# 3. Quality & Tests
Write-Host "`n[3/5] Running Core Quality Suite..." -ForegroundColor Yellow
npm run lint
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm test -- --ci
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Core quality checks passed." -ForegroundColor Green

# 4. Standalone Desktop Packaging
Write-Host "`n[4/5] Packaging Standalone Windows Desktop App (.exe)..." -ForegroundColor Yellow
node ./scripts/build_desktop.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$exePath = "dist\LocalShare-win32-x64\LocalShare.exe"
if (-not (Test-Path $exePath)) {
    Write-Host "ERROR: Packaged executable not found: $exePath" -ForegroundColor Red
    exit 1
}
$exeSize = (Get-Item $exePath).Length / 1MB
Write-Host " - Standalone Executable: $exePath ($([Math]::Round($exeSize, 2)) MB)" -ForegroundColor Green

# 5. Live Health Check
Write-Host "`n[5/5] Performing Live Desktop Engine Smoke Test..." -ForegroundColor Yellow
$process = Start-Process node -ArgumentList "desktop\engine\desktop-node.js" -PassThru -NoNewWindow
try {
    Start-Sleep -Seconds 3
    $selfInfo = Invoke-RestMethod -Uri "http://127.0.0.1:53319/api/self" -Method Get -TimeoutSec 5
    Write-Host " - Self Device: $($selfInfo.displayName) ($($selfInfo.address):$($selfInfo.port))" -ForegroundColor Green
    Write-Host " - Storage:     $($selfInfo.storageDir)" -ForegroundColor Green
    Write-Host " - Platform:    $($selfInfo.platform)" -ForegroundColor Green

    $peers = Invoke-RestMethod -Uri "http://127.0.0.1:53319/api/peers" -Method Get -TimeoutSec 5
    Write-Host " - Peer Service: Online (Active Peers: $($peers.Count))" -ForegroundColor Green
} finally {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
}

Write-Host "`n==========================================" -ForegroundColor Green
Write-Host " PURE DESKTOP APPLICATION READY & VERIFIED!" -ForegroundColor Green
Write-Host " Standalone Executable: $exePath" -ForegroundColor Cyan
Write-Host " One-Click Launcher:    .\LocalShare-PC.bat" -ForegroundColor Cyan
Write-Host " Dev Desktop Run:       npm run desktop" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Green
