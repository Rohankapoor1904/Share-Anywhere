# LocalShare — Full Build Spec for AI Agents (React Native + Expo)

> **Hand this entire file to your AI coding agent as the task prompt.**
> It is a complete, self-contained specification to build a **fully working**
> cross-platform, serverless local file sharing app (AirDrop / Quick Share /
> LocalSend style) **from zero**, using the same stack as the `adm` project:
> **React Native + Expo (JavaScript), Kotlin Android native modules, embedded
> Node.js, XML/Gradle, PowerShell**.
>
> This spec exists so the agent **cannot** ship fake, stubbed, or demo code.
> Read §3 (Anti-Fake Contract) before writing a single line.

---

## 0. Mission (one line)

Build **LocalShare**: a React Native + Expo app where devices on the same LAN
discover each other and transfer files directly over an encrypted, resumable
connection — no accounts, no cloud, no internet servers. Runs on **Android
(phone, tablet, TV)**, **iOS**, **Windows**, **macOS**, **Linux**.

---

## 1. Stack (match the `adm` project exactly)

| Layer | Technology | Where |
|-------|-----------|-------|
| UI + app logic | **JavaScript (JSX)** — React Native + Expo | `App.js`, `index.js`, `src/**` |
| Android native modules | **Kotlin** | `android/app/src/main/java/com/rohan/localshare/*.kt` |
| Embedded gateway/server | **Node.js** (nodejs-mobile) | `nodejs-assets/nodejs-project/**` |
| Build config | **Gradle / Groovy**, **XML** | `android/**` |
| Release build (Windows) | **PowerShell** | `build_release.ps1` |

**Language rules (do not violate):**
- **No TypeScript.** `tsconfig.json` may exist and `npm run type-check` may run
  `checkJs` over JavaScript — but write **`.js` / `.jsx` only**. No `.ts`/`.tsx`.
- **Kotlin, not Java**, for all Android native modules.
- Entry chain must be: `index.js` → `App.js` → `src/navigation/AppNavigator.js`.

### `package.json` (target shape)

```jsonc
{
  "name": "localshare",
  "version": "1.2.84",
  "main": "index.js",
  "scripts": {
    "start": "expo start --dev-client",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "type-check": "tsc --noEmit",
    "lint": "eslint . --max-warnings=0",
    "test": "jest",
    "test:integration": "jest --config jest.integration.config.js",
    "e2e": "detox test --configuration android.emu.debug"
  }
}
```

Key dependencies (pin exact versions in `package.json` + `package-lock.json`):

```jsonc
{
  "expo": "~51.x",
  "react": "18.2.0",
  "react-native": "0.74.x",
  "expo-dev-client": "~4.x",
  "@react-navigation/native": "^6.x",
  "@react-navigation/native-stack": "^6.x",
  "react-native-ble-plx": "^3.x",
  "react-native-zeroconf": "^0.13.x",     // mDNS on JS side (fallback)
  "nodejs-mobile-react-native": "^18.x",  // embedded Node gateway
  "@react-native-async-storage/async-storage": "^1.x",
  "react-native-fs": "^2.20.x",
  "@react-native-community/netinfo": "^11.x",
  "react-native-permissions": "^4.x",
  "react-native-document-picker": "^9.x",
  "react-native-qrcode-svg": "^6.x",
  "react-native-vision-camera": "^4.x"    // QR scanning (mobile)
}
```

**Android build config:** `compileSdk 34`, `targetSdk 34`, `minSdk 24`,
Kotlin `1.9.x`, AGP `8.x`, Gradle `8.x`. `android.enableJetifier=false`.

---

## 2. Definition of "working app" (acceptance criteria)

The build is **only done** when every box is checked **and proven by the listed
artifact** (a test, a log, or a recorded command). No box may be ticked by
"looks correct".

- [ ] `npm run lint`, `npm run type-check`, `npm test` all pass — **proof:** CI log.
- [ ] App launches on a real Android device/emulator with **zero** red-box
      errors and **zero** `console.error` — **proof:** logcat capture.
