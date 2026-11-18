@echo off
title LocalShare Pure Desktop App
echo ========================================================
echo  Starting LocalShare Pure Desktop Application...
echo ========================================================

if exist "dist\LocalShare-win32-x64\LocalShare.exe" (
    echo [INFO] Launching standalone LocalShare.exe...
    start "" "dist\LocalShare-win32-x64\LocalShare.exe"
    exit /b 0
)

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not found in your PATH. Please install Node.js v18+.
    pause
    exit /b 1
)

echo [INFO] Launching LocalShare Electron Desktop Window...
call npx electron desktop\main.js
