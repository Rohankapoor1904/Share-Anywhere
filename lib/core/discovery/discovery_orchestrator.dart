/// Merges discovery sightings from multiple radios into a single peer list.
///
/// mDNS and BLE report the same device differently (mDNS knows the IP; BLE
/// knows proximity but not an address). This orchestrator deduplicates by
/// device id, fingerprint, and IP address, keeps the union of known addresses,
/// and applies a staleness timeout so vanished devices disappear from the UI.
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
    this.localAddresses = const {},
    // 60s staleness: temporary packet drops don't evict devices.
    this.staleness = const Duration(seconds: 60),
  });

  final RadioAdapter adapter;
  final String localDeviceId;
  final String localFingerprint;
  final Set<String> localAddresses;
  final Duration staleness;

  final Map<String, _Tracked> _peers = {};
  final StreamController<DiscoveryEvent> _events = StreamController.broadcast();
  final List<StreamSubscription<Map<String, String>>> _subscriptions = [];
  Timer? _sweeper;

  Stream<DiscoveryEvent> get events => _events.stream;
  Iterable<DeviceInfo> get peers => _peers.values.map((t) => t.device);

  void start() {
    _sweeper ??= Timer.periodic(const Duration(seconds: 10), (_) => _sweep());
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
        if (_isSelf(device)) return;
        _merge(device);
      };

  bool _isSelf(DeviceInfo device) {
    if (device.deviceId == localDeviceId) return true;
    if (localDeviceId.isNotEmpty && device.deviceId.contains(localDeviceId)) {
      return true;
    }
    if (device.fingerprint.isNotEmpty &&
        device.fingerprint == localFingerprint) {
      return true;
    }
    if (device.addresses.any((a) => localAddresses.contains(a))) {
      return true;
    }
    return false;
  }

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
    if (_isSelf(incoming)) return;

    // Look for matching existing peer: by deviceId, by fingerprint, or by shared IP.
    _Tracked? match = _peers[incoming.deviceId];
    if (match == null && incoming.fingerprint.isNotEmpty) {
      for (final t in _peers.values) {
        if (t.device.fingerprint.isNotEmpty &&
            t.device.fingerprint == incoming.fingerprint) {
          match = t;
          break;
        }
      }
    }
    if (match == null && incoming.addresses.isNotEmpty) {
      for (final t in _peers.values) {
        if (t.device.addresses.any((a) => incoming.addresses.contains(a))) {
          match = t;
          break;
        }
      }
    }

    if (match == null) {
      _peers[incoming.deviceId] = _Tracked(incoming, DateTime.now());
      _events.add(DiscoveryEvent.added(incoming));
      return;
    }

    // Merge addresses
    final mergedAddresses =
        {...match.device.addresses, ...incoming.addresses}.toList();

    // Prefer a richer human-readable name over placeholders
    var displayName = match.device.displayName;
    if (_isGenericName(displayName) && !_isGenericName(incoming.displayName)) {
      displayName = incoming.displayName;
    }

    final platform = incoming.platform ?? match.device.platform;
    final fingerprint = incoming.fingerprint.isNotEmpty
        ? incoming.fingerprint
        : match.device.fingerprint;

    final merged = match.device.copyWith(
      displayName: displayName,
      fingerprint: fingerprint,
      platform: platform,
      addresses: mergedAddresses,
      discoveredVia: incoming.discoveredVia == DiscoveryChannel.mdns
          ? DiscoveryChannel.mdns
          : match.device.discoveredVia,
    );
    match.device = merged;
    match.seen = DateTime.now();
  }

  bool _isGenericName(String name) =>
      name == 'Nearby device' ||
      name == 'LocalSend' ||
      name == 'My Device' ||
      name.isEmpty;

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
    if (_isSelf(device)) return;
    _peers[device.deviceId] = _Tracked(device, DateTime.now());
    _events.add(DiscoveryEvent.added(device));
  }

  /// Feed a peer observed by an out-of-band channel (e.g. LocalSend multicast)
  /// into the same dedupe/staleness pipeline as the radios.
  void ingest(DeviceInfo device) {
    if (_isSelf(device)) return;
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
