/// Native mDNS adapter using the `nsd` plugin (DNS-SD via the OS responder).
///
/// Advertising is a real OS registration, so the service is visible to Bonjour/
/// Avahi browsers. Discovery uses `startDiscovery` + `resolve` to get the TXT
/// records and addresses our protocol needs.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:nsd/nsd.dart' as nsd;

import '../core/interop/localsend/localsend_models.dart';
import '../core/platform/radio_adapter.dart';
import '../core/protocol/protocol.dart';

class NsdRadioAdapter implements RadioAdapter {
  nsd.Registration? _registration;
  nsd.Registration? _localSendRegistration;
  nsd.Discovery? _discovery;
  final StreamController<Map<String, String>> _controller =
      StreamController.broadcast();

  @override
  Future<RadioCapabilities> capabilities() async => const RadioCapabilities(
        mdnsAdvertise: true,
        mdnsDiscover: true,
      );

  @override
  Future<void> startMdnsAdvertising({
    required String serviceName,
    required int port,
    required Map<String, String> txt,
  }) async {
    await stopMdnsAdvertising();
    _registration = await nsd.register(
      nsd.Service(
        name: serviceName,
        type: kMdnsServiceType,
        port: port,
        txt: txt.map((k, v) => MapEntry(k, Uint8List.fromList(utf8.encode(v)))),
      ),
    );
    // Also appear to LocalSend apps browsing `_localsend._tcp`.
    _localSendRegistration = await nsd.register(
      nsd.Service(
        name: serviceName,
        type: kLocalSendMdnsService,
        port: port,
        txt: _localSendTxt(txt),
      ),
    );
  }

  /// Translate our TXT fields to the names LocalSend clients expect.
  Map<String, Uint8List> _localSendTxt(Map<String, String> txt) {
    final alias = txt['displayName'] ?? txt['alias'] ?? 'LocalShare';
    final fields = <String, String>{
      'alias': alias,
      'version': kLocalSendVersion,
      'fingerprint': txt['fingerprint'] ?? '',
      'port': txt['port'] ?? '',
      'protocol': 'http',
      'deviceModel': 'LocalShare',
      'deviceType': 'desktop',
    };
    return fields
        .map((k, v) => MapEntry(k, Uint8List.fromList(utf8.encode(v))));
  }

  @override
  Future<void> stopMdnsAdvertising() async {
    final registration = _registration;
    _registration = null;
    if (registration != null) {
      await nsd.unregister(registration);
    }
    final localSend = _localSendRegistration;
    _localSendRegistration = null;
    if (localSend != null) {
      await nsd.unregister(localSend);
    }
  }

  @override
  Stream<Map<String, String>> discoverMdns({
    Duration interval = const Duration(seconds: 2),
  }) async* {
    unawaited(_discoverLocalSend());
    _discovery = await nsd.startDiscovery(kMdnsServiceType);
    _discovery!.addServiceListener((service, status) async {
      if (status != nsd.ServiceStatus.found) return;
      if (service.name == null ||
          !service.name!.contains(kMdnsServiceNamePrefix)) {
        return;
      }
      final resolved = await nsd.resolve(service);
      if (_controller.isClosed) return;
      _controller.add(_toRecord(resolved));
    });
    yield* _controller.stream;
  }

  /// Browse `_localsend._tcp` and surface LocalSend apps as `localsend` peers so
  /// the engine routes them through the v2 compat layer.
  Future<void> _discoverLocalSend() async {
    try {
      final discovery = await nsd.startDiscovery(kLocalSendMdnsService);
      discovery.addServiceListener((service, status) async {
        if (status != nsd.ServiceStatus.found || _controller.isClosed) return;
        final resolved = await nsd.resolve(service);
        if (_controller.isClosed) return;
        _controller.add(_localSendRecord(resolved));
      });
    } on Object {
      // No LocalSend services on this network, or discovery unsupported here.
    }
  }

  Map<String, String> _localSendRecord(nsd.Service service) {
    final record = <String, String>{
      'platform': 'localsend',
      'port': '${service.port ?? kLocalSendPort}',
    };
    service.txt?.forEach((key, value) {
      if (value == null) return;
      try {
        record[key] = utf8.decode(value);
      } on Object {
        // Non-UTF8 TXT value; skip.
      }
    });
    record['displayName'] = record['alias'] ?? service.name ?? 'LocalSend';
    record['deviceId'] = record['fingerprint'] ?? service.name ?? '';
    final addresses =
        service.addresses?.map((a) => a.address).toList() ?? const [];
    if (addresses.isNotEmpty) {
      record['addresses'] = addresses.join(',');
      record['address'] = addresses.first;
    }
    return record;
  }

  Map<String, String> _toRecord(nsd.Service service) {
    final record = <String, String>{
      'name': service.name ?? '',
      'host': service.host ?? '',
      'port': '${service.port ?? kDefaultPort}',
    };
    service.txt?.forEach((key, value) {
      if (value == null) return;
      try {
        record[key] = utf8.decode(value);
      } on Object {
        // Non-UTF8 TXT values are opaque binary; skip them.
      }
    });
    final addresses =
        service.addresses?.map((a) => a.address).toList() ?? const [];
    if (addresses.isNotEmpty) {
      record['addresses'] = addresses.join(',');
      record['address'] = addresses.first;
    }
    return record;
  }

  @override
  Future<void> stopBleAdvertising() async {}

  @override
  Future<void> startBleAdvertising(Map<String, String> payload) async {}

  @override
  Stream<Map<String, String>> scanBle(
          {Duration timeout = const Duration(seconds: 5)}) =>
      const Stream.empty();

  @override
  Future<HotspotCredentials> createHotspot() async =>
      throw UnsupportedError('SoftAP is handled by the native Android adapter');

  @override
  Future<void> joinHotspot(HotspotCredentials credentials) async =>
      throw UnsupportedError('SoftAP is handled by the native Android adapter');

  @override
  Future<void> connectWifiDirect(String deviceId) async =>
      throw UnsupportedError(
          'Wi-Fi Direct is handled by the native Android adapter');

  @override
  Future<void> dispose() async {
    await stopMdnsAdvertising();
    final discovery = _discovery;
    _discovery = null;
    if (discovery != null) {
      await nsd.stopDiscovery(discovery);
    }
    await _controller.close();
  }
}
