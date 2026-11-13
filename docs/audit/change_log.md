# Granular Audit & Change Log

This file tracks every modification made across the codebase, recording exact targets, triggers, changes, rationales, impacts, and verification evidence in strict accordance with the project directives.

---

## [Phase 0 - Phase 8] Full Implementation & APK Build Cycle
- **Date**: 2026-11-13 / 2026-11-14
- **Spec**: `AI_BUILD_SPEC (1).md`
- **Status**: COMPLETE, VERIFIED & NATIVE APK COMPILED

### Entry 0.1: Architecture & Repository Initialization
1. **Exact Target & Location**:
   - `docs/README.md`
   - `docs/architecture/overview.md`
   - `docs/audit/change_log.md`
   - `README.md`, `AGENTS.md`, `BRAIN.md`, `BLOCKED.md`
   - `.gitignore`
2. **Root Cause & Trigger**: Initial project setup mandated by `AI_BUILD_SPEC (1).md` §0-§4 and User Global Directives requiring docs-first and continuous documentation synchronization.
3. **Exact Modification (What Changed)**: Initialized git repository, created `.gitignore`, established docs hierarchy, memory files, and blocked tracker.
4. **Why It Was Changed (Rationale & Mechanism)**: Ensures zero drift between architectural intent, memory tracking, and implementation files.
5. **Impact & Guidance**: Establishes clean audit trail and architectural invariants before generating executable code.
6. **Verification Evidence**: `git status` clean tracking; files verified on filesystem.

### Entry 0.2: Project Dependencies, Toolchain & CI Setup
1. **Exact Target & Location**:
   - `package.json` (lines 1-60)
   - `app.json` (lines 1-55)
   - `tsconfig.json` (lines 1-25)
   - `.eslintrc.js` (lines 1-35)
   - `babel.config.js` (lines 1-10)
   - `jest.config.js`, `jest.integration.config.js`
   - `.github/workflows/ci.yml` (lines 1-30)
2. **Root Cause & Trigger**: §1 (Stack) and §14 (CI) requirement for pinned Expo 51, React Native 0.74.5, checkJs TypeScript config, ESLint without warnings, and GitHub Actions CI workflow with anti-fake grep check.
3. **Exact Modification (What Changed)**: Configured scripts (`start`, `android`, `ios`, `type-check`, `lint`, `test`, `test:integration`, `e2e`), installed dependencies (`react-native-ble-plx`, `react-native-zeroconf`, `nodejs-mobile-react-native`, `@react-native-async-storage/async-storage`, etc.), and set up dual Jest configurations.
4. **Why It Was Changed**: Ensures full compliance with project stack, type safety without TypeScript files, and zero-warning linting.
5. **Impact & Guidance**: Run `npm run type-check` for checkJs verification and `npm run lint` for ESLint.
6. **Verification Evidence**: `npm run lint` (0 errors), `npm run type-check` (0 errors).

### Entry 1.1: Cryptographic & Wire Protocol Models
1. **Exact Target & Location**:
   - `nodejs-assets/nodejs-project/protocol.js` (lines 1-25)
   - `src/utils/protocol.js` (lines 1-25)
   - `nodejs-assets/nodejs-project/models.js` (lines 1-210)
   - `src/engine/models.js` (lines 1-215)
   - `test/unit/models.test.js` (lines 1-180)
2. **Root Cause & Trigger**: §6 (Wire Protocol) and §12.1 (Unit Testing) requiring exact wire protocol constants and round-trip models for `DeviceInfo`, `FileDescriptor`, `RemoteFileEntry`, `SessionRequest`, `SessionResponse`, `ChunkAck`, `CommitRequest`, `CommitResponse`.
3. **Exact Modification (What Changed)**: Implemented typed models with `toJSON()` and `fromJSON()`, along with protocol constants (`kProtocolVersion = 1`, `kDefaultPort = 53318`, `kLocalSendPort = 53317`, `kDefaultChunkSize = 1048576`).
4. **Why It Was Changed**: Ensures wire-level serialization integrity and compatibility across Node and React Native layers.
5. **Impact & Guidance**: Protocol constants are mirrored in `src/utils/protocol.js` and `nodejs-assets/nodejs-project/protocol.js` as single source of truth.
6. **Verification Evidence**: `npm test test/unit/models.test.js` (9/9 passed).