- [ ] Two devices on the same Wi-Fi discover each other in ≤ 5 s —
      **proof:** integration test + screenshot of both peer lists.
- [ ] Sending a file A→B: B receives a session request; unknown peer triggers a
      **PIN dialog**; correct PIN accepts; 3 wrong PINs reject —
      **proof:** unit test + manual e2e log.
- [ ] File arrives **byte-identical**; streaming SHA-256 verifies; a killed
      transfer **resumes** from the last committed chunk — **proof:** e2e test
      that truncates then resumes.
- [ ] Both sides show **live progress** (name, %, speed, ETA) —
      **proof:** widget test + screenshot.
- [ ] A **LocalSend app** on the same network sends to LocalShare and vice-versa
      (v2.2 interop) — **proof:** integration test hitting real HTTP routes.
- [ ] `.apk` builds via `build_release.ps1`; iOS builds via `expo run:ios` —
      **proof:** build artifacts exist.

---

## 3. Anti-Fake Contract (MOST IMPORTANT SECTION)

The agent is **forbidden** from the following. Any violation fails the task.

### 3.1 Forbidden patterns (hard fail)

1. **No placeholder implementations.** No `// TODO`, `// FIXME`,
   `throw new Error('not implemented')`, `return null` as a stand-in for real
   logic, or empty function bodies in shipped code paths.
2. **No fake/mock data in the app.** No hardcoded peer lists, no hardcoded
   "transfer complete", no simulated progress bars driven by `setInterval`, no
   `setTimeout` pretending a network call happened.
3. **No stubbed native modules.** Every Kotlin module must do the real OS work
   (real `NsdManager`, real `BLE`, real sockets, real `ForegroundService`). No
   returning canned values.
4. **No mocks in integration/e2e tests.** Unit tests may mock *interfaces at the
   boundary* (e.g. a clock) **only** with an inline justification comment.
   Transport, discovery, and crypto must be exercised with **real sockets, real
   mDNS, real files**.
5. **No "demo mode" flags** that make the UI look done while the engine is
   inert. If a feature is not implemented, it must be **visibly absent or
   disabled**, never faked.
6. **No swallowed errors.** `catch (e) {}` is banned. Every catch must either
   handle, rethrow with context, or log-and-surface.
7. **No `console.log` as a substitute for state.** UI must read real state, not
   log it.
8. **No dead code paths presented as working.** If a function is unreachable or
   untested, delete it or mark it explicitly with an issue link.

### 3.2 Required proof for every claim

For **every** feature the agent reports as done, it must attach:

- The **exact command** run, and its **real output** (not paraphrased).
- The **test name** that proves it, and that the test **fails if the feature is
  removed** (the agent must demonstrate this at least once per critical path by
  temporarily breaking it — a "mutation check").
- For UI features: a **screenshot or recording** from a real device/emulator.
- For network features: a **packet/log trace** showing real traffic (e.g.
  `tcpdump`, `adb logcat`, or the server access log).

### 3.3 The "unimplemented is visible" rule

If any part is genuinely blocked (missing hardware, missing API), the agent must:

1. Leave the code path **absent or throwing a typed, user-visible error** — never
   silently faking success.
2. Add a row to `BLOCKED.md` with: what is blocked, why, what was tried, and
   what would unblock it.
3. Report it in the final summary. **Silence about a gap = failure.**

### 3.4 Self-audit before "done"

Before declaring completion, the agent must run and paste the result of:

```bash
# 1. Prove no fake markers in shipped source
grep -rnE "TODO|FIXME|not implemented|mock|fake|dummy|placeholder" \
  src/ nodejs-assets/ android/app/src/main/java/ \
  --include=*.js --include=*.jsx --include=*.kt | grep -v "// justified:"

# 2. Prove no swallowed errors
grep -rnE "catch\s*\([^)]*\)\s*\{\s*\}" src/ android/app/src/main/java/

# 3. Prove tests actually run (not skipped)
npm test -- --ci --verbose | grep -E "skipped|todo"
```

