import 'dart:io';
import 'package:device_info_plus/device_info_plus.dart';

/// Detects a meaningful hardware device name (e.g. "Samsung Galaxy S22",
/// "Pixel 7 Pro", "DESKTOP-ROHAN", "MacBook Pro") instead of a generic fallback.
Future<String> getHardwareDeviceName() async {
  try {
    final plugin = DeviceInfoPlugin();
    if (Platform.isAndroid) {
      final info = await plugin.androidInfo;
      var brand = info.brand;
      if (brand.isNotEmpty) {
        brand = brand[0].toUpperCase() + brand.substring(1).toLowerCase();
      }
      final model = info.model;
      if (brand.isNotEmpty &&
          !model.toLowerCase().contains(brand.toLowerCase())) {
        return '$brand $model';
      }
      return model.isNotEmpty ? model : 'Android Device';
    } else if (Platform.isIOS) {
      final info = await plugin.iosInfo;
      return info.name.isNotEmpty
          ? info.name
          : (info.model.isNotEmpty ? info.model : 'iPhone');
    } else if (Platform.isWindows) {
      final info = await plugin.windowsInfo;
      return _desktopName(await _hostName(), info.computerName, 'Windows PC');
    } else if (Platform.isMacOS) {
      final info = await plugin.macOsInfo;
      return _desktopName(info.computerName, 'Mac');
    } else if (Platform.isLinux) {
      final info = await plugin.linuxInfo;
      return _desktopName(await _hostName(), info.prettyName, 'Linux PC');
    }
  } on Object {
    // Device metadata is optional; use the OS hostname below.
  }
  try {
    final hostName = await _hostName();
    if (hostName.isNotEmpty) return hostName;
  } on Object {
    // Keep the stable platform fallback when hostname lookup is unavailable.
  }
  return Platform.operatingSystem;
}

Future<String> _hostName() async => Platform.localHostname.trim();

String _desktopName(String preferred, String fallback, [String? lastResort]) {
  final name = preferred.trim();
  return name.isNotEmpty && name.toLowerCase() != 'localhost'
      ? name
      : (fallback.trim().isNotEmpty ? fallback : (lastResort ?? 'Unknown PC'));
}
