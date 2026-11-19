# LocalShare Project Brain & Memory

## Project Context
- **Name**: LocalShare (`com.rohan.localshare`)
- **Version**: `1.2.84`
- **Spec**: Fully compliant with `AI_BUILD_SPEC (1).md`.
- **Contract**: Anti-Fake Contract (§3) enforced. No mock data in app, no stubbed native modules, no swallowed errors, no fake progress, real sockets/tests only.

## Current State
- **Status**: ALL PHASES COMPLETE, DISCOVERY MULTI-CHANNEL OVERHAUL IMPLEMENTED, STANDALONE PC EXECUTABLE COMPILED, RELEASE APKs COMPILED & REPOSITORY SYNCED, PHASE 12 & PHASE 13 RUNTIME-DEFECT FIXES LANDED, PHASE 14 REMOTE FILE EXPLORER & CLIPBOARD SYNC LANDED, PHASE 14.6 FOUR RUNTIME BUGS FIXED, PHASE 14.7 DESKTOP UI OVERHAUL LANDED.
- **Phase 14.7 Desktop UI Overhaul** (see `docs/audit/change_log.md` entry 14.7):
  - **Layered Shell**: `body` now paints two `radial-gradient(circle at 15% 15% / 85% 85%)` mesh layers over `--bg-app` with `background-attachment: fixed`; the previous `body::before` mesh was removed as redundant.
  - **Glass Depth**: `.glass-card`, `.device-card` and `.transfer-card` all use `backdrop-filter: blur(20px) saturate(160%)` with a two-part shadow (`0 12px 32px -8px` drop + `inset 0 1px 0 0 rgba(255,255,255,0.14)` rim), a `translateY(-2px)` hover lift with a `--primary-glow` ring, and `transform: scale(0.99)` press feedback.
  - **Sonar Motion**: `@keyframes radar-ripple` renamed to `@keyframes radarPulse` (0% `scale(0.15)`/`opacity 0.65` → 100% `scale(1)`/`opacity 0`) and consumed by both `.radar-ripple` rings.
  - **Slim Scrollbars**: 8px `::-webkit-scrollbar` family with transparent track, `--border` thumb and `--border-highlight` hover, replacing the default Electron chrome.
  - **Persistent Telemetry**: `.engine-telemetry` strip at the top of `<main>` shows live LAN IP, both engine ports (53318 / 53317) and peer count on every tab, plus two functional pills — Clipboard Sync (GET `/api/clipboard`, reports real character count) and Scan (POST `/api/scan` → `loadPeers()`). Wired in `app.js` via `loadSelfInfo()` and `renderRadar()`.
- **Phase 14.6 Four Runtime Bugs** (see `docs/audit/change_log.md` entry 14.6):
  - **Self-Discovery on Android**: `LocalShareNode._handlePeerSighting()` now also rejects any peer advertising one of this device's own interface addresses (`normalizeIp` + `isLocalAddress`, `detectedLocalIp`), covering the case where the same app answers on 53317 *and* 53318 with two different ids.
  - **PC Approval Visibility**: `DesktopEngine.onIncomingRequest` hook fires from `requestIncomingApproval()`; `desktop/main.js` restores/focuses the window and raises a native Electron `Notification`, so the 30s approval gate is never silently missed (previously surfaced as "request failed" on the phone).
  - **PC→Phone Crash**: `TransferForegroundService.onStartCommand()` wraps `startForeground()` in try/catch — it throws `ForegroundServiceStartNotAllowedException`/`SecurityException` and previously escaped to kill the process.
  - **Approval Race**: `TransferServerModule` registers the `CountDownLatch` *before* emitting `IncomingSession`, so a fast JS `respondToSession` is no longer dropped into a 30s timeout; `startServer`/`respondToSession` bridge promises are nullable because JS omits them.
- **Phase 14 Remote File Explorer & Clipboard Sync** (see `docs/audit/change_log.md` entries 14.1-14.4):
  - **PC Remote FS Protocol**: `nodejs-assets/nodejs-project/fs-service.js` performs real disk I/O (list/copy/delete/stream); `transfer-gateway.js` serves `/v1/fs/list`, `/v1/fs/download`, `/v1/fs/stream` (HTTP Range 206), `/v1/fs/copy`, `/v1/fs/delete`, and `GET/POST /v1/clipboard` (real OS clipboard). `browseRoot` defaults to the home directory.
  - **Desktop Remote Files UI**: `desktop/engine/desktop-node.js` proxies `/api/remote-fs/*` and `/api/remote-clipboard/*` to remote peers and streams pulls into `Downloads/LocalShare`; `desktop/public/` adds a Remote Files tab with preview (image/video/audio/text), copy, delete, pull, and clipboard push/pull.
  - **Android Remote FS/Clipboard Server**: `TransferServerModule.kt` serves the same `/v1/fs/*` + `/v1/clipboard` protocol over real `File` I/O with Range streaming and UI-thread clipboard access; `StorageModule.kt` exposes all-files access management and clipboard; `MANAGE_EXTERNAL_STORAGE` added.
  - **Mobile Files Screen**: `src/engine/remoteFs.js` (`RemoteFsClient`) + `src/screens/RemoteExplorerScreen.js` (new `Files` tab) browse a paired PC; `PeerCard` gains a "Browse Files" action.
  - **Live FGS Notification (Issue 4)**: transfer-progress events now drive a determinate progress bar and speed text in the Android foreground-service notification via `TransferForegroundService.updateProgress` → `NativeBridge.updateForegroundProgress` → `LocalShareNode._updateProgressNotification`.
