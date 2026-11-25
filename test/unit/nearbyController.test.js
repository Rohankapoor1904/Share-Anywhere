const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { NearbyController, NEARBY_AUTH_EVENT } = require('../../src/engine/nearbyController');
const { EngineEventEmitter, EngineEventType } = require('../../src/engine/EngineEvents');
const { TrustStore, InMemoryTrustPersistence } = require('../../src/engine/trustStore');
const { PairingEngine } = require('../../src/engine/pairing');
const { DeviceInfo } = require('../../src/engine/models');
const { encodeControl } = require('../../src/engine/nearbyProtocol');
const {
  PairingRejectedError,
  TransferCancelledError,
  IntegrityCheckFailedError
} = require('../../src/utils/errors');
const { createLoopbackLink, sha256File } = require('../helpers/nearbyLoopback');

const ALL_EVENTS = [...Object.values(EngineEventType), NEARBY_AUTH_EVENT];

function buildPhone(name, transport) {
  const events = new EngineEventEmitter();
  const trustStore = new TrustStore(new InMemoryTrustPersistence());
  const pairing = new PairingEngine(trustStore, { autoAcceptTrusted: true, autoAcceptAll: false });
  const selfDevice = new DeviceInfo({
    deviceId: `phone-${name}`,
    displayName: `Phone ${name}`,
    platform: 'android',
    fingerprint: `FP-${name}`
  });
  const log = [];
  for (const type of ALL_EVENTS) {
    events.on(type, (data) => log.push({ type, data }));
  }
  const controller = new NearbyController({ events, pairing, trustStore, selfDevice, transport });
  return { events, pairing, controller, log, of: (type) => log.filter((e) => e.type === type).map((e) => e.data) };
}

function waitFor(predicate, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error('Timed out waiting for condition'));
      return setTimeout(tick, 5);
    };
    tick();
  });
}

function visibleFiles(dir) {
  return fs.readdirSync(dir).filter((name) => !name.startsWith('.'));
}

