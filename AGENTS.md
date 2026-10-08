# LocalShare — agent notes

Cross-platform, serverless local file sharing (AirDrop/Quick Share/LocalSend
style) built with Flutter. LAN-only; no third-party internet servers.

## Architecture

- `lib/core/` — pure Dart engine, no Flutter/plugin imports. Unit-testable.
  - `crypto/` — ephemeral self-signed cert (`EphemeralCertificate`), SHA-256
    hashing, PIN generation.
  - `protocol/` — versioned REST models (`kProtocolVersion`), service type
    (`kMdnsServiceType`, `_localshare._tcp`), `DeviceInfo`.
  - `transport/` — HTTPS `TransferServer`/`TransferClient`, chunked uploads,
    resume, progress.
  - `discovery/` — `DiscoveryOrchestrator` merges mDNS + BLE sightings into one
    deduped peer list with a staleness sweep.
  - `session/` — trust store + pairing manager (PIN challenge for unknown peers).
  - `node.dart` — `LocalShareNode` facade the UI talks to.
- `lib/platform/` — `RadioAdapter` implementations. `create_adapter.dart` picks
  them per platform.
- `lib/ui/` — Riverpod providers, `RadarView` centrepiece, screens/widgets.

## Platform notes (verified)

- `nsd` has **no Linux backend** — Linux uses the pure-Dart mDNS client
  (`DartMdnsRadioAdapter`). Do not add `NsdRadioAdapter` on Linux.
- `flutter_blue_plus` on Linux uses BlueZ over D-Bus and **crashes** on hosts
  without a system bus (containers, minimal desktops). BLE is therefore gated
  to Android/iOS/macOS/Windows in `create_adapter.dart`.
- Android cannot set SoftAP SSID/passphrase programmatically on modern versions;
  the app reads the system-generated credentials. iOS can never create a SoftAP.
- `path_provider` throws `MissingPlatformDirectoryException` in headless Linux
  sessions; `storageDirProvider` falls back to `Directory.systemTemp`.

## Permissions

- Android: `NEARBY_WIFI_DEVICES`, `BLUETOOTH_SCAN/ADVERTISE/CONNECT`
  (`neverForLocation`), legacy `BLUETOOTH*` and `ACCESS_FINE_LOCATION`
  (maxSdk 32). Leanback launcher + `android.software.leanback` for Android TV.
- iOS: `NSLocalNetworkUsageDescription`, `NSBonjourServices` (`_localshare._tcp`),
  Bluetooth usage strings.
- Runtime requests via `permission_handler`, gated by `_StartupGate` in
  `main.dart` (mobile only).

## Commands

```bash
flutter analyze            # must be clean
flutter test               # 21 tests
flutter build linux --debug
flutter run -d linux
```

Headless UI smoke test: build, then `xvfb-run -a ./build/linux/x64/debug/bundle/localshare`.
Expect two harmless GTK/ATK `CRITICAL` warnings; there must be no Dart exceptions.