If any of these return a violation that is not explicitly justified, the build
is **not** done.

---

## 4. Repository layout (create exactly this)

```
index.js                          # registerRootComponent(App)
App.js                            # providers + NavigationContainer
app.json / app.config.js          # Expo config (name, android/ios, plugins)
tsconfig.json                     # checkJs only — NO .ts files
build_release.ps1                 # Windows release build
nodejs-assets/
  nodejs-project/
    main.js                       # embedded Node entry
    torrent-gateway.js            # (existing adm-style) → reuse pattern
    transfer-gateway.js           # LocalShare transfer server (Node)
    localsend-gateway.js          # LocalSend v2.2 HTTP server (Node)
    protocol.js                   # wire constants shared with JS side
    package.json                  # Node deps (shelf-equivalent: express/ws)
src/
  navigation/
    AppNavigator.js               # stack + tabs
  screens/
    DevicesScreen.js
    ShareHubScreen.js
    TransfersScreen.js
    ReceivedScreen.js
    SettingsScreen.js
    PermissionsScreen.js
    RadarScreen.js
  components/
    RadarView.js
    PeerCard.js
    TransferTile.js
    GlassCard.js
    PinDialog.js
    QueueList.js
    EmptyState.js
  engine/
    LocalShareNode.js             # JS facade over native + node
    EngineEvents.js               # typed event emitter
    providers.js                  # React context/state wiring
    sendController.js
    receiveController.js
    trustStore.js                 # AsyncStorage-backed TOFU store
    pairing.js                    # PIN challenge logic (JS mirror)
  utils/
    byteFormat.js
    deviceName.js
    errors.js
    logger.js                     # real logger, no console.log-as-state
  native/
    NativeBridge.js               # thin wrapper over NativeModules
    NativeEvents.js               # NativeEventEmitter subscriptions
android/app/src/main/java/com/rohan/localshare/
  MainApplication.kt
  MainActivity.kt
  transfer/
    TransferServerModule.kt       # OkHttp/Conscrypt HTTPS server + pinning
    TransferClientModule.kt
    ChunkEngine.kt                # chunked read/write + resume
  discovery/
    NsdDiscoveryModule.kt         # android.net.nsd.NsdManager
    BleDiscoveryModule.kt         # BLE advertise/scan
  service/
    TransferForegroundService.kt  # keeps transfers alive in background
  crypto/
    EphemeralCertModule.kt        # per-session self-signed cert + fingerprint
    HashingModule.kt              # streaming SHA-256
  storage/
    StorageModule.kt
  util/
    PinModule.kt                  # 6-digit PIN + constant-time compare
test/
  unit/                           # Jest
  integration/                    # Jest, real sockets (node side + RN bridge)
  android/                        # Kotlin JUnit (android/app/src/test)
e2e/                              # Detox specs
.github/workflows/ci.yml
```

---

## 5. Architecture (three cooperating layers)

