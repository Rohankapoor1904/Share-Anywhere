# Offline Sharing (no shared Wi-Fi)

LocalShare normally moves files over HTTP on a shared Wi-Fi/LAN. This document covers the two
ways it works without one.

| Pair | Transport | Status |
|---|---|---|
| Android ↔ Android | Google Nearby Connections (BLE discovery → Bluetooth bootstrap → Wi-Fi Direct / hotspot / LAN upgrade) | Implemented (2026-11-25) |
| Android ↔ Windows PC | BLE bootstrap + Android Local-Only Hotspot, then the existing HTTP protocol | Implemented (2026-11-25) |

---

## 1. Android ↔ Android: Nearby Connections

### Layers

```
DevicesScreen / ShareHub / TransfersScreen   (unchanged: same peers, same TRANSFER_* events)
            │
LocalShareNode ── peer merge, stale sweep, cancel/approve routing
   ├─ SendController.send()  ── peer.transport === 'nearby' → NearbyController.send()
   └─ NearbyController       ── session state machine, approval, SHA-256 verification
            │  (injected transport)
src/native/NearbyTransport.js → NativeBridge.nearby* / NativeEvents.subscribeNearby
            │
android/.../nearby/NearbyModule.kt ── ConnectionsClient (P2P_POINT_TO_POINT, SERVICE_ID com.rohan.localshare)
```

`NearbyModule` only moves bytes: advertise/discover, connect/accept, BYTES control messages,
FILE payloads, saving a received payload into `Downloads/LocalShare` (same folder rules as
`TransferServerModule`, then MediaStore scan). Every decision lives in JS.

### Control protocol (`src/engine/nearbyProtocol.js`)

One UTF-8 JSON object per BYTES payload (≤ 32 KiB), `{ t, v: 1, ... }`:

```
sender                                    receiver
hello {deviceId,name,fingerprint,platform}  ⇄  (both, right after connecting)
offer {sessionId,part,parts,files[]}  ──►  approval prompt (PIN_CHALLENGE_REQUESTED mode 'approve')
                                      ◄──  answer {sessionId,accepted,reason}
fileStart {sessionId,fileId,payloadId} ──►  binds the next FILE payload to a file
[FILE payload]                        ══►
fileDone {sessionId,fileId,sha256}    ──►  receiver hashes the saved file
                                      ◄──  ack {sessionId,fileId,ok,reason}
cancel {sessionId,reason}             ◄─►  either side, any time
```

- Payload ids are signed 64-bit and always travel as decimal strings (JS numbers lose precision above 2^53).
- Large offers are split into parts so each fits one BYTES payload.
- Endpoint info advertised over BLE is `{"d":deviceId,"n":name,"p":platform,"v":1}` trimmed to ≤ 120 bytes.
- Unknown fields are dropped on decode, and ids must match `[A-Za-z0-9._-]{1,128}`.

### Security

- Both phones accept the Nearby link at the transport level; **nothing is written until the receiver approves the offer.**
- The approval dialog shows Nearby's UKEY2 4-digit code (`authDigits`), and the sender gets the same code as a toast. Different codes mean the link is being intercepted.
- The identity in `hello` is a claim (there is no TLS certificate on this path), so Nearby transfers are **never** auto-accepted as "trusted". Only `autoAcceptAll` skips the prompt.
- A FILE payload that is not bound by `fileStart` to an approved session is cancelled and deleted. Bytes that arrive before their `fileStart` are held for 10 s.
- Every file is SHA-256 verified on the receiver. A mismatch deletes the file and fails both sides.

### Peer merge rule (`LocalShareNode._handlePeerSighting`)

- **Nearby only:** `transport: 'nearby'`, routed through Nearby.
- **LAN + Nearby:** stays `transport: 'lan'` (tested path, resumable). `endpointId` is kept as a fallback. A Nearby sighting does not refresh LAN liveness.
- **LAN peer goes stale but is still in Nearby range:** demoted to `transport: 'nearby'` instead of disappearing.
- **Endpoint lost:** Nearby-only peers are removed. LAN peers lose the fallback.
- **Live connection, remote files, clipboard:** these need HTTP, so `connectToPeer()` refuses Nearby-only peers with a clear message.

### Limits

- Needs Google Play Services (`GoogleApiAvailability`). Without it (Huawei/AOSP/WSA), the Settings toggle is disabled with the reason.
- No resume: an interrupted Nearby file restarts from zero. LAN keeps `.localshare.part` resume.
- Android 12 and older only find phones while the Location service is on. The Permissions screen offers a "Turn on" shortcut.

### Tests

- `test/unit/nearbyProtocol.test.js`: codec round-trips, validation, offer splitting, endpoint info.
- `test/unit/nearbyController.test.js`: end-to-end between two controllers over `test/helpers/nearbyLoopback.js`, a loopback that reproduces the NearbyModule contract with real files and real SHA-256. Covers approve, decline, auto-accept, corruption, out-of-order bytes, rogue payload, cancel, link loss and out of range.
- `test/unit/nearbyNode.test.js`: merge rules, stale fallback, routing, wire forma## 2. Android ↔ Windows PC: BLE bootstrap + Local-Only Hotspot

