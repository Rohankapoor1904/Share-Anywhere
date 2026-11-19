const { DesktopEngine } = require('../../desktop/engine/desktop-node');

describe('DesktopEngine Self-Discovery Filter Tests (§8)', () => {
  let engine;

  beforeEach(() => {
    engine = new DesktopEngine();
    engine.peers.clear();
  });

  test('isSelfPeer identifies own fingerprint regardless of address', () => {
    expect(engine.isSelfPeer('192.168.9.9', 53318, engine.fingerprint)).toBe(true);
  });

  test('isSelfPeer identifies own loopback address on own gateway ports', () => {
    expect(engine.isSelfPeer('127.0.0.1', 53318, '')).toBe(true);
    expect(engine.isSelfPeer('127.0.0.1', 53317, '')).toBe(true);
  });

  test('isSelfPeer does not flag genuine remote peers', () => {
    expect(engine.isSelfPeer('10.99.99.99', 53318, 'FP-OTHER')).toBe(false);
  });

  test('handlePeerFound ignores this PC by deviceId', () => {
    let count = 0;
    engine.broadcastEvent = () => { count += 1; };
    engine.handlePeerFound({ deviceId: engine.deviceId, ip: '10.1.2.3', port: 53318 });
    expect(engine.peers.size).toBe(0);
    expect(count).toBe(0);
  });

  test('handlePeerFound ignores this PC by fingerprint', () => {
    engine.handlePeerFound({ fingerprint: engine.fingerprint, address: '10.1.2.3', port: 53318 });
    expect(engine.peers.size).toBe(0);
  });

  test('handlePeerFound ignores this PC by displayName', () => {
    engine.handlePeerFound({ alias: engine.selfDevice.displayName, ip: '10.1.2.3', port: 53318 });
    expect(engine.peers.size).toBe(0);
  });

  test('handlePeerFound ignores any local interface IP (loopback here)', () => {
    engine.handlePeerFound({ ip: '127.0.0.1', port: 53318, alias: 'Me' });
    expect(engine.peers.size).toBe(0);
  });

  test('requestIncomingApproval resolves accepted when user accepts', async () => {
    const events = [];
    engine.broadcastEvent = (type, data) => events.push({ type, data });

    const promise = engine.requestIncomingApproval({
      sessionId: 's1',
      sender: { deviceId: 'ph-1', displayName: 'Pixel' },
      files: [{ fileId: 'f1', fileName: 'a.txt', fileSize: 100 }]
    });

    const reqEvent = events.find((e) => e.type === 'incoming_request');
    expect(reqEvent).toBeDefined();
    expect(reqEvent.data.senderName).toBe('Pixel');
    expect(reqEvent.data.fileCount).toBe(1);
    expect(reqEvent.data.totalBytes).toBe(100);

    expect(engine.respondToRequest(reqEvent.data.requestId, true)).toBe(true);
    await expect(promise).resolves.toEqual({ accepted: true });
  });

  test('requestIncomingApproval resolves rejected when user declines', async () => {
    const events = [];
    engine.broadcastEvent = (type, data) => events.push({ type, data });

    const promise = engine.requestIncomingApproval({ files: {} });
    const reqEvent = events.find((e) => e.type === 'incoming_request');
    engine.respondToRequest(reqEvent.data.requestId, false);
    await expect(promise).resolves.toEqual({ accepted: false, reason: 'rejected_by_user' });
  });

  test('respondToRequest returns false for unknown requestId', () => {
    expect(engine.respondToRequest('nope', true)).toBe(false);
  });

  test('handlePeerFound registers a genuine remote peer (accepts address field)', () => {
    const events = [];
    engine.broadcastEvent = (type, data) => events.push({ type, data });

    engine.handlePeerFound({
      address: '10.99.99.99',
      port: 53317,
      fingerprint: 'FP-PHONE',
      alias: 'Pixel (Android)'
    });

    expect(engine.peers.size).toBe(1);
    const peer = engine.peers.get('FP-PHONE');
    expect(peer.address).toBe('10.99.99.99');
    expect(peer.displayName).toBe('Pixel (Android)');
    expect(events.some((e) => e.type === 'peer_found')).toBe(true);
  });
});
