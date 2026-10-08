/// Composes several radio adapters into one.
///
/// Discovery streams are merged and deduplicated by device id; capability
/// queries are OR-ed. This lets the app enable mDNS + BLE + SoftAP together
/// without the engine knowing which concrete plugin backs each one.
library;

import 'dart:async';

import '../core/platform/radio_adapter.dart';

class CompositeRadioAdapter implements RadioAdapter {
  CompositeRadioAdapter(this.parts);

  final List<RadioAdapter> parts;

  @override
  Future<RadioCapabilities> capabilities() async {
    final caps = await Future.wait(parts.map((p) => p.capabilities()));
    return RadioCapabilities(
      mdnsAdvertise: caps.any((c) => c.mdnsAdvertise),
      mdnsDiscover: caps.any((c) => c.mdnsDiscover),
      bleAdvertise: caps.any((c) => c.bleAdvertise),
      bleScan: caps.any((c) => c.bleScan),
      softApCreate: caps.any((c) => c.softApCreate),
      softApJoin: caps.any((c) => c.softApJoin),
      wifiDirect: caps.any((c) => c.wifiDirect),
      wifiDirectJoin: caps.any((c) => c.wifiDirectJoin),
    );
  }

  @override
  Future<void> startMdnsAdvertising({
    required String serviceName,
    required int port,
    required Map<String, String> txt,
  }) =>
      _tolerantStart(
        parts.map((p) => () => p.startMdnsAdvertising(
              serviceName: serviceName,
              port: port,
              txt: txt,
            )),
      );

  /// Starts every adapter, swallowing failures so one unsupported radio cannot
  /// prevent the others (or the whole app) from coming up.
  Future<void> _tolerantStart(Iterable<Future<void> Function()> starters) async {
    for (final start in starters) {
      try {
        await start();
      } on Object {
        // Adapter unavailable on this platform; discovery continues with the rest.
      }
    }
  }

  @override
  Future<void> stopMdnsAdvertising() =>
      Future.wait(parts.map((p) => p.stopMdnsAdvertising()));

  @override
  Stream<Map<String, String>> discoverMdns({
    Duration interval = const Duration(seconds: 2),
  }) =>
      _merge(parts.map((p) => p.discoverMdns(interval: interval)));

  @override
  Future<void> startBleAdvertising(Map<String, String> payload) =>
      _tolerantStart(parts.map((p) => () => p.startBleAdvertising(payload)));

  @override
  Future<void> stopBleAdvertising() =>
      Future.wait(parts.map((p) => p.stopBleAdvertising()));

  @override
  Stream<Map<String, String>> scanBle({Duration timeout = const Duration(seconds: 5)}) =>
      _merge(parts.map((p) => p.scanBle(timeout: timeout)));

  @override
  Future<HotspotCredentials> createHotspot() async {
    for (final part in parts) {
      final caps = await part.capabilities();
      if (caps.softApCreate) return part.createHotspot();
    }
    throw UnsupportedError('no adapter can create a hotspot');
  }

  @override
  Future<void> joinHotspot(HotspotCredentials credentials) async {
    for (final part in parts) {
      final caps = await part.capabilities();
      if (caps.softApJoin) return part.joinHotspot(credentials);
    }
    throw UnsupportedError('no adapter can join a hotspot');
  }

  @override
  Future<void> connectWifiDirect(String deviceId) async {
    for (final part in parts) {
      final caps = await part.capabilities();
      if (caps.wifiDirect) return part.connectWifiDirect(deviceId);
    }
    throw UnsupportedError('no adapter supports Wi-Fi Direct');
  }

  /// Merge streams, dropping duplicate sightings of the same device within a
  /// short window so the UI does not flicker.
  Stream<Map<String, String>> _merge(Iterable<Stream<Map<String, String>>> streams) {
    final controller = StreamController<Map<String, String>>();
    final seen = <String, DateTime>{};
    final subs = <StreamSubscription<Map<String, String>>>[];

    for (final stream in streams) {
      subs.add(stream.listen((event) {
        final id = event['deviceId'] ?? '';
        final now = DateTime.now();
        if (id.isNotEmpty) {
          final last = seen[id];
          if (last != null && now.difference(last) < const Duration(seconds: 1)) return;
          seen[id] = now;
        }
        controller.add(event);
      }, onError: controller.addError));
    }

    controller.onCancel = () async {
      for (final sub in subs) {
        await sub.cancel();
      }
    };
    return controller.stream;
  }

  @override
  Future<void> dispose() => Future.wait(parts.map((p) => p.dispose()));
}
