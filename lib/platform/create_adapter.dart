/// Picks the concrete radio adapters for the running platform.
///
/// Composes mDNS (native `nsd` on iOS/macOS/Android/Windows), BLE
/// (`flutter_blue_plus`) and, on Android, SoftAP/Wi-Fi Direct. On Linux the
/// pure-Dart mDNS client is used because the `nsd` plugin has no Linux backend.
library;

import 'dart:io';

import 'package:flutter/foundation.dart';

import '../core/platform/radio_adapter.dart';
import 'android_radio_adapter.dart';
import 'ble_radio_adapter.dart';
import 'composite_radio_adapter.dart';
import 'dart_radio_adapter.dart';
import 'nsd_radio_adapter.dart';

bool get _nsdSupported =>
    !kIsWeb &&
    (Platform.isAndroid || Platform.isIOS || Platform.isMacOS || Platform.isWindows);

/// BLE is enabled where `flutter_blue_plus` has a reliable backend. Linux is
/// excluded: the plugin's BlueZ path crashes on hosts without D-Bus/BlueZ
/// (common in containers and some minimal desktops), and mDNS already covers
/// LAN discovery there.
bool get _bleSupported =>
    !kIsWeb &&
    (Platform.isAndroid || Platform.isIOS || Platform.isMacOS || Platform.isWindows);

RadioAdapter createRadioAdapter() {
  final parts = <RadioAdapter>[
    if (_nsdSupported) NsdRadioAdapter() else DartMdnsRadioAdapter(),
    if (_bleSupported) BleRadioAdapter(),
    if (Platform.isAndroid) AndroidRadioAdapter(),
  ];
  return CompositeRadioAdapter(parts);
}
