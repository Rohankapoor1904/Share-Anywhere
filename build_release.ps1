<#
.SYNOPSIS
  LocalShare Windows Release Build Script.
  Executes full validation pipeline and builds release Android APK.
#>

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " LocalShare Automated Release Build Pipeline" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Environment Verification
Write-Host "`n[1/5] Verifying Build Toolchain..." -ForegroundColor Yellow

$nodeVer = node -v
Write-Host "Node.js: $nodeVer"
$npmVer = npm -v
Write-Host "npm: $npmVer"
$javaVer = (cmd /c "java -version 2>&1")[0]
Write-Host "Java: $javaVer"

if (Test-Path "C:\Program Files\Eclipse Adoptium\jdk-17.0.18.8-hotspot") {
    $env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.18.8-hotspot"
    Write-Host "Set JAVA_HOME to: $env:JAVA_HOME" -ForegroundColor DarkGray
}

if (-not $env:ANDROID_HOME -and (Test-Path "$env:LOCALAPPDATA\Android\Sdk")) {
    $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
    Write-Host "Set ANDROID_HOME to: $env:ANDROID_HOME" -ForegroundColor DarkGray
}

# 2. Anti-Fake Guard Audit
Write-Host "`n[2/5] Running Anti-Fake Code Audit..." -ForegroundColor Yellow
$fakeMatches = Get-ChildItem -Path "src", "nodejs-assets", "android\app\src\main\java" -Recurse -Include *.js, *.jsx, *.kt |
    Select-String -CaseSensitive -Pattern "TODO|FIXME|not implemented|\bplaceholder\b" |
    Where-Object { $_.Line -notmatch "// justified:" -and $_.Line -notmatch "placeholder=" -and $_.Line -notmatch "placeholderTextColor" }

if ($fakeMatches) {
    Write-Host "ERROR: Anti-Fake Contract violation detected!" -ForegroundColor Red
    $fakeMatches | ForEach-Object { Write-Host "$($_.Filename):$($_.LineNumber) - $($_.Line)" -ForegroundColor Red }
    exit 1
} else {
    Write-Host "Anti-Fake audit clean: Zero forbidden markers found." -ForegroundColor Green
}

# 3. Code Quality: Lint & Type-Check
Write-Host "`n[3/5] Running Linter & TypeScript CheckJs..." -ForegroundColor Yellow
npm run lint
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run type-check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Lint and type-check passed." -ForegroundColor Green

# 4. Test Suite Execution
Write-Host "`n[4/5] Running Unit & Integration Tests..." -ForegroundColor Yellow
npm test -- --ci
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run test:integration -- --ci
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "All unit and integration tests passed." -ForegroundColor Green

# 5. Native Build Execution
Write-Host "`n[5/5] Building Android Release Package (assembleRelease)..." -ForegroundColor Yellow
Push-Location "android"
try {
    if (Test-Path ".\gradlew.bat") {
        .\gradlew.bat assembleRelease
    } else {
        gradle assembleRelease
    }
} finally {
    Pop-Location
}

$releaseDir = "android\app\build\outputs\apk\release"
if (Test-Path $releaseDir) {
    Write-Host "`n==========================================" -ForegroundColor Green
    Write-Host " RELEASE BUILD SUCCESS!" -ForegroundColor Green
    Get-ChildItem -Path $releaseDir -Filter "*.apk" | ForEach-Object {
        $hash = Get-FileHash -Path $_.FullName -Algorithm SHA256
        $sizeMb = [math]::Round($_.Length / 1MB, 2)
        Write-Host " - APK:    $($_.Name) ($sizeMb MB)" -ForegroundColor Green
        Write-Host "   Path:   $($_.FullName)" -ForegroundColor DarkGray
        Write-Host "   SHA256: $($hash.Hash)" -ForegroundColor DarkGray
    }
    Write-Host "==========================================" -ForegroundColor Green
} else {
    Write-Host "`nBuild completed. Artifact ready." -ForegroundColor Green
}

