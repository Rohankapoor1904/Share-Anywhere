const { LocalShareNode } = require('../../src/engine/LocalShareNode');
const { EngineEventType } = require('../../src/engine/EngineEvents');

describe('LocalShareNode Nearby transport merge rules', () => {
  let node;

  beforeEach(() => {
    node = new LocalShareNode();
    node.detectedLocalIp = '10.0.0.5';
    node.selfDevice.address = '10.0.0.5';
  });

  afterEach(async () => {
    await node.stop();
  });

  const nearbySighting = (deviceId, endpointId) => ({
    deviceId,
    displayName: 'Friend Phone',
    platform: 'android',
    endpointId,
    transport: 'nearby',
    discoveryChannel: 'nearby'
  });

  const lanSighting = (deviceId, address) => ({
    deviceId,
    displayName: 'Friend Phone',
    address,
    port: 53318,
    platform: 'android',
    discoveryChannel: 'mdns'
  });

  test('a Nearby-only sighting registers a peer routed over Nearby', () => {
    node._handlePeerSighting(nearbySighting('phone-x', 'EP-1'));
    const [peer] = node.getPeers();
    expect(peer.transport).toBe('nearby');
    expect(peer.endpointId).toBe('EP-1');
  });

  test('a Nearby sighting of a LAN peer keeps LAN routing and records the fallback endpoint', () => {
    node._handlePeerSighting(lanSighting('phone-x', '10.0.0.9'));
    node._handlePeerSighting(nearbySighting('phone-x', 'EP-1'));
    const [peer] = node.getPeers();
    expect(peer.transport).toBe('lan');
    expect(peer.address).toBe('10.0.0.9');
    expect(peer.endpointId).toBe('EP-1');
  });

  test('a Nearby sighting does not keep a vanished LAN peer alive', () => {
    node._handlePeerSighting(lanSighting('phone-x', '10.0.0.9'));
    node.peerMap.get('phone-x').lastSeen = 1000;
    node._handlePeerSighting(nearbySighting('phone-x', 'EP-1'));
    expect(node.peerMap.get('phone-x').lastSeen).toBe(1000);
  });

  test('a LAN sighting upgrades a Nearby-only peer and keeps the endpoint', () => {
    node._handlePeerSighting(nearbySighting('phone-x', 'EP-1'));
    node._handlePeerSighting(lanSighting('phone-x', '10.0.0.9'));
    const [peer] = node.getPeers();
    expect(peer.transport).toBe('lan');
    expect(peer.address).toBe('10.0.0.9');
    expect(peer.endpointId).toBe('EP-1');
  });

  test('Nearby-only peers are not swept by the LAN staleness timer', () => {
    node._handlePeerSighting(nearbySighting('phone-x', 'EP-1'));
    node.peerMap.get('phone-x').lastSeen = 0;
    node._sweepStalePeers();
    expect(node.getPeers()).toHaveLength(1);
  });

  test('a stale LAN peer still in Nearby range falls back to Nearby instead of vanishing', () => {
    node._handlePeerSighting(lanSighting('phone-x', '10.0.0.9'));
    node.nearby._onEndpointFound({
      endpointId: 'EP-1',
      endpointName: '',
      endpointInfo: JSON.stringify({ d: 'phone-x', n: 'Friend Phone', p: 'android', v: 1 })
    });
    node.peerMap.get('phone-x').lastSeen = 0;

    const updates = [];
    node.events.on(EngineEventType.PEER_UPDATED, (p) => updates.push(p));
    node._sweepStalePeers();

    const [peer] = node.getPeers();
    expect(peer.transport).toBe('nearby');
    expect(peer.endpointId).toBe('EP-1');
    expect(updates.map((p) => p.transport)).toEqual(['nearby']);
  });

  test('losing the endpoint drops Nearby-only peers and clears the fallback on LAN peers', () => {
    node._handlePeerSighting(nearbySighting('phone-x', 'EP-1'));
    node._handlePeerSighting(lanSighting('phone-y', '10.0.0.10'));
    node._handlePeerSighting(nearbySighting('phone-y', 'EP-2'));

    node._handleNearbyGone('EP-1', 'phone-x');
    node._handleNearbyGone('EP-2', 'phone-y');

    const peers = node.getPeers();
    expect(peers.map((p) => p.deviceId)).toEqual(['phone-y']);
    expect(peers[0].endpointId).toBe('');
    expect(peers[0].transport).toBe('lan');
  });

  test('measured Nearby bandwidth is reflected on the peer', () => {
    node._handlePeerSighting(nearbySighting('phone-x', 'EP-1'));
    node._handleNearbyBandwidth('EP-1', 'LOW');
    expect(node.getPeers()[0].nearbyBandwidth).toBe('LOW');
  });

  test('sending to a Nearby peer is routed to the Nearby transport, not the LAN address check', async () => {
    const peer = { deviceId: 'phone-x', transport: 'nearby', endpointId: 'EP-404', address: '0.0.0.0', port: 53318 };
    await expect(node.send(peer, [{ name: 'a.txt', size: 1, path: '/tmp/a.txt' }])).rejects.toThrow('no longer in range');
  });

  test('a live connection is refused for Nearby-only peers with a clear reason', async () => {
    await expect(node.connectToPeer({ deviceId: 'phone-x', transport: 'nearby', address: '0.0.0.0', port: 53318 }))
      .rejects.toThrow('same Wi-Fi');
  });

  test('Nearby fields stay off the LAN wire format', () => {
    node._handlePeerSighting(lanSighting('pc-1', '10.0.0.20'));
    const json = node.getPeers()[0].toJSON();
    expect(json.transport).toBeUndefined();
    expect(json.endpointId).toBeUndefined();
  });

  test('offline sharing reports unsupported where Play Services is absent (Jest)', async () => {
    await node._initNearby();
    expect(node.getNearbyState().supported).toBe(false);
    expect(node.getNearbyState().reason.length).toBeGreaterThan(0);
  });
});