describe('NearbyController end-to-end over a loopback link (real files, real SHA-256)', () => {
  let root;
  let srcDir;
  let dirA;
  let dirB;
  let link;
  let phoneA;
  let phoneB;

  const writeSource = (name, bytes) => {
    const filePath = path.join(srcDir, name);
    fs.writeFileSync(filePath, crypto.randomBytes(bytes));
    return { name, size: bytes, path: filePath };
  };

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-nearby-'));
    srcDir = path.join(root, 'src');
    dirA = path.join(root, 'A');
    dirB = path.join(root, 'B');
    [srcDir, dirA, dirB].forEach((d) => fs.mkdirSync(d));
    link = createLoopbackLink(dirA, dirB);
    phoneA = buildPhone('A', link.a);
    phoneB = buildPhone('B', link.b);
    for (const phone of [phoneA, phoneB]) {
      await phone.controller.checkSupport();
      await phone.controller.startDiscovery();
    }
    await waitFor(() => phoneA.controller.hasEndpoint('EP-B') && phoneB.controller.hasEndpoint('EP-A'));
  });

  afterEach(async () => {
    await phoneA.controller.stop();
    await phoneB.controller.stop();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const peerB = { deviceId: 'phone-B', endpointId: 'EP-B', transport: 'nearby' };

  test('discovery reports each phone with its advertised identity', () => {
    const epB = phoneA.controller.endpoints.get('EP-B');
    expect(epB.deviceId).toBe('phone-B');
    expect(epB.displayName).toBe('Phone B');
  });

  test('approved transfer delivers byte-identical files and both sides see the same code', async () => {
    phoneB.events.on(EngineEventType.PIN_CHALLENGE_REQUESTED, (challenge) => {
      phoneB.controller.respondToOffer(challenge.sessionId, true);
    });
    const one = writeSource('holiday.jpg', 300 * 1024 + 17);
    const two = writeSource('notes.txt', 1234);

    await phoneA.controller.send(peerB, [one, two]);

    const [challenge] = phoneB.of(EngineEventType.PIN_CHALLENGE_REQUESTED);
    expect(challenge.mode).toBe('approve');
    expect(challenge.transport).toBe('nearby');
    expect(challenge.displayName).toBe('Phone A');
    expect(challenge.files.map((f) => f.fileName)).toEqual(['holiday.jpg', 'notes.txt']);
    const senderAuth = phoneA.of(NEARBY_AUTH_EVENT).find((a) => !a.isIncoming);
    expect(challenge.authDigits).toMatch(/^\d{4}$/);
    expect(challenge.authDigits).toBe(senderAuth.authDigits);

    const received = phoneB.of(EngineEventType.TRANSFER_COMPLETED);
    expect(received).toHaveLength(2);
    for (const [index, source] of [one, two].entries()) {
      expect(received[index].direction).toBe('receive');
      expect(received[index].file.name).toBe(source.name);
      expect(await sha256File(received[index].file.path)).toBe(await sha256File(source.path));
    }
    expect(visibleFiles(dirB).sort()).toEqual(['holiday.jpg', 'notes.txt']);

    expect(phoneA.of(EngineEventType.TRANSFER_COMPLETED)).toEqual([
      expect.objectContaining({ direction: 'send' })
    ]);
    const sendProgress = phoneA.of(EngineEventType.TRANSFER_PROGRESS);
    expect(sendProgress.length).toBeGreaterThan(1);
    expect(sendProgress[sendProgress.length - 1].transferredBytes).toBe(two.size);
    expect(phoneB.of(EngineEventType.TRANSFER_PROGRESS).some((p) => p.direction === 'receive')).toBe(true);
  });

  test('declined offer rejects the send and writes nothing', async () => {
    phoneB.events.on(EngineEventType.PIN_CHALLENGE_REQUESTED, (challenge) => {
      phoneB.controller.respondToOffer(challenge.sessionId, false);
    });
    const src = writeSource('secret.pdf', 4096);

    await expect(phoneA.controller.send(peerB, [src])).rejects.toBeInstanceOf(PairingRejectedError);
    expect(visibleFiles(dirB)).toEqual([]);
    expect(phoneA.of(EngineEventType.TRANSFER_FAILED)).toHaveLength(1);
    expect(link.a.calls).not.toContain('prepareFile');
  });

  test('autoAcceptAll skips the prompt', async () => {
    phoneB.pairing.updateSettings({ autoAcceptAll: true });
    const src = writeSource('auto.bin', 2048);
    await phoneA.controller.send(peerB, [src]);
    expect(phoneB.of(EngineEventType.PIN_CHALLENGE_REQUESTED)).toHaveLength(0);
    expect(visibleFiles(dirB)).toEqual(['auto.bin']);
  });

  test('a corrupted file fails verification on both sides and is deleted', async () => {
    phoneB.pairing.updateSettings({ autoAcceptAll: true });
    link.link.corruptNext = true;
    const src = writeSource('video.mp4', 200 * 1024);

    await expect(phoneA.controller.send(peerB, [src])).rejects.toBeInstanceOf(IntegrityCheckFailedError);
    await waitFor(() => phoneB.of(EngineEventType.TRANSFER_FAILED).length === 1);
    expect(phoneB.of(EngineEventType.TRANSFER_COMPLETED)).toHaveLength(0);
    expect(visibleFiles(dirB)).toEqual([]);
    expect(link.b.calls).toContain('deleteSavedFile');
  });

  test('bytes that arrive before their fileStart are held and then saved', async () => {
    phoneB.pairing.updateSettings({ autoAcceptAll: true });
    // Control messages lag behind FILE payloads, so the file lands as an orphan first.
    link.link.controlDelayMs = 40;
    const src = writeSource('race.bin', 8192);
    await phoneA.controller.send(peerB, [src]);
    expect(visibleFiles(dirB)).toEqual(['race.bin']);
    expect(await sha256File(path.join(dirB, 'race.bin'))).toBe(await sha256File(src.path));
  });

  test('a FILE payload outside any approved transfer is cancelled and never saved', async () => {
    await phoneA.controller._ensureConnected('EP-B');
    const src = writeSource('malware.apk', 4096);
    const prep = await link.a.prepareFile(src.path);
    await link.a.sendControl('EP-B', encodeControl({
      t: 'fileStart',
      sessionId: 'nb-rogue-1',
      fileId: 'f-1',
      payloadId: prep.payloadId
    }));
    await link.a.sendPreparedFile('EP-B', prep.payloadId);

    await waitFor(() => link.b.calls.includes('cancelPayload'));
    await waitFor(() => link.a.inflight.size === 0);
    expect(link.b.calls).not.toContain('saveReceivedFile');
    expect(visibleFiles(dirB)).toEqual([]);
    expect(phoneB.of(EngineEventType.TRANSFER_COMPLETED)).toHaveLength(0);
  });

  test('sender cancel mid-transfer stops both sides', async () => {
    phoneB.pairing.updateSettings({ autoAcceptAll: true });
    link.link.chunkDelayMs = 5;
    const src = writeSource('big.iso', 4 * 1024 * 1024);
    phoneA.events.on(EngineEventType.TRANSFER_PROGRESS, (progress) => {
      if (progress.direction === 'send' && progress.transferredBytes > 0) {
        phoneA.controller.cancelSession(progress.sessionId);
      }
    });

    await expect(phoneA.controller.send(peerB, [src])).rejects.toBeInstanceOf(TransferCancelledError);
    expect(phoneA.of(EngineEventType.TRANSFER_CANCELLED)).toHaveLength(1);
    await waitFor(() => phoneB.of(EngineEventType.TRANSFER_CANCELLED).length === 1);
    await waitFor(() => link.a.inflight.size === 0);
    expect(visibleFiles(dirB)).toEqual([]);
    expect(phoneA.of(EngineEventType.TRANSFER_FAILED)).toHaveLength(0);
  });

  test('losing the link mid-transfer fails the session on both sides', async () => {
    phoneB.pairing.updateSettings({ autoAcceptAll: true });
    link.link.chunkDelayMs = 5;
    const src = writeSource('movie.mkv', 4 * 1024 * 1024);
    let dropped = false;
    phoneB.events.on(EngineEventType.TRANSFER_PROGRESS, (progress) => {
      if (!dropped && progress.direction === 'receive' && progress.transferredBytes > 0) {
        dropped = true;
        link.b.disconnect('EP-A');
      }
    });

    await expect(phoneA.controller.send(peerB, [src])).rejects.toThrow(/lost|could not deliver/i);
    await waitFor(() => phoneB.of(EngineEventType.TRANSFER_FAILED).length === 1);
    expect(visibleFiles(dirB)).toEqual([]);
  });

  test('sending to an endpoint that is out of range fails cleanly', async () => {
    await expect(
      phoneA.controller.send({ deviceId: 'ghost', endpointId: 'EP-Z', transport: 'nearby' }, [writeSource('x.bin', 10)])
    ).rejects.toThrow('no longer in range');
    expect(phoneA.of(EngineEventType.TRANSFER_FAILED)).toHaveLength(1);
  });
});