```
┌───────────────────────────────────────────────────────────────┐
│  React Native UI (JS/JSX)  —  src/screens, src/components      │
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

- **Kotlin** owns anything the OS must do natively: the **pinned TLS** server
  (OkHttp + Conscrypt, custom `X509TrustManager`), **mDNS** via `NsdManager`,
  **BLE** via `BluetoothLeAdvertiser`/`BluetoothLeScanner`, the
  **`ForegroundService`** that keeps transfers alive, ephemeral **cert**
  generation (`KeyPairGenerator` + `CertAndKeyGen`), and streaming **SHA-256**
  (`MessageDigest`).
- **Embedded Node.js** (nodejs-mobile) runs the **LocalSend v2.2 plain-HTTP
  server** on port `53317` and a **control WebSocket** to the RN UI. This mirrors
  the `adm` project's `torrent-gateway.js` pattern.
- **JS engine facade** (`LocalShareNode.js`) exposes `start()`, `stop()`,
  `send(peer, files)`, `peers`, and an event stream, and routes LocalSend peers
  to the Node gateway.

---

## 6. Wire protocol (native, TLS) — implement exactly

Constants (`nodejs-assets/nodejs-project/protocol.js` **and** mirrored in
`src/utils/` — single source of truth, imported everywhere):

```js
module.exports = {
  kProtocolVersion: 1,
  kControlProtocolVersion: 1,
  kMdnsServiceType: '_localshare._tcp',
  kMdnsServiceNamePrefix: 'LocalShare-',
  kBleServiceUuid: '6c4c6f63-616c-7368-6172-652d-30303031',
  kDefaultPort: 53318,              // distinct from LocalSend 53317
  kDefaultChunkSize: 1024 * 1024,
  kMaxChunkSize: 16 * 1024 * 1024,
  kHeaderDeviceId: 'x-localshare-device-id',
  kHeaderDeviceName: 'x-localshare-device-name',
  kHeaderFingerprint: 'x-localshare-fingerprint',
  kHeaderSessionId: 'x-localshare-session-id',
  kPartialSuffix: '.localshare.part',
};
```

Routes served over HTTPS by `TransferServerModule.kt`:

| Method | Path                  | Body / Headers | Response |
|--------|-----------------------|----------------|----------|
| POST   | `/v1/session`         | `SessionRequest` (has `pin` for unknown peers) | `SessionResponse{accepted, resume}` |
| PUT    | `/v1/chunk`           | chunk bytes; headers `sessionId`, `fileId`, `offset` | `ChunkAck{received}` |
| POST   | `/v1/file/commit`     | `CommitRequest{sha256,lastChunk}` | `CommitResponse{verified}` |
| POST   | `/v1/cancel`          | `{sessionId}` | `{ok}` |
| GET    | `/v1/info`            | — | identity probe |
| GET    | `/v1/files`           | — | paired-peer file browse |
| GET    | `/v1/files/download`  | `?path=` | file bytes |

Models (JS): `DeviceInfo`, `RemoteFileEntry`, `FileDescriptor`,
`SessionRequest`, `SessionResponse`, `ChunkAck`, `CommitRequest`,
`CommitResponse`. Each has `toJSON()`/`fromJSON()` and **must round-trip in a
unit test**.

**Do not change `kProtocolVersion`, `kLocalSendPort` (53317), the wire models,
or the TLS/pinning flow without an explicit migration note in the PR.**

---

## 7. Security model — implement exactly

1. **Ephemeral certificate** (`EphemeralCertModule.kt`): generate a fresh
   self-signed cert **per app session**; expose SHA-256 fingerprint to JS.
   Never reuse a key across restarts.
2. **Certificate pinning** (`TransferClientModule.kt`): accept a peer cert
   **only** if its fingerprint matches the advertised one or the trust store.
   Mismatch = hard failure, surfaced to UI as `TrustMismatchError`.
3. **TOFU trust store** (`src/engine/trustStore.js`): AsyncStorage map
   `deviceId -> fingerprint`. Backed by an injectable `TrustPersistence`
   interface so tests can use an in-memory impl.
4. **Pairing** (`src/engine/pairing.js`):
   - `PairingSettings{ autoAcceptTrusted: true, autoAcceptAll: false }`.
   - `evaluate(deviceId, fingerprint, pin)` → `accept` | `challenge(pin)` |
     `reject(reason)`.
   - Trusted → accept. Unknown + `autoAcceptAll` → accept. Unknown otherwise →
     challenge with fresh 6-digit PIN.
   - **3 wrong PINs → `reject('too_many_attempts')`.** Counter is per-device and
     resets on success.
   - `onChallenge` fires a `PinChallengeRequested` event → `PinDialog.js`.
5. **Integrity**: streaming SHA-256 computed while writing; compared at commit.
   Files land as `*.localshare.part`, renamed only after verification.
6. **Constant-time PIN compare** (`PinModule.kt`).

---

## 8. Discovery — implement exactly

`src/engine/LocalShareNode.js` merges sightings into one deduped peer list:

- **mDNS/DNS-SD** via Kotlin `NsdDiscoveryModule.kt`
  (`android.net.nsd.NsdManager`), advertising `_localshare._tcp` with TXT
  records `deviceId`, `displayName`, `fingerprint`, `platform`, `port`.
  On iOS, use `react-native-zeroconf` / `Bonjour`. On desktop, use
  `react-native-zeroconf` (or a Node `mdns` addon).
- **BLE** via `BleDiscoveryModule.kt` (advertise a 128-bit UUID with a compact
  payload; scan for it). Gate BLE to Android/iOS/macOS/Windows.
- **Staleness sweep**: drop peers unseen for `kPeerStaleMs` (default 15000).
- **Dedup key**: `deviceId`; merge addresses, prefer freshest sighting.
- **Manual add**: user types `ip:port` + fingerprint → `DiscoveryChannel.manual`.

`DiscoveryChannel` enum: `mdns`, `ble`, `manual`, `unknown`.

---

## 9. LocalSend v2.2 interop — implement exactly

LocalSend peers can't do our pinned TLS, so the **embedded Node gateway** runs a
**separate plain-HTTP listener** on port **53317** (`localsend-gateway.js`):

| Method | Path |
|--------|------|
| GET    | `/api/localsend/v2/info` |
| POST   | `/api/localsend/v2/register` |
| POST   | `/api/localsend/v2/prepare-upload` |
| POST   | `/api/localsend/v2/upload` |
| POST   | `/api/localsend/v2/cancel` |

Also join multicast `224.0.0.167` and advertise/browse `_localsend._tcp` so
LocalSend apps appear as `platform: localsend` peers.

Routing: `LocalShareNode.send()` inspects `DeviceInfo.platform`; for
`'localsend'`/`'localsend-https'` it calls `_sendLocalSend`, reusing the same
PIN-prompt flow. **Do not break LocalSend interop** when touching the native
path.

---

## 10. UI — build exactly this

`AppNavigator.js`: bottom tabs on phones, and a rail/side layout on tablets/TV
(TV = D-pad focusable).

Screens:
- **DevicesScreen** — live peer list; self-device card (real device icon, not
  hardcoded); manual add; QR card showing your own `{ip, port, fingerprint}`.
- **ShareHubScreen** — file picker, staging queue, send button; drop-to-send on
  a peer card (desktop).
- **TransfersScreen** — outgoing `TransferTile` (name, %, speed, ETA) with
  **cancel + retry**; **incoming progress must also render here**.
- **ReceivedScreen** — received files with open/reveal.
- **SettingsScreen** — pairing policy, storage dir, concurrency, chunk size,
  low-power mode, theme.
- **RadarScreen** — animated radar; throttle when idle, pause when backgrounded,
  honour reduced-motion.

Components must read **real engine state** via `src/engine/providers.js`. No
component may fabricate progress.

---

## 11. Native module contract (Kotlin ↔ JS)

Every Kotlin module is a `ReactContextBaseJavaModule` exposing:

- **Methods** (`@ReactMethod`) returning a `Promise` — resolve with real data or
  reject with a typed error.
- **Events** via `RCTDeviceEventEmitter` with a documented payload schema.

Required modules and their real responsibilities:

| Module | Real work | Events emitted |
|--------|-----------|----------------|
| `EphemeralCertModule` | generate per-session cert, return fingerprint | — |
| `HashingModule` | streaming SHA-256 over a file path | `HashingProgress` |
| `PinModule` | generate PIN, constant-time compare | — |
| `NsdDiscoveryModule` | `NsdManager` register + discover | `PeerFound`, `PeerLost` |
| `BleDiscoveryModule` | BLE advertise + scan | `BlePeerFound` |
| `TransferServerModule` | OkHttp/Conscrypt HTTPS server, pinning | `IncomingSession`, `ReceiveProgress`, `FileReceived` |
| `TransferClientModule` | pinned HTTPS client, chunk upload | `SendProgress`, `SendFinished`, `SendFailed` |
| `TransferForegroundService` | Android `Service`, notification, wake lock | `ServiceState` |
| `StorageModule` | SAF/scoped-storage paths | — |

**A module that returns canned data instead of doing the OS work is a hard
failure** (see §3.1.3).

---

## 12. Testing strategy (mandatory, no shortcuts)

### 12.1 Unit (Jest) — `test/unit/`
- Protocol model round-trips (every model, every optional field).
- `pairing.evaluate`: trusted→accept, unknown→challenge, `autoAcceptAll`→accept,
  3 wrong→`reject('too_many_attempts')`, success resets counter.
- `trustStore`: TOFU insert, lookup, mismatch detection.
- `byteFormat`, `deviceName`, error mapping.

### 12.2 Integration (Jest, **real sockets**) — `test/integration/`
- Start the real Node transfer gateway on `127.0.0.1:0`; connect a real client;
  send a multi-chunk file; assert **bytes equal** and SHA-256 verified.
- **Resume test**: kill the connection mid-file; reconnect; assert the server
  reports the correct `resume` offset and the file completes.
- **LocalSend interop**: real HTTP requests against `/api/localsend/v2/*`;
  assert a file lands verified.
- **Pinning test**: a client presenting the wrong cert fingerprint is rejected.

### 12.3 Kotlin (JUnit) — `android/app/src/test/`
- `ChunkEngine`: chunk boundaries, last partial chunk, offset math.
- `PinModule`: constant-time compare correctness.
- `EphemeralCertModule`: fingerprint stability within a session, differs across
  sessions.

### 12.4 E2E (Detox) — `e2e/`
- Launch app → permissions gate → devices screen renders.
- Fake peer injected **through the real discovery stream** (a real second
  instance in CI, not a mock) → send a real temp file → assert received.

### 12.5 Mutation checks (proves tests are real)
For each critical path (pinning, PIN reject, resume, SHA verify), the agent must
**temporarily break the implementation**, confirm the corresponding test **fails**,
then restore it and confirm it **passes**. Paste both runs in the PR.

---

## 13. Roadmap (do it in this exact order; commit per step)

**Phase 0 — Scaffold (day 0)**
1. `npx create-expo-app localshare --template blank` → strip to `index.js` /
   `App.js` / `src/` layout (§4).
2. Add navigation, screens as empty-but-rendering shells (real components, not
   placeholders that lie — they show a real `EmptyState`).
3. Wire `eslint`, `jest`, `tsc --noEmit` (checkJs), CI skeleton.

**Phase 1 — Crypto + protocol**
4. `EphemeralCertModule.kt`, `HashingModule.kt`, `PinModule.kt`.
5. `protocol.js` + all wire models with round-trip tests.

**Phase 2 — Transport**
6. `ChunkEngine.kt`, `TransferServerModule.kt`, `TransferClientModule.kt`.
7. Real-socket integration tests incl. **resume** and **pinning**.

**Phase 3 — Session**
8. `trustStore.js`, `pairing.js` + full PIN test matrix.

**Phase 4 — Discovery**
9. `NsdDiscoveryModule.kt`, `BleDiscoveryModule.kt`, orchestrator merge +
   staleness/dedup tests.

**Phase 5 — Facade + UI**
10. `LocalShareNode.js` + `providers.js` + event wiring.
11. Devices → Share Hub → Transfers → Received → Settings; radar; PIN dialog;
    live send/receive progress.

**Phase 6 — LocalSend interop**
12. `localsend-gateway.js` + interop integration test.

**Phase 7 — Background + platform**
13. `TransferForegroundService.kt`, Android manifest, permissions, TV Leanback,
    iOS plist (`NSLocalNetworkUsageDescription`, `NSBonjourServices`).

**Phase 8 — Packaging + CI**
14. `build_release.ps1`, `.github/workflows/ci.yml`, icons.

**Rule:** after every phase, all of `lint`, `type-check`, `test` must be green,
and the phase's acceptance boxes ticked with proof (§3.2).

---

## 14. CI — `.github/workflows/ci.yml`

```yaml
name: CI
on: [push, pull_request]
jobs:
  js:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 18, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
      - run: npm test -- --ci
      - run: npm run test:integration -- --ci
  android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: 17 }
      - run: cd android && ./gradlew test lint assembleDebug
  anti-fake:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Guard against fake code
        run: |
          ! grep -rnE "TODO|FIXME|not implemented|placeholder" \
            src/ nodejs-assets/ android/app/src/main/java/ \
            --include=*.js --include=*.jsx --include=*.kt \
            | grep -v "// justified:"
```

The `anti-fake` job **must** fail the build if fake markers appear.

---

## 15. Platform notes — must handle

- **Android**: `NsdManager` for mDNS; `BLE` needs `BLUETOOTH_SCAN/ADVERTISE/
  CONNECT` (`neverForLocation`) + legacy `BLUETOOTH*`/`ACCESS_FINE_LOCATION`
  (maxSdk 32); `NEARBY_WIFI_DEVICES`. Foreground service for transfers.
  Leanback launcher + `android.software.leanback` for Android TV. Modern Android
  cannot set SoftAP SSID/passphrase programmatically — read system credentials.
- **iOS**: `NSLocalNetworkUsageDescription`, `NSBonjourServices`
  (`_localshare._tcp`), Bluetooth usage strings. **iOS can never create a
  SoftAP.**
- **Desktop**: `react-native-zeroconf` / Node `mdns`; set a minimum window size;
  remember window state; optional tray to keep receiving in background.
- **Permissions** at runtime via `react-native-permissions`, gated by a
  `PermissionsScreen` before the engine starts.
- **`react-native-fs`** paths must fall back to a temp dir when a documents dir
  is unavailable (headless/desktop).

---

## 16. Final report format (agent must produce this)

1. **Acceptance checklist** (§2): each item marked done/blocked with the
   command/test/screenshot that proves it.
2. **Commands run** and their **real output** (lint, type-check, test,
   integration, gradle, e2e, build).
3. **Anti-fake self-audit** (§3.4) output — pasted verbatim.
4. **Mutation checks** (§12.5) — the "break it / test fails / restore / test
   passes" evidence for each critical path.
5. **`BLOCKED.md`** contents (or "none").
6. **New dependencies** added and why.
7. **Anything unverified** and why.

---

## 17. Copy-paste master prompt (short form)

> Build **LocalShare**, a serverless cross-platform local file sharing app, from
> scratch, using **React Native + Expo (JavaScript/JSX only — no TypeScript),
> Kotlin Android native modules, and an embedded Node.js gateway** — the same
> stack as the `adm` project. Entry chain: `index.js` → `App.js` →
> `src/navigation/AppNavigator.js`. Read this whole spec first. **Obey the
> Anti-Fake Contract (§3): no placeholders, no mock/fake data, no stubbed native
> modules, no mocks in integration tests, no swallowed errors, no demo flags.**
> Implement the native TLS protocol (§6), the security model (§7), discovery
> (§8), LocalSend v2.2 interop (§9), the `LocalShareNode.js` facade (§10), the
> adaptive UI, and all native modules (§11). Follow the roadmap order (§13).
> Keep `npm run lint`, `npm run type-check`, `npm test`, and
> `npm run test:integration` green after every phase. Every claim needs proof
> (§3.2) and mutation checks (§12.5). Do not change `kProtocolVersion`, port
> 53317, the wire models, or the TLS/pinning flow without a migration note.
> Finish with the report in §16.
