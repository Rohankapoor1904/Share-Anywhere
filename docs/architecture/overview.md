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
