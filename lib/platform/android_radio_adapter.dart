/// Native Android adapter: SoftAP (local hotspot) and Wi-Fi Direct.
///
/// Backs onto `wifi_iot` for the hotspot, which is the practical fallback when
/// two devices share no Wi-Fi network. iOS cannot host a SoftAP, so this is
/// Android-only by design; the [CompositeRadioAdapter] composes it with mDNS and
/// BLE so the rest of the engine never branches on platform.
library;

import 'dart:io';

import 'package:wifi_iot/wifi_iot.dart';

import '../core/platform/radio_adapter.dart';

class AndroidRadioAdapter implements RadioAdapter {
  @override
  Future<RadioCapabilities> capabilities() async => RadioCapabilities(
        softApCreate: Platform.isAndroid,
        softApJoin: Platform.isAndroid,
        wifiDirect: Platform.isAndroid,
        wifiDirectJoin: Platform.isAndroid,
      );

  @override
  Future<HotspotCredentials> createHotspot() async {
    // Modern Android manages AP credentials itself and no longer lets apps set
    // the SSID/passphrase, so we enable the AP and read back what the OS chose.
    final enabled = await WiFiForIoTPlugin.setWiFiAPEnabled(true);
    if (!enabled) {
      throw UnsupportedError('could not start the local hotspot');
    }
    final ssid = await WiFiForIoTPlugin.getWiFiAPSSID() ?? 'LocalShare';
    final passphrase = await WiFiForIoTPlugin.getWiFiAPPreSharedKey() ?? '';
    return HotspotCredentials(ssid: ssid, passphrase: passphrase);
  }

  @override
  Future<void> joinHotspot(HotspotCredentials credentials) async {
    await WiFiForIoTPlugin.connect(
      credentials.ssid,
      password: credentials.passphrase,
      security: NetworkSecurity.WPA,
      joinOnce: true,
    );
  }

  @override
  Future<void> connectWifiDirect(String deviceId) async {
    // Wi-Fi Direct group negotiation (WifiP2pManager) is not implemented yet;
    // this currently just tears down any active SoftAP. Real group formation
    // needs a native MethodChannel around WifiP2pManager.
    await WiFiForIoTPlugin.setWiFiAPEnabled(false);
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
  Future<void> startBleAdvertising(Map<String, String> payload) async {}

  @override
  Future<void> stopBleAdvertising() async {}

  @override
  Stream<Map<String, String>> scanBle({Duration timeout = const Duration(seconds: 5)}) =>
      const Stream.empty();

  @override
  Future<void> dispose() async {}
}