- **Phase 13 Spec Reconciliation** (see `docs/audit/change_log.md` entries 13.1-13.4):
  - **Self-Discovery Hardening**: `desktop/engine/desktop-node.js` collects *every* local interface IP (`getAllLocalIps()`) and drops self via `isSelfPeer()` / `handlePeerFound()`; the LocalSend UDP socket disables multicast loopback and ignores self announcements. The PC never lists itself.
  - **Native `content://` Streaming**: `TransferClientModule.uploadChunkFromUri()` streams a real file slice (content:// URI or path) straight to the socket via OkHttp; `HashingModule.computeFileHash()` streams `content://` URIs. `sendController.js` uses this path on Android (with a `react-native-fs` fallback for tests) and the scheme follows `peer.useTls`.
  - **Native Payload Parsing**: `TransferServerModule.handleClient()` reads headers line-by-line and bodies by exact `Content-Length`, wrapped in try/catch so a bad socket can never crash the app; `receiveController.js` parses the Android `{ sessionId, rawJson }` event before dereferencing `sender`.
  - **Approval Flow & Notifications**: incoming sessions raise a high-priority OS notification and block until the user accepts/declines (native `CountDownLatch`); Android shows the prompt via `PinDialog` (`mode: 'approve'`) and the PC UI shows an Accept/Decline modal via SSE (`/api/respond-request`). Status notifications post on launch, scanning, transfers, and shutdown.
- **Discovery Multi-Channel Engine**:
  - **Android Wi-Fi MulticastLock**: Native `WifiManager.MulticastLock` acquired during discovery to prevent Android kernel/firmware from dropping incoming mDNS and UDP multicast packets.
  - **Serialized Resolve Queue**: Re-entrant `ConcurrentLinkedQueue` in `NsdDiscoveryModule.kt` ensuring sequential service resolution to prevent Android `FAILURE_ALREADY_ACTIVE` crashes.
  - **Active Subnet Probing**: Concurrent subnet range probers on Android (`LocalShareNode.scanSubnet()`) and PC Desktop (`desktop-node.js:probeSubnet()`) probing ports 53318 (`/v1/info`) and 53317 (`/api/localsend/v2/info`) across `192.168.x.1-254`. Guarantees peer discovery even when routers filter multicast or enforce AP isolation.
  - **Cross-Protocol Handshake**: Dual-channel support across both LocalShare (53318) and LocalSend (53317) protocols.
  - **Android 12-14+ Runtime Permissions**: Comprehensive runtime permission request flow in `src/utils/permissions.js` handling `NEARBY_WIFI_DEVICES`, `BLUETOOTH_SCAN`, and `ACCESS_FINE_LOCATION`.
- **Pure Standalone Windows Desktop Application**:
  - **Status**: `BUILD, PACKAGING & VERIFICATION SUCCESSFUL` (`build_pc.ps1`, `scripts/build_desktop.js`)
  - **Standalone Executable**: `dist/LocalShare-win32-x64/LocalShare.exe` (**168.84 MB**)
  - **Electron Main Process**: `desktop/main.js` native `BrowserWindow` with single instance lock, IPC bridge, native Windows file dialogs (`dialog:openFiles`), and Explorer integration (`shell:showInFolder`). Window initializes instantly with `show: true` and local disk fallback to prevent any black/invisible window states.
  - **Network Resilience & Port Fallback**: Automatic port fallback across `TransferGateway` (53318 -> 53328), `LocalSendGateway` (53317 -> 53327), and `controlServer` (53319 -> 53320) to eliminate Windows ephemeral socket `EADDRINUSE` conflicts.
  - **Environment Isolation**: `scripts/run_desktop.js` and `LocalShare-PC.bat` strip `ELECTRON_RUN_AS_NODE` to ensure the GUI launches properly across all Windows terminal and explorer environments.
  - **Preload Bridge**: `desktop/preload.js` secure `contextBridge` exposing `window.electronAPI`.
  - **Engine**: `desktop/engine/desktop-node.js` running native TLS server on 53318, LocalSend v2.2 protocol on 53317, UDP multicast discovery, full chunked file streaming `/api/send`, active subnet range scanning, and desktop control API on 53319.
  - **UI**: `desktop/public/` with glassmorphic native desktop interface supporting all 4 themes (Midnight, Obsidian, Cyberpunk, Daylight), native drag-and-drop file staging, live radar sweep, transfer progress bars, and Windows Explorer folder integration.
  - **Launchers**: `dist/LocalShare-win32-x64/LocalShare.exe`, `LocalShare-PC.bat`, `npm run desktop`.
- **Theme & UI/UX System**:
  - Full modular Design Token & Multi-Theme Architecture implemented in `src/theme/`.
  - 4 tailored, high-contrast themes:
    - **Midnight Slate** (id: `midnight`, default dark with deep navy and electric sky blue)
    - **OLED Obsidian** (id: `obsidian`, 100% pure black `#000000` for AMOLED battery savings)
    - **Cyber Neon** (id: `cyberpunk`, electric ultraviolet and hot pink)
    - **Daylight Pristine** (id: `daylight`, crisp high-contrast light theme)
  - Interactive visual Theme Selector on `SettingsScreen` with live preview swatches and AsyncStorage persistence (`@localshare:theme_id`).
  - Dynamic React Navigation sync: active tab bar highlights, themed header backgrounds, and status bar styles (`light` / `dark`).
- **Android Release APKs**:
  - **Primary Phone APK (arm64-v8a)**: `android/app/build/outputs/apk/release/app-arm64-v8a-release.apk`
  - **Emulator / WSA APK (x86_64)**: `android/app/build/outputs/apk/release/app-x86_64-release.apk`
  - **Legacy ARM APK (armeabi-v7a)**: `android/app/build/outputs/apk/release/app-armeabi-v7a-release.apk`
  - **Universal APK**: `android/app/build/outputs/apk/release/app-universal-release.apk`
- **Test Suite**:
  - Unit Tests: 75/75 passing (`npm test`).
  - Integration Tests: 18/18 passing on real sockets (`npm run test:integration`).
  - Linter: ESLint passing with 0 warnings and 0 errors (`npm run lint`).
  - Type-Check: TypeScript checkJs passing with 0 errors (`npm run type-check`).
  - Anti-Fake Audit: 0 forbidden markers, 0 swallowed errors, 0 skipped/todo tests.

## Architectural Map
1. **Design System & Theme Engine (`src/theme/`)**:
   - `src/theme/tokens.js` (spacing, radii, typography, shadows)
   - `src/theme/themes.js` (`midnight`, `obsidian`, `cyberpunk`, `daylight`)
   - `src/theme/ThemeContext.js` (`ThemeProvider`, `useTheme()`, persistence, nav sync)
   - `src/theme/index.js` (barrel exports)
2. **JavaScript UI & Engine (`src/`)**:
   - `src/navigation/AppNavigator.js` (adaptive phone tabs / tablet rail, dynamic theming)
   - `src/screens/` (`DevicesScreen`, `ShareHubScreen`, `TransfersScreen`, `ReceivedScreen`, `SettingsScreen`, `PermissionsScreen`, `RadarScreen`)
   - `src/components/` (`RadarView`, `PeerCard`, `TransferTile`, `GlassCard`, `PinDialog`, `QueueList`, `EmptyState`)
   - `src/engine/` (`LocalShareNode.js`, `EngineEvents.js`, `providers.js`, `trustStore.js`, `pairing.js`, `sendController.js`, `receiveController.js`, `models.js`)
   - `src/utils/` (`byteFormat.js`, `deviceName.js`, `errors.js`, `logger.js`, `protocol.js`)
   - `src/native/` (`NativeBridge.js`, `NativeEvents.js`)
3. **Pure Standalone Windows Desktop Application (`desktop/`)**:
   - `desktop/main.js` (Electron native application window, IPC bridge, single instance lock, lifecycle)
   - `desktop/preload.js` (secure `contextBridge` exposing `window.electronAPI`)
   - `desktop/engine/desktop-node.js` (TransferGateway 53318, LocalSendGateway 53317, `/api/send` socket engine, Control API 53319)
   - `desktop/public/` (`index.html`, `style.css`, `app.js` with drag & drop, Explorer integration, transfer progress bars)
   - `scripts/build_desktop.js` (Electron Packager standalone compiler)
   - `dist/LocalShare-win32-x64/LocalShare.exe` (standalone compiled executable)
   - `LocalShare-PC.bat` (native desktop app launcher)
   - `build_pc.ps1` (automated 5-stage PC build & packaging pipeline)
4. **Embedded Node.js Gateway (`nodejs-assets/nodejs-project/`)**:
   - `main.js`, `protocol.js`, `models.js`, `transfer-gateway.js`, `localsend-gateway.js`
5. **Kotlin Android Native Modules (`android/app/src/main/java/com/rohan/localshare/`)**:
   - `util/PinModule.kt`, `crypto/EphemeralCertModule.kt`, `crypto/HashingModule.kt`, `transfer/ChunkEngine.kt`, `transfer/TransferServerModule.kt`, `transfer/TransferClientModule.kt`, `discovery/NsdDiscoveryModule.kt`, `discovery/BleDiscoveryModule.kt`, `service/TransferForegroundService.kt`, `storage/StorageModule.kt`, `LocalSharePackage.kt`, `MainActivity.kt`, `MainApplication.kt`
6. **Android Build Configuration (`android/`)**:
   - `build.gradle`, `app/build.gradle`, `settings.gradle`, `gradle.properties`, `AndroidManifest.xml`, `strings.xml`, `styles.xml`
7. **Windows Packaging & Verification**:
   - `build_release.ps1`, `build_pc.ps1`, `.github/workflows/ci.yml`
