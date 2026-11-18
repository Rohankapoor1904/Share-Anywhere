# LocalShare Architecture Overview

LocalShare consists of three cooperating layers:

```
┌───────────────────────────────────────────────────────────────┐
│  React Native UI (JS/JSX)  —  src/screens, src/components     │
│      ▲ events (NativeEventEmitter)   │ commands (NativeModules)│
├───────────────────────────────────────────────────────────────┤
│  src/engine/LocalShareNode.js  —  the ONLY engine the UI talks to
├───────────────┬───────────────────────────────┬───────────────┤
│ Kotlin native │  embedded Node.js gateway     │  JS-only bits │
│ (Android)     │  (nodejs-assets)              │               │
│ TLS server +  │  LocalSend v2.2 HTTP server   │ trust store,  │
│ pinning, mDNS │  + transfer relay + WS ctrl   │ pairing, fmt  │
│ BLE, service  │                               │               │
│ cert, SHA-256 │                               │               │
└───────────────┴───────────────────────────────┴───────────────┘
```

## Layer Responsibilities

### 1. Kotlin Native Layer (`android/app/src/main/java/com/rohan/localshare/`)
- **TLS Server & Pinning**: OkHttp + Conscrypt, custom `X509TrustManager` accepting only pinned peer fingerprints.
- **mDNS Service**: Android `NsdManager` advertising `_localshare._tcp` with TXT records.
- **BLE Service**: `BluetoothLeAdvertiser` and `BluetoothLeScanner` for short-range discovery.
- **Chunk Engine**: Chunked read/write with partial resume (`.localshare.part`).
- **Foreground Service**: `TransferForegroundService` ensuring sustained background transfers.
- **Crypto & Pin**: Ephemeral per-session self-signed certificate generation, streaming SHA-256 checksums, and constant-time PIN comparison.

### 2. Embedded Node.js Gateway (`nodejs-assets/nodejs-project/`)
- Runs a LocalSend v2.2 HTTP server on port `53317` for interop with LocalSend clients.
- Runs an embedded transfer server fallback and WebSocket control interface to the React Native engine.

### 3. React Native JavaScript Engine & UI (`src/`)
- **Engine Facade (`src/engine/LocalShareNode.js`)**: Coordinates peer discovery, pairing challenges, transfer queues, and protocol routing.
- **Trust Store (`src/engine/trustStore.js`)**: TOFU (Trust On First Use) store mapping `deviceId -> fingerprint`.
- **Pairing Engine (`src/engine/pairing.js`)**: Evaluates trusted vs unknown peers, manages 6-digit PIN challenges, and enforces a 3-attempt reject policy.
- **Adaptive UI**: Responsive layout supporting phone bottom-tabs and tablet/TV side rail with full keyboard/D-pad navigation.

### 4. Pure Standalone Windows Desktop Layer (`desktop/`)
- **Electron Main Window (`desktop/main.js`)**: Native desktop window with single instance lock, lifecycle management, and native IPC handlers for file dialogs (`dialog:openFiles`, `dialog:openFolder`) and Windows Explorer reveals (`shell:showInFolder`).
- **Preload Bridge (`desktop/preload.js`)**: Secure context isolation exposing `window.electronAPI` to the desktop interface.
- **Desktop Engine (`desktop/engine/desktop-node.js`)**: TransferGateway on port 53318, LocalSend on port 53317, UDP multicast discovery, full chunked file upload/streaming via `/api/send`, and internal control API on port 53319.
- **Desktop UI (`desktop/public/`)**: Glassmorphic UI supporting 4 themes (Midnight, Obsidian, Cyber Neon, Daylight), radar sweep, drag-and-drop file staging, live transfer progress tracking, and received files manager.
- **Packaging Pipeline (`scripts/build_desktop.js` & `build_pc.ps1`)**: Packages the client into a self-contained standalone executable `dist/LocalShare-win32-x64/LocalShare.exe` (168.84 MB) requiring no external browser or live server.

