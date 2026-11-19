const { ReceiveController } = require('../../src/engine/receiveController');
const { EngineEventEmitter, EngineEventType } = require('../../src/engine/EngineEvents');
const { TrustStore, InMemoryTrustPersistence } = require('../../src/engine/trustStore');
const { PairingEngine } = require('../../src/engine/pairing');

describe('ReceiveController Incoming Session Tests (§6, §8)', () => {
  function buildController() {
    const events = new EngineEventEmitter();
    const trustStore = new TrustStore(new InMemoryTrustPersistence());
    const pairing = new PairingEngine(trustStore, {
      autoAcceptTrusted: true,
      autoAcceptAll: false
    });
    const controller = new ReceiveController({ events, trustStore, pairing });
    return { events, trustStore, pairing, controller };
  }

  test('Accepts a native Android { sessionId, rawJson } payload without crashing', async () => {
    const { events, trustStore, controller } = buildController();
    await trustStore.trust('sender-device-1', 'FP-SENDER');

    const rawJson = JSON.stringify({
      sessionId: 'sess-native-1',
      sender: {
        deviceId: 'sender-device-1',
        displayName: 'PC Host',
        address: '192.168.1.20',
        port: 53318,
        fingerprint: 'FP-SENDER',
        platform: 'desktop'
      },
      files: [
        { fileId: 'f-1', fileName: 'photo.jpg', fileSize: 2048, mimeType: 'image/jpeg', sha256: 'abc' }
      ],
      pin: null
    });

    let queued = null;
    events.on(EngineEventType.TRANSFER_QUEUED, (t) => { queued = t; });

    const result = await controller.handleIncomingSession({ sessionId: 'sess-native-1', rawJson });

    expect(result.accepted).toBe(true);
    expect(queued).not.toBeNull();
    expect(queued.direction).toBe('receive');
    expect(queued.fileName).toBe('photo.jpg');
    expect(queued.totalBytes).toBe(2048);
  });

  test('Rejects malformed rawJson instead of throwing', async () => {
    const { controller } = buildController();
    const result = await controller.handleIncomingSession({ sessionId: 'bad', rawJson: '{not-json' });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('invalid_payload');
  });

  test('Rejects a session with no sender device id instead of crashing', async () => {
    const { controller } = buildController();
    const result = await controller.handleIncomingSession({ sessionId: 'no-sender', files: [] });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('invalid_payload');
  });

  test('Still accepts a pre-parsed PC session object', async () => {
    const { trustStore, controller } = buildController();
    await trustStore.trust('pc-device', 'FP-PC');

    const result = await controller.handleIncomingSession({
      sessionId: 'sess-pc-1',
      sender: { deviceId: 'pc-device', fingerprint: 'FP-PC', displayName: 'PC', port: 53318 },
      files: [{ fileId: 'f-1', fileName: 'doc.pdf', fileSize: 10, sha256: 'x' }]
    });

    expect(result.accepted).toBe(true);
  });
});