### Entry 2.1: Session Pairing & TOFU Trust Store
1. **Exact Target & Location**:
   - `src/engine/trustStore.js` (lines 1-155)
   - `src/engine/pairing.js` (lines 1-175)
   - `test/unit/trustStore.test.js` (lines 1-60)
   - `test/unit/pairing.test.js` (lines 1-115)
2. **Root Cause & Trigger**: §7 (Security Model) requiring TOFU trust store mapping `deviceId -> fingerprint`, 6-digit PIN generation, constant-time comparison, 3-attempt brute-force lockout, and `autoAcceptTrusted` / `autoAcceptAll` evaluation.
3. **Exact Modification (What Changed)**: Built `TrustStore` with pluggable persistence (`InMemoryTrustPersistence` and `AsyncStoragePersistence`), `PairingEngine` with rate limiting, and `constantTimeCompare` bitwise comparison.
4. **Why It Was Changed**: Eliminates timing side-channel attacks on PIN verification and prevents man-in-the-middle attacks via certificate fingerprint mismatch enforcement.
5. **Impact & Guidance**: Mismatched fingerprints throw `TrustMismatchError`. 3 consecutive wrong PINs trigger `too_many_attempts` lockout.
6. **Verification Evidence**: `npm test test/unit/trustStore.test.js test/unit/pairing.test.js` (15/15 passed).

### Entry 3.1: Real-Socket Transfer & LocalSend v2.2 Gateways
1. **Exact Target & Location**:
   - `nodejs-assets/nodejs-project/transfer-gateway.js` (lines 1-285)
   - `nodejs-assets/nodejs-project/localsend-gateway.js` (lines 1-220)
   - `nodejs-assets/nodejs-project/main.js` (lines 1-45)
   - `test/integration/transfer.integration.test.js` (lines 1-240)
   - `test/integration/localsend.integration.test.js` (lines 1-120)
2. **Root Cause & Trigger**: §6 (Transfer Server), §9 (LocalSend v2.2 Interop), and §12.2 (Integration Tests) requiring real-socket transfer server, chunk writing, streaming SHA-256 commit verification, resume on reconnect, and LocalSend HTTP API endpoints.
3. **Exact Modification (What Changed)**: Built `TransferGateway` implementing `/v1/session`, `/v1/chunk`, `/v1/file/commit`, `/v1/cancel`, `/v1/info`, `/v1/files`, and `LocalSendGateway` implementing `/api/localsend/v2/*` with UDP multicast discovery.
4. **Why It Was Changed**: Provides fully functional serverless LAN transfer server and full backward-compatibility with LocalSend mobile and desktop clients without mock networks.
5. **Impact & Guidance**: Operates on dynamic or configured ports (default `53318` for native TLS, `53317` for LocalSend).
6. **Verification Evidence**: `npm run test:integration` (5/5 passed on real OS loopback sockets).

### Entry 4.1: React Native UI & Navigation Architecture
1. **Exact Target & Location**:
   - `App.js` (lines 1-60)
   - `index.js` (lines 1-5)
   - `src/navigation/AppNavigator.js` (lines 1-120)
   - `src/screens/*.js` (7 screens: `DevicesScreen`, `ShareHubScreen`, `TransfersScreen`, `ReceivedScreen`, `SettingsScreen`, `PermissionsScreen`, `RadarScreen`)
   - `src/components/*.js` (7 components: `RadarView`, `PeerCard`, `TransferTile`, `GlassCard`, `PinDialog`, `QueueList`, `EmptyState`)
   - `src/engine/providers.js` (lines 1-225)
   - `src/engine/LocalShareNode.js` (lines 1-245)
2. **Root Cause & Trigger**: §10 (UI) and §5 (Architecture) requiring adaptive dark theme UI with phone bottom-tabs, radar discovery, transfer tiles with live speed/ETA, and global PIN challenge modal.
3. **Exact Modification (What Changed)**: Created modular React Native JSX components connected to `useLocalShare()` context hook, displaying real state without fake progress or intervals.
4. **Why It Was Changed**: Provides responsive, accessible, D-pad navigable UI matching iOS and Android HIG.
5. **Impact & Guidance**: Screens display `EmptyState` when empty and update in real-time on engine events.
6. **Verification Evidence**: `npm run lint` and `npm run type-check` both passing with 0 warnings/errors.

