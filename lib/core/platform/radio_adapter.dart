/// The platform radio contract.
///
/// Anything that touches hardware (mDNS sockets, BLE peripherals, hotspots,
/// Wi-Fi Direct) implements this. The core engine only ever sees this
/// interface, which keeps it pure Dart and unit-testable with fakes.
library;

/// Capabilities a platform may or may not support. The UI uses these to avoid
/// offering actions the OS cannot perform (e.g. iOS can never create a SoftAP).
class RadioCapabilities {
  const RadioCapabilities({
    this.mdnsAdvertise = false,
    this.mdnsDiscover = false,
    this.bleAdvertise = false,
    this.bleScan = false,
    this.softApCreate = false,
    this.softApJoin = false,
    this.wifiDirect = false,
    this.wifiDirectJoin = false,
  });

  final bool mdnsAdvertise;
  final bool mdnsDiscover;
  final bool bleAdvertise;
  final bool bleScan;
  final bool softApCreate;
  final bool softApJoin;
  final bool wifiDirect;
  final bool wifiDirectJoin;

  Map<String, bool> toJson() => {
        'mdnsAdvertise': mdnsAdvertise,
        'mdnsDiscover': mdnsDiscover,
        'bleAdvertise': bleAdvertise,
        'bleScan': bleScan,
        'softApCreate': softApCreate,
        'softApJoin': softApJoin,
        'wifiDirect': wifiDirect,
        'wifiDirectJoin': wifiDirectJoin,
      };

  factory RadioCapabilities.fromJson(Map<String, Object?> json) => RadioCapabilities(
        mdnsAdvertise: (json['mdnsAdvertise'] as bool?) ?? false,
        mdnsDiscover: (json['mdnsDiscover'] as bool?) ?? false,
        bleAdvertise: (json['bleAdvertise'] as bool?) ?? false,
        bleScan: (json['bleScan'] as bool?) ?? false,
        softApCreate: (json['softApCreate'] as bool?) ?? false,
        softApJoin: (json['softApJoin'] as bool?) ?? false,
        wifiDirect: (json['wifiDirect'] as bool?) ?? false,
        wifiDirectJoin: (json['wifiDirectJoin'] as bool?) ?? false,
      );
}

/// A temporary hotspot created on the sender, plus the credentials a receiver
/// needs to join it.
class HotspotCredentials {
  const HotspotCredentials({required this.ssid, required this.passphrase});
  final String ssid;
  final String passphrase;
}

/// The interface every platform bridge implements.
abstract class RadioAdapter {
  Future<RadioCapabilities> capabilities();

  /// Advertise this device over mDNS for as long as [stopMdnsAdvertising] runs.
  Future<void> startMdnsAdvertising({
    required String serviceName,
    required int port,
    required Map<String, String> txt,
  });

  Future<void> stopMdnsAdvertising();

  /// Emit discovery events until the subscription is cancelled.
  Stream<Map<String, String>> discoverMdns({Duration interval = const Duration(seconds: 2)});

  /// Advertise over BLE (best effort; some desktop stacks lack this).
  Future<void> startBleAdvertising(Map<String, String> payload);
  Future<void> stopBleAdvertising();

  /// Scan for BLE advertisements carrying our payload.
  Stream<Map<String, String>> scanBle({Duration timeout = const Duration(seconds: 5)});

  /// Create / join a hotspot or Wi-Fi Direct group.
  Future<HotspotCredentials> createHotspot();
  Future<void> joinHotspot(HotspotCredentials credentials);
  Future<void> connectWifiDirect(String deviceId);
  Future<void> dispose();
}

/// A no-op adapter for tests and unsupported platforms.
class NullRadioAdapter implements RadioAdapter {
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
  Stream<Map<String, String>> discoverMdns({Duration interval = const Duration(seconds: 2)}) =>
      const Stream.empty();

  @override
  Future<void> startBleAdvertising(Map<String, String> payload) async {}

  @override
  Future<void> stopBleAdvertising() async {}

  @override
  Stream<Map<String, String>> scanBle({Duration timeout = const Duration(seconds: 5)}) =>
      const Stream.empty();

  @override
  Future<HotspotCredentials> createHotspot() async =>
      throw UnsupportedError('hotspot not supported on this platform');

  @override
  Future<void> joinHotspot(HotspotCredentials credentials) async =>
      throw UnsupportedError('hotspot join not supported on this platform');

  @override
  Future<void> connectWifiDirect(String deviceId) async =>
      throw UnsupportedError('wifi direct not supported on this platform');

  @override
  Future<void> dispose() async {}
}
