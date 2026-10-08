/// Bluetooth Low Energy adapter.
///
/// BLE is the "even if we are not on the same Wi-Fi" discovery path: a device
/// broadcasts a tiny JSON payload in its service data so nearby phones can see
/// each other before any network is shared.
///
/// Advertising support varies by OS. Scanning is broadly available via
/// `flutter_blue_plus`; advertising is capability-gated and may be a no-op on
/// platforms without a peripheral role.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_blue_plus/flutter_blue_plus.dart';

import '../core/platform/radio_adapter.dart';
import '../core/protocol/protocol.dart';

class BleRadioAdapter implements RadioAdapter {
  final _controller = StreamController<Map<String, String>>.broadcast();
  StreamSubscription<List<ScanResult>>? _scanSub;

  @override
  Future<RadioCapabilities> capabilities() async => RadioCapabilities(
        bleScan: true,
        // Advertising via flutter_blue_plus is not universally supported; keep
        // it optimistic on Android and off elsewhere.
        bleAdvertise: Platform.isAndroid,
      );

  @override
  Future<void> startBleAdvertising(Map<String, String> payload) async {
    // flutter_blue_plus has no peripheral API. On Android the payload is
    // published by the companion native channel; elsewhere we simply skip it.
  }

  @override
  Future<void> stopBleAdvertising() async {}

  @override
  Stream<Map<String, String>> scanBle({
    Duration timeout = const Duration(seconds: 5),
  }) async* {
    bool supported;
    try {
      supported = await FlutterBluePlus.isSupported;
    } on Object {
      // Some desktop hosts (e.g. containers without D-Bus/BlueZ) cannot init
      // the BLE stack; skip BLE rather than surfacing an async error.
      return;
    }
    if (!supported) return;
    _scanSub = FlutterBluePlus.onScanResults.listen((results) {
      for (final result in results) {
        final data = result.advertisementData.serviceData[Guid(kBleServiceUuid)];
        if (data == null || data.isEmpty) continue;
        final record = _decode(data);
        if (record == null) continue;
        if (_controller.isClosed) return;
        _controller.add({
          ...record,
          'rssi': '${result.rssi}',
        });
      }
    });

    try {
      await FlutterBluePlus.startScan(
        withServices: [Guid(kBleServiceUuid)],
        timeout: timeout,
        continuousUpdates: true,
      );
    } on Object {
      return;
    }
    yield* _controller.stream;
  }

  Map<String, String>? _decode(List<int> bytes) {
    try {
      final decoded = jsonDecode(utf8.decode(bytes));
      if (decoded is Map) {
        return decoded.map((k, v) => MapEntry('$k', '$v'));
      }
    } on Object {
      // Ignore malformed advertisements from unrelated devices.
    }
    return null;
  }

  @override
  Future<void> startMdnsAdvertising({
    required String serviceName,
    required int port,
    required Map<String, String> txt,
  }) async {}

  @override
  Future<void> stopMdnsAdvertising() async {}

  @override
  Stream<Map<String, String>> discoverMdns({
    Duration interval = const Duration(seconds: 2),
  }) =>
      const Stream.empty();

  @override
  Future<HotspotCredentials> createHotspot() async =>
      throw UnsupportedError('SoftAP is handled by the native Android adapter');

  @override
  Future<void> joinHotspot(HotspotCredentials credentials) async =>
      throw UnsupportedError('SoftAP is handled by the native Android adapter');

  @override
  Future<void> connectWifiDirect(String deviceId) async =>
      throw UnsupportedError('Wi-Fi Direct is handled by the native Android adapter');

  @override
  Future<void> dispose() async {
    await _scanSub?.cancel();
    _scanSub = null;
    try {
      await FlutterBluePlus.stopScan();
    } on Object {
      // Already stopped.
    }
    await _controller.close();
  }
}
