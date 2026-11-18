# LocalShare

LocalShare is a cross-platform, serverless local file sharing app built with React Native + Expo, Kotlin Android native modules, and an embedded Node.js gateway.

## Features
- **LAN Direct Sharing**: Zero-cloud, encrypted, direct peer-to-peer file transfer over Wi-Fi/LAN.
- **mDNS & BLE Discovery**: Real-time service advertising and continuous background scanning.
- **Anti-Tamper & Security**: Ephemeral session certificates, strict certificate pinning, TOFU trust store, and constant-time 6-digit PIN verification.
- **Resumable Chunk Transfers**: Streaming chunk transfers (`.localshare.part`) with hash-verified resume.
- **LocalSend v2.2 Interop**: Seamless cross-compatibility with LocalSend desktop and mobile clients.
- **Adaptive Cross-Platform UI**: Supports Mobile (iOS/Android), Tablet, Desktop, and Android TV (D-pad navigable).
- **Pure Standalone Windows Desktop App**: Native Windows desktop application with drag-and-drop file sharing, native Windows Explorer integration, and standalone packaging into `LocalShare.exe`.

## Quick Start & Running

### Windows PC Desktop
- **Standalone Executable**: Double-click `dist/LocalShare-win32-x64/LocalShare.exe`
- **1-Click Batch Launcher**: Run `.\LocalShare-PC.bat`
- **Development Mode**: `npm run desktop`
- **Compile Standalone Binary**: `npm run desktop:build` (or run `.\build_pc.ps1`)

### Android Mobile
- **Physical Phone APK (arm64-v8a)**: `android/app/build/outputs/apk/release/app-arm64-v8a-release.apk`
- **Emulator / Windows Subsystem for Android (x86_64)**: `android/app/build/outputs/apk/release/app-x86_64-release.apk`
- **Universal APK**: `android/app/build/outputs/apk/release/app-universal-release.apk`
- **Build APKs**: Run `.\build_release.ps1`

## Documentation
See [docs/README.md](docs/README.md) for full architectural documentation and [docs/audit/change_log.md](docs/audit/change_log.md) for audit logs.

