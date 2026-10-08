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
  - `interop/localsend/` — LocalSend v2.2 compat: wire models, receiver, sender,
    dedicated plain-HTTP server, multicast discovery.
  - `node.dart` — `LocalShareNode` facade the UI talks to. `send()` routes peers
    with `platform == 'localsend'` through the v2 client automatically.
- `lib/platform/` — `RadioAdapter` implementations. `create_adapter.dart` picks
  them per platform.
- `lib/ui/` — Riverpod providers, `RadarView` centrepiece, screens/widgets.
  Desktop drag-and-drop uses `desktop_drop` (guarded by `Platform.is*`).
- `packaging/{linux,windows,macos}/` — distributable build scripts.
- `tools/make_icons.py` — regenerates `assets/icon/*` (Pillow required).

## LocalSend interop

- LocalSend peers can't complete our pinned-cert TLS handshake, so a separate
  plain-HTTP listener (`LocalSendServer`) serves `/api/localsend/v2/*`. It is
  independent of the TLS `TransferServer` and runs on `kLocalSendPort` (53317).
- `send()` inspects `DeviceInfo.platform`; `'localsend'`/`'localsend-https'`
  route to `_sendLocalSend`, which reuses the native PIN-prompt flow.
- `NsdRadioAdapter` also registers `_localsend._tcp` and browses it, surfacing
  found apps as `platform: localsend` peers.

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
dart format lib test       # must be clean (CI enforces it)
flutter test               # 27 tests
flutter build linux --debug
flutter run -d linux

# Linux distributables (.deb, and .AppImage if appimagetool present)
./packaging/linux/build.sh
```

CI is `.github/workflows/ci.yml` (analyze + format check + tests + Linux
release build + headless smoke test, Flutter pinned to 3.27.1). For Google
Jules, `tools/jules_setup.sh` installs the Flutter toolchain in the VM; paste
its body into the repo's Jules environment-setup field.

Headless UI smoke test: build, then `xvfb-run -a ./build/linux/x64/release/bundle/localshare`.
Expect a couple of harmless GTK/ATK `CRITICAL` warnings; there must be no Dart
exceptions. The process stays up until killed (exit 124 under `timeout` is fine).
