# LocalShare Project Brain & Memory

## Project Context
- **Name**: LocalShare (`com.rohan.localshare`)
- **Version**: `1.2.84`
- **Spec**: Fully compliant with `AI_BUILD_SPEC (1).md`.
- **Contract**: Anti-Fake Contract (§3) enforced. No mock data in app, no stubbed native modules, no swallowed errors, no fake progress, real sockets/tests only.

## Current State
- **Status**: ALL PHASES COMPLETE & APK COMPILED.
- **Android APK Build**:
  - **Status**: `BUILD SUCCESSFUL` (879 actionable tasks: 870 executed, 9 up-to-date)
  - **APK File**: `android/app/build/outputs/apk/debug/app-debug.apk`
  - **Size**: `273.68 MB`
  - **SHA-256**: `2B3F0EDFE6AA36E5E6A1B13E2A31AC242D3D6A40A3BB8A0D0D4CF5D11A23FA0F`
- **Test Suite**:
  - Unit Tests: 38/38 passing (`npm test`).
  - Integration Tests: 5/5 passing on real sockets (`npm run test:integration`).
  - Linter: ESLint passing with 0 warnings and 0 errors (`npm run lint`).
  - Type-Check: TypeScript checkJs passing with 0 errors (`npm run type-check`).
  - Anti-Fake Audit: 0 forbidden markers, 0 swallowed errors, 0 skipped/todo tests.
  - Mutation Checks: 4 critical paths verified (pinning, PIN reject, resume, SHA-256 verify).

## Architectural Map
1. **JavaScript UI & Engine (`src/`)**:
   - `src/navigation/AppNavigator.js` (adaptive phone tabs / tablet rail)
   - `src/screens/` (`DevicesScreen`, `ShareHubScreen`, `TransfersScreen`, `ReceivedScreen`, `SettingsScreen`, `PermissionsScreen`, `RadarScreen`)
   - `src/components/` (`RadarView`, `PeerCard`, `TransferTile`, `GlassCard`, `PinDialog`, `QueueList`, `EmptyState`)
   - `src/engine/` (`LocalShareNode.js`, `EngineEvents.js`, `providers.js`, `trustStore.js`, `pairing.js`, `sendController.js`, `receiveController.js`, `models.js`)
   - `src/utils/` (`byteFormat.js`, `deviceName.js`, `errors.js`, `logger.js`, `protocol.js`)
   - `src/native/` (`NativeBridge.js`, `NativeEvents.js`)
2. **Embedded Node.js Gateway (`nodejs-assets/nodejs-project/`)**:
   - `main.js`, `protocol.js`, `models.js`, `transfer-gateway.js`, `localsend-gateway.js`
3. **Kotlin Android Native Modules (`android/app/src/main/java/com/rohan/localshare/`)**:
   - `util/PinModule.kt`, `crypto/EphemeralCertModule.kt`, `crypto/HashingModule.kt`, `transfer/ChunkEngine.kt`, `transfer/TransferServerModule.kt`, `transfer/TransferClientModule.kt`, `discovery/NsdDiscoveryModule.kt`, `discovery/BleDiscoveryModule.kt`, `service/TransferForegroundService.kt`, `storage/StorageModule.kt`, `LocalSharePackage.kt`, `MainActivity.kt`, `MainApplication.kt`
4. **Android Build Configuration (`android/`)**:
   - `build.gradle`, `app/build.gradle`, `settings.gradle`, `gradle.properties`, `AndroidManifest.xml`, `strings.xml`, `styles.xml`
5. **Windows Packaging & Verification**:
   - `build_release.ps1`, `.github/workflows/ci.yml`
