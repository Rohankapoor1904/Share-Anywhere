const { LocalShareNode } = require('../../src/engine/LocalShareNode');
const { EngineEventType } = require('../../src/engine/EngineEvents');

describe('Self-discovery filtering', () => {
  let node;

  beforeEach(() => {
    node = new LocalShareNode();
    node.detectedLocalIp = '10.2.48.156';
    node.selfDevice.address = '10.2.48.156';
  });

  afterEach(async () => {
    await node.stop();
  });

  test('ignores a peer advertising this device own Wi-Fi address', () => {
    let found = false;
    node.events.on(EngineEventType.PEER_FOUND, () => {
      found = true;
    });

    node._handlePeerSighting({
      deviceId: 'some-other-id',
      displayName: 'This Phone',
      address: '10.2.48.156',
      port: 53317
    });

    expect(found).toBe(false);
    expect(node.getPeers()).toHaveLength(0);
  });

  test('ignores this device when seen through an IPv4-mapped IPv6 address', () => {
    let found = false;
    node.events.on(EngineEventType.PEER_FOUND, () => {
      found = true;
    });

    node._handlePeerSighting({
      deviceId: 'mapped-id',
      displayName: 'This Phone',
      address: '::ffff:10.2.48.156',
      port: 53318
    });

    expect(found).toBe(false);
    expect(node.getPeers()).toHaveLength(0);
  });

  test('ignores loopback sightings', () => {
    node._handlePeerSighting({
      deviceId: 'loopback-id',
      displayName: 'Loopback',
      address: '127.0.0.1',
      port: 53318
    });

    expect(node.getPeers()).toHaveLength(0);
  });

  test('still registers a genuinely remote peer', () => {
    node._handlePeerSighting({
      deviceId: 'remote-id',
      displayName: 'Remote PC',
      address: '10.2.76.9',
      port: 53318,
      platform: 'desktop'
    });

    const peers = node.getPeers();
    expect(peers).toHaveLength(1);
    expect(peers[0].deviceId).toBe('remote-id');
    expect(peers[0].address).toBe('10.2.76.9');
  });

  test('a stale copy of this phone seen before its IP was known is removed once the IP is learned', () => {
    node.detectedLocalIp = '';
    node.selfDevice.address = '127.0.0.1';
    node._handlePeerSighting({
      deviceId: 'ls-android-old-launch',
      displayName: 'This Phone (old)',
      address: '10.2.48.200',
      port: 53318,
      platform: 'android'
    });
    node._handlePeerSighting({ deviceId: 'pc-1', displayName: 'PC', address: '10.2.48.20', port: 53318, platform: 'desktop' });
    expect(node.getPeers()).toHaveLength(2);

    const lost = [];
    node.events.on(EngineEventType.PEER_LOST, (p) => lost.push(p.deviceId));
    node.detectedLocalIp = '10.2.48.200';
    node.selfDevice.address = '10.2.48.200';
    node._purgeSelfPeers();

    expect(node.getPeers().map((p) => p.deviceId)).toEqual(['pc-1']);
    expect(lost).toEqual(['ls-android-old-launch']);
  });
});
