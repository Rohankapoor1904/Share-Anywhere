const { LocalShareNode } = require('../../src/engine/LocalShareNode');
const { EngineEventType } = require('../../src/engine/EngineEvents');

describe('LocalShareNode Facade Unit Tests (§8, §10, §12.1)', () => {
  let node;

  beforeEach(() => {
    node = new LocalShareNode();
  });

  afterEach(async () => {
    await node.stop();
  });

  test('Self device is initialized with valid defaults', () => {
    const self = node.getSelfDevice();
    expect(self.deviceId).toBeDefined();
    expect(self.displayName).toBeDefined();
    expect(self.port).toBe(53318);
  });

  test('Manual peer addition registers peer and dedups identical IDs', () => {
    let peerFoundEmitted = false;
    node.events.on(EngineEventType.PEER_FOUND, (peer) => {
      peerFoundEmitted = true;
      expect(peer.address).toBe('192.168.1.150');
      expect(peer.port).toBe(53318);
      expect(peer.discoveryChannel).toBe('manual');
    });

    node.addManualPeer('192.168.1.150', 53318, 'FP-MANUAL');
    expect(peerFoundEmitted).toBe(true);

    const peers = node.getPeers();
    expect(peers.length).toBe(1);

    // Adding same peer again should update rather than duplicate
    let peerUpdatedEmitted = false;
    node.events.on(EngineEventType.PEER_UPDATED, () => {
      peerUpdatedEmitted = true;
    });

    node.addManualPeer('192.168.1.150', 53318, 'FP-MANUAL-UPDATED');
    expect(peerUpdatedEmitted).toBe(true);
    expect(node.getPeers().length).toBe(1);
  });

  test('Staleness sweep drops peers unseen for kPeerStaleMs', () => {
    let peerLostEmitted = false;
    node.events.on(EngineEventType.PEER_LOST, (peer) => {
      peerLostEmitted = true;
      expect(peer.deviceId).toBe('stale-peer');
    });

    // Directly inject a stale peer sighting
    node._handlePeerSighting({
      deviceId: 'stale-peer',
      displayName: 'Stale Device',
      address: '192.168.1.99',
      port: 53318
    });

    expect(node.getPeers().length).toBe(1);

    // Fast-forward lastSeen timestamp
    const peer = node.peerMap.get('stale-peer');
    peer.lastSeen = Date.now() - 20000;

    // Trigger sweep
    node._sweepStalePeers();

    expect(peerLostEmitted).toBe(true);
    expect(node.getPeers().length).toBe(0);
  });
});
