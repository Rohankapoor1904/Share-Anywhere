# LocalShare Project Brain & Memory

## Project Context
- **Name**: LocalShare (`com.rohan.localshare`)
- **Version**: `1.2.84`
- **Spec**: Fully compliant with `AI_BUILD_SPEC (1).md`.
- **Contract**: Anti-Fake Contract (§3) enforced. No mock data in app, no stubbed native modules, no swallowed errors, no fake progress, real sockets/tests only.

## Current State
- **Status**: ALL PHASES COMPLETE, THEME & UI REFACTORED, RELEASE APKs & PC DESKTOP APP COMPILED & VERIFIED.
- **Theme & UI/UX System**:
  - Full modular Design Token & Multi-Theme Architecture implemented in `src/theme/`.
  - 4 tailored, high-contrast themes:
    - **Midnight Slate** (id: `midnight`, default dark with deep navy and electric sky blue)
    - **OLED Obsidian** (id: `obsidian`, 100% pure black `#000000` for AMOLED battery savings)
    - **Cyber Neon** (id: `cyberpunk`, electric ultraviolet and hot pink)
    - **Daylight Pristine** (id: `daylight`, crisp high-contrast light theme)
  - Interactive visual Theme Selector on `SettingsScreen` with live preview swatches and AsyncStorage persistence (`@localshare:theme_id`).
  - Dynamic React Navigation sync: active tab bar highlights, themed header backgrounds, and status bar styles (`light` / `dark`).
  - Enhanced UI components: `GlassCard` variants, `PeerCard` with platform avatars & trust badges, `TransferTile` with semantic status colors & file type glyphs, `RadarView` with themed sweep gradient, `PinDialog` with illuminated PIN boxes, `QueueList` with total size chips, and `EmptyState` with glowing icons.
  - Enhanced screens: peer searching on `DevicesScreen`, file category filtering and searching on `ReceivedScreen`, combined throughput banner on `TransfersScreen`, and dashed dropzone on `ShareHubScreen`.
- **Android Release APK Build**:
  - **Status**: `BUILD SUCCESSFUL in 16m 36s` (`build_release.ps1`)
  - **Primary Phone APK (arm64-v8a)**: `android/app/build/outputs/apk/release/app-arm64-v8a-release.apk`
    - **Size**: **30.21 MB**
    - **SHA-256**: `3B19E13E17C18490980AFCE67C7132CA44866E36EAC2E91816E20E1CCB064CCD`
  - **Emulator / WSA APK (x86_64)**: `android/app/build/outputs/apk/release/app-x86_64-release.apk`
    - **Size**: **31.59 MB**
    - **SHA-256**: `46CE8BDA3DDD47678D1020CC0559B347267EA056868A0C44A7E8120D52B1EB82`
  - **Legacy ARM APK (armeabi-v7a)**: `android/app/build/outputs/apk/release/app-armeabi-v7a-release.apk`
    - **Size**: **28.90 MB**
    - **SHA-256**: `9C975C24CBD1F40A128D9FA3BD2B38609B52CF98B6C29315FE77133B9E69B74F`
  - **Universal APK**: `android/app/build/outputs/apk/release/app-universal-release.apk`
    - **Size**: **73.89 MB**
    - **SHA-256**: `D1A1CF4A368307F10BBCBB5A25A85024749BBF5D64C20A08501A067805D824EC`
- **Pure Standalone Windows Desktop Application**:
  - **Status**: `BUILD, PACKAGING & VERIFICATION SUCCESSFUL` (`build_pc.ps1`, `scripts/build_desktop.js`)
  - **Standalone Executable**: `dist/LocalShare-win32-x64/LocalShare.exe` (**168.84 MB**)
  - **Electron Main Process**: `desktop/main.js` native `BrowserWindow` with single instance lock, IPC bridge, native Windows file dialogs (`dialog:openFiles`), and Explorer integration (`shell:showInFolder`).
  - **Preload Bridge**: `desktop/preload.js` secure `contextBridge` exposing `window.electronAPI`.
  - **Engine**: `desktop/engine/desktop-node.js` running native TLS server on 53318, LocalSend v2.2 protocol on 53317, UDP multicast discovery, full chunked file streaming `/api/send`, and desktop control API on 53319.
  - **UI**: `desktop/public/` with glassmorphic native desktop interface supporting all 4 themes (Midnight, Obsidian, Cyberpunk, Daylight), native drag-and-drop file staging, live radar sweep, transfer progress bars, and Windows Explorer folder integration.
  - **Launchers**: `dist/LocalShare-win32-x64/LocalShare.exe`, `LocalShare-PC.bat`, `npm run desktop`.
- **Test Suite**:
  - Unit Tests: 43/43 passing (`npm test`, including `test/unit/theme.test.js`).
  - Integration Tests: 5/5 passing on real sockets (`npm run test:integration`).
  - Linter: ESLint passing with 0 warnings and 0 errors (`npm run lint`).
  - Type-Check: TypeScript checkJs passing with 0 errors (`npm run type-check`).
  - Anti-Fake Audit: 0 forbidden markers, 0 swallowed errors, 0 skipped/todo tests.
  - Mutation Checks: 4 critical paths verified (pinning, PIN reject, resume, SHA-256 verify).

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
