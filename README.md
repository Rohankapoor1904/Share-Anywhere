# LocalShare

LocalShare is a cross-platform, serverless local file sharing app built with React Native + Expo, Kotlin Android native modules, and an embedded Node.js gateway.

## Features
- **LAN Direct Sharing**: Zero-cloud, encrypted, direct peer-to-peer file transfer over Wi-Fi/LAN.
- **mDNS & BLE Discovery**: Real-time service advertising and continuous background scanning.
- **Anti-Tamper & Security**: Ephemeral session certificates, strict certificate pinning, TOFU trust store, and constant-time 6-digit PIN verification.
- **Resumable Chunk Transfers**: Streaming chunk transfers (`.localshare.part`) with hash-verified resume.
- **LocalSend v2.2 Interop**: Seamless cross-compatibility with LocalSend desktop and mobile clients.
- **Adaptive Cross-Platform UI**: Supports Mobile (iOS/Android), Tablet, Desktop, and Android TV (D-pad navigable).

## Documentation
See [docs/README.md](docs/README.md) for full architectural documentation and [docs/audit/change_log.md](docs/audit/change_log.md) for audit logs.
