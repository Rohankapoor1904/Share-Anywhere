import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:localshare/core/discovery/discovery_orchestrator.dart';
import 'package:localshare/core/platform/radio_adapter.dart';
import 'package:localshare/core/protocol/models.dart';

/// A radio whose mDNS and BLE sighting streams we drive by hand.
class _FakeRadio implements RadioAdapter {
  final mdns = StreamController<Map<String, String>>.broadcast();
  final ble = StreamController<Map<String, String>>.broadcast();
  bool mdnsError = false;

  @override
  Stream<Map<String, String>> discoverMdns({Duration interval = const Duration(seconds: 2)}) {
    if (mdnsError) {
      return Stream.error(const SocketException('no backend'));
    }
    return mdns.stream;
  }

  @override
  Stream<Map<String, String>> scanBle({Duration timeout = const Duration(seconds: 5)}) => ble.stream;

  @override
  Future<RadioCapabilities> capabilities() async => const RadioCapabilities();

  @override
  Future<void> startMdnsAdvertising({
    required String serviceName,
    required int port,
    required Map<String, String> txt,
  }) async {}

  @override
  Future<void> stopMdnsAdvertising() async {}

  @override
  Future<void> startBleAdvertising(Map<String, String> payload) async {}

  @override
  Future<void> stopBleAdvertising() async {}

  @override
  Future<HotspotCredentials> createHotspot() async => throw UnimplementedError();

  @override
  Future<void> joinHotspot(HotspotCredentials credentials) async {}

  @override
  Future<void> connectWifiDirect(String deviceId) async {}

  @override
  Future<void> dispose() async {}
}

void main() {
  late _FakeRadio radio;
  late DiscoveryOrchestrator orchestrator;

  setUp(() {
    radio = _FakeRadio();
    orchestrator = DiscoveryOrchestrator(
      adapter: radio,
      localDeviceId: 'self',
      localFingerprint: 'fp-self',
    );
    orchestrator.start();
  });

  tearDown(() async {
    await orchestrator.dispose();
    await radio.mdns.close();
    await radio.ble.close();
  });

  Future<void> settle() => Future<void>.delayed(const Duration(milliseconds: 20));

  test('adds an mDNS sighting to peers', () async {
    radio.mdns.add({
      'deviceId': 'peer-1',
      'displayName': 'Pixel',
      'fingerprint': 'fp-1',
      'port': '9000',
    });
    await settle();

    final peer = orchestrator.peers.single;
    expect(peer.deviceId, 'peer-1');
    expect(peer.displayName, 'Pixel');
    expect(peer.port, 9000);
    expect(peer.discoveredVia, DiscoveryChannel.mdns);
  });

  test('ignores sightings of self by id and by fingerprint', () async {
    radio.mdns.add({'deviceId': 'self', 'displayName': 'Me'});
    radio.ble.add({'deviceId': 'other', 'fingerprint': 'fp-self'});
    await settle();

    expect(orchestrator.peers, isEmpty);
  });

  test('merges the same device seen over mDNS and BLE, unioning addresses', () async {
    radio.mdns.add({'deviceId': 'peer-1', 'displayName': 'Pixel', 'address': '192.168.1.5'});
    await settle();
    radio.ble.add({'deviceId': 'peer-1', 'displayName': 'Pixel Pro', 'address': '10.0.0.9'});
    await settle();

    final peer = orchestrator.peers.single;
    expect(peer.addresses, containsAll(['192.168.1.5', '10.0.0.9']));
    // mDNS is preferred for connectivity once seen.
    expect(peer.discoveredVia, DiscoveryChannel.mdns);
  });

  test('records only one add event per new device', () async {
    final events = <DiscoveryEvent>[];
    orchestrator.events.listen(events.add);

    radio.mdns.add({'deviceId': 'peer-1'});
    await settle();
    radio.mdns.add({'deviceId': 'peer-1', 'displayName': 'Pixel'});
    await settle();

    expect(events.where((e) => !e.removed), hasLength(1));
  });

  test('a failing radio stream does not stop the other radio', () async {
    radio.mdnsError = true;
    // Re-create against the failing stream.
    await orchestrator.dispose();
    orchestrator = DiscoveryOrchestrator(
      adapter: radio,
      localDeviceId: 'self',
      localFingerprint: 'fp-self',
    )..start();

    radio.ble.add({'deviceId': 'ble-only', 'displayName': 'Watch'});
    await settle();

    expect(orchestrator.peers.map((d) => d.deviceId), contains('ble-only'));
  });

  test('manual injection surfaces a peer immediately', () {
    final events = <DiscoveryEvent>[];
    orchestrator.events.listen(events.add);

    orchestrator.addManual(const DeviceInfo(
      deviceId: 'typed',
      displayName: 'Typed IP',
      fingerprint: '',
      port: 53317,
    ));

    expect(orchestrator.peers.single.deviceId, 'typed');
  });
}