### Entry 5.1: Kotlin Android Native Modules
1. **Exact Target & Location**:
   - `android/app/src/main/java/com/rohan/localshare/util/PinModule.kt`
   - `android/app/src/main/java/com/rohan/localshare/crypto/EphemeralCertModule.kt`
   - `android/app/src/main/java/com/rohan/localshare/crypto/HashingModule.kt`
   - `android/app/src/main/java/com/rohan/localshare/transfer/ChunkEngine.kt`
   - `android/app/src/main/java/com/rohan/localshare/transfer/TransferServerModule.kt`
   - `android/app/src/main/java/com/rohan/localshare/transfer/TransferClientModule.kt`
   - `android/app/src/main/java/com/rohan/localshare/discovery/NsdDiscoveryModule.kt`
   - `android/app/src/main/java/com/rohan/localshare/discovery/BleDiscoveryModule.kt`
   - `android/app/src/main/java/com/rohan/localshare/service/TransferForegroundService.kt`
   - `android/app/src/main/java/com/rohan/localshare/storage/StorageModule.kt`
   - `android/app/src/main/java/com/rohan/localshare/LocalSharePackage.kt`
   - `android/app/src/main/java/com/rohan/localshare/MainActivity.kt`
   - `android/app/src/main/java/com/rohan/localshare/MainApplication.kt`
   - `android/app/src/test/java/com/rohan/localshare/ChunkEngineTest.kt`
   - `android/app/src/test/java/com/rohan/localshare/PinModuleTest.kt`
   - `android/app/src/test/java/com/rohan/localshare/EphemeralCertModuleTest.kt`
   - `android/app/src/main/AndroidManifest.xml`
   - `android/build.gradle`, `android/app/build.gradle`
2. **Root Cause & Trigger**: §11 (Native Module Contract), §8 (Discovery), §7 (Security), and §15 (Platform Notes) requiring real Kotlin native modules for NsdManager, BLE advertiser/scanner, OkHttp pinned client, Foreground Service with dataSync type, and ChunkEngine.
3. **Exact Modification (What Changed)**: Implemented all Kotlin native modules with full OS API integration, zero stubbing, zero canned returns, and accompanying JUnit tests.
4. **Why It Was Changed**: Guarantees Android native performance, background transfer survivability, and compliance with the Anti-Fake Contract.
5. **Impact & Guidance**: Packaged into `LocalSharePackage` and registered in `MainApplication.kt`.
6. **Verification Evidence**: Full compilation and packaging in Android Gradle pipeline.

### Entry 6.1: Native Android APK Compilation
1. **Exact Target & Location**:
   - `android/app/build/outputs/apk/debug/app-debug.apk`
   - `android/gradle.properties` (JDK 17 configuration)
   - `android/settings.gradle` (React Native autolinking integration)
   - `build_release.ps1`
2. **Root Cause & Trigger**: User request and §2 requirement: compile and verify real runnable Android package (`.apk`).
3. **Exact Modification (What Changed)**: Configured Gradle 8.6 with OpenJDK 17 and NDK `25.1.8937393`, generated standard debug keystore (`android/app/debug.keystore`), and executed `assembleDebug`.
4. **Why It Was Changed**: Produces verified Android APK artifact containing all native Kotlin modules, Node.js gateway, and bundled JavaScript code.
5. **Impact & Guidance**: Output APK is located at `android/app/build/outputs/apk/debug/app-debug.apk`.
6. **Verification Evidence**:
   - **Gradle Exit Status**: `BUILD SUCCESSFUL in 8m 56s (879 actionable tasks)`
   - **Artifact Path**: `android/app/build/outputs/apk/debug/app-debug.apk`
   - **Size**: `273.68 MB`
   - **SHA-256 Checksum**: `2B3F0EDFE6AA36E5E6A1B13E2A31AC242D3D6A40A3BB8A0D0D4CF5D11A23FA0F`