Nearby Connections has no Windows SDK, so the PC path reuses the existing HTTP protocol and only
solves "how do the two devices get onto one IP network". **The phone creates the hotspot**
(`WifiManager.startLocalOnlyHotspot()`: no internet needed, random SSID and password). Bluetooth
only hands its details to the PC, encrypted.

```
Phone (OfflinePcModule.kt)                    PC (renderer Web Bluetooth + engine)
1. BLE advertise SERVICE_UUID, GATT server ◄── requestDevice → chooser (main.js)
2. INFO  read  {v,d,n,p,fp,pk,nonce}        ──► POST /api/offline/begin → hello + code
3. HELLO write {v,d,n,fp,pk,nonce}          ◄── (long write; Android handles prepared writes)
4. both: ECDH → transcript → key + 6-digit code, shown on both screens
5. phone user taps Allow (always; never auto-approved)
6. startLocalOnlyHotspot → creds; STATUS notify = 2 (ready)
7. CREDS read: iv || AES-256-GCM(creds)     ──► POST /api/offline/creds → decrypt
8.                                              netsh: save current profile, add temp profile, connect
9.                                              poll http://phoneIp:53318/v1/info
10. ◄══ existing /v1/live/connect (address '' → phone uses the socket address), transfers ══►
11. Disconnect (either side) → PC deletes the temp profile, reconnects its previous Wi-Fi;
    phone releases the hotspot
```

### Wire spec (v1): `desktop/engine/offline-bootstrap.js` ↔ `android/.../bootstrap/BootstrapCrypto.kt`

| | |
|---|---|
| Service / chars | `6c4c6f63-616c-7368-6172-6500000000{10,11,12,13,14}` = service, INFO (read), HELLO (write), STATUS (read+notify, 1 byte), CREDS (read) |
| STATUS | 0 idle, 1 waiting for the phone user, 2 ready, 3 declined, 4 error |
| transcript | SHA-256("LocalShare-Bootstrap-v1" ‖ pkPhone ‖ pkPc ‖ noncePhone ‖ noncePc) |
| key / code | HKDF-SHA256(ECDH x, salt = transcript, "LocalShare creds key", 32) / uint32(HKDF(…, "LocalShare pairing code", 4)) mod 10⁶ |
| CREDS | iv(12) ‖ AES-256-GCM(JSON {ssid,pass,ip,port,sec}), AAD = transcript. Readable only by the device that wrote HELLO, and only once STATUS = 2 |

- The two implementations are locked together by fixed test vectors (same keys, nonces and IV). They appear in `test/unit/offlineBootstrap.test.js` and in `BootstrapCryptoTest.kt` (code `989846` and an identical ciphertext).
- A man-in-the-middle holding two key pairs produces two different codes. There is a test for this.

### Security decisions
- The phone user must always confirm the code. The PC's id and fingerprint in HELLO are self-declared and public, so a "trusted PC" is **not** auto-approved. This deviates from the first plan, because approving hands out network access.
- Public keys are checked to lie on the curve. GCM authenticates the credentials and binds them to this transcript.
- The temporary WLAN profile XML (it contains the password) is written owner-only and deleted right after `netsh wlan add profile`. The profile uses `connectionMode=manual`, so Windows never auto-joins it later.
- The control API stays loopback-only and token-protected, including `/api/offline/*`.

### Files
- **Android**:
  - `bootstrap/BootstrapCrypto.kt`: pure JVM
  - `bootstrap/LocalHotspot.kt`: finds the hotspot IP, excluding the station Wi-Fi addresses
  - `bootstrap/OfflinePcModule.kt`: GATT server, advertiser, hotspot lifecycle
- **Phone JS**:
  - `src/engine/pcBootstrapController.js`: state machine
  - `src/native/PcBootstrapTransport.js`
  - `LocalShareNode` methods: `startOfflinePc`, `startOfflinePcManual`, `respondOfflinePc`, `stopOfflinePc`
  - `src/components/OfflinePcSheet.js` and a header button in `DevicesScreen`
- **PC**:
  - `desktop/engine/offline-bootstrap.js`, `offline-session.js`, `wifi-join.js`
  - `/api/offline/{status,begin,creds,manual,cancel,end}` and the `offline_state` SSE event in `desktop-node.js`
  - `select-bluetooth-device` chooser (`main.js`, `preload.js`)
  - modal in `public/index.html`, `app.js`, `style.css`
- **Firewall**: `scripts/allow_firewall.ps1` (`npm run pc:firewall`) adds inbound TCP 53317–53318 for all profiles. The hotspot is a "Public" network; without the rule, phone→PC sends and clipboard sync are blocked, while PC→phone still works.

### Fallback: PC without Bluetooth
Phone: "PC has no Bluetooth" shows the SSID, password and `ip:port`. PC: "Enter details" → `/api/offline/manual`, which uses the same join. In this mode the user's eyes carry the secret.

### Limits / risks
- Windows only for the automatic join (`netsh`).
- Windows 11 24H2 needs Location permission for `netsh wlan`. This is detected, and the UI offers "Open Location settings".
- `parseInterfaces` reads English netsh labels. On other display languages the adapter name may not be found, and the default adapter is used.
- Electron Web Bluetooth plus Windows long GATT read/write must be verified on real hardware.
- The PC has no internet while on the hotspot (said in the UI).
