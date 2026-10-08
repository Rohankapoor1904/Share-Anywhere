/// Merges discovery sightings from multiple radios into a single peer list.
///
/// mDNS and BLE report the same device differently (mDNS knows the IP; BLE
/// knows proximity but not an address). This orchestrator deduplicates by
/// device id, keeps the union of known addresses, and applies a staleness
/// timeout so vanished devices disappear from the UI.
library;

import 'dart:async';

import '../platform/radio_adapter.dart';
import '../protocol/models.dart';
import '../protocol/protocol.dart';

/// A discovery event emitted to the UI.
class DiscoveryEvent {
  const DiscoveryEvent.added(this.device) : removed = false;
  const DiscoveryEvent.removed(this.device) : removed = true;
  final DeviceInfo device;
  final bool removed;
}

class DiscoveryOrchestrator {
  DiscoveryOrchestrator({
    required this.adapter,
    required this.localDeviceId,
    required this.localFingerprint,
    this.staleness = const Duration(seconds: 20),
  });

  final RadioAdapter adapter;
  final String localDeviceId;
  final String localFingerprint;
  final Duration staleness;

  final Map<String, _Tracked> _peers = {};
  final StreamController<DiscoveryEvent> _events = StreamController.broadcast();
  final List<StreamSubscription<Map<String, String>>> _subscriptions = [];
  Timer? _sweeper;

  Stream<DiscoveryEvent> get events => _events.stream;
  Iterable<DeviceInfo> get peers => _peers.values.map((t) => t.device);

  void start() {
    _sweeper ??= Timer.periodic(const Duration(seconds: 5), (_) => _sweep());
    _listen(adapter.discoverMdns(), DiscoveryChannel.mdns);
    _listen(adapter.scanBle(), DiscoveryChannel.ble);
  }

  void _listen(Stream<Map<String, String>> stream, DiscoveryChannel channel) {
    _subscriptions.add(
      stream.listen(
        _ingest(channel),
        onError: (Object _) {
          // A radio can fail on platforms without its native backend; the other
          // radios keep discovery alive.
        },
      ),
    );
  }

  void Function(Map<String, String>) _ingest(DiscoveryChannel channel) =>
      (record) {
        final device = _fromRecord(record, channel);
        if (device == null) return;
        // Never report ourselves; dedupe by fingerprint as well as id.
        if (device.deviceId == localDeviceId) return;
        if (device.fingerprint.isNotEmpty &&
            device.fingerprint == localFingerprint) {
          return;
        }
        _merge(device);
      };

  DeviceInfo? _fromRecord(
      Map<String, String> record, DiscoveryChannel channel) {
    final id = record['deviceId'] ?? record['id'];
    if (id == null || id.isEmpty) return null;
    final addresses = <String>[
      if (record['address'] != null && record['address']!.isNotEmpty)
        record['address']!,
      if (record['ip'] != null && record['ip']!.isNotEmpty) record['ip']!,
      if (record['addresses'] != null) ...record['addresses']!.split(','),
    ];
    return DeviceInfo(
      deviceId: id,
      displayName: record['displayName'] ?? record['name'] ?? 'Nearby device',
      fingerprint: record['fingerprint'] ?? '',
      port: int.tryParse(record['port'] ?? '') ?? kDefaultPort,
      platform: record['platform'],
      addresses: addresses,
      discoveredVia: channel,
    );
  }

  void _merge(DeviceInfo incoming) {
    final existing = _peers[incoming.deviceId];
    if (existing == null) {
      _peers[incoming.deviceId] = _Tracked(incoming, DateTime.now());
      _events.add(DiscoveryEvent.added(incoming));
      return;
    }
    final mergedAddresses =
        {...existing.device.addresses, ...incoming.addresses}.toList();
    final merged = existing.device.copyWith(
      addresses: mergedAddresses,
      discoveredVia: incoming.discoveredVia == DiscoveryChannel.mdns
          ? DiscoveryChannel.mdns
          : existing.device.discoveredVia,
    );
    existing.device = merged;
    existing.seen = DateTime.now();
  }

  void _sweep() {
    final now = DateTime.now();
    final gone = <String>[];
    _peers.forEach((id, tracked) {
      if (now.difference(tracked.seen) > staleness) gone.add(id);
    });
    for (final id in gone) {
      final tracked = _peers.remove(id);
      if (tracked != null) _events.add(DiscoveryEvent.removed(tracked.device));
    }
  }

  /// Inject a peer discovered out-of-band (manual IP entry, QR code, etc.).
  void addManual(DeviceInfo device) {
    _peers[device.deviceId] = _Tracked(device, DateTime.now());
    _events.add(DiscoveryEvent.added(device));
  }

  /// Feed a peer observed by an out-of-band channel (e.g. LocalSend multicast)
  /// into the same dedupe/staleness pipeline as the radios.
  void ingest(DeviceInfo device) {
    if (device.deviceId == localDeviceId) return;
    if (device.fingerprint.isNotEmpty &&
        device.fingerprint == localFingerprint) {
      return;
    }
    _merge(device);
  }

  Future<void> dispose() async {
    _sweeper?.cancel();
    for (final sub in _subscriptions) {
      await sub.cancel();
    }
    _subscriptions.clear();
    await _events.close();
  }
}

class _Tracked {
  _Tracked(this.device, this.seen);
  DeviceInfo device;
  DateTime seen;
}
