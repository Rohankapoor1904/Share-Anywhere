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
      final name = info.computerName;
      return (name.isNotEmpty && name.toLowerCase() != 'localhost')
          ? name
          : 'Windows PC';
    } else if (Platform.isMacOS) {
      final info = await plugin.macOsInfo;
      return info.computerName.isNotEmpty ? info.computerName : 'Mac';
    } else if (Platform.isLinux) {
      final info = await plugin.linuxInfo;
      return info.prettyName.isNotEmpty ? info.prettyName : 'Linux PC';
    }
  } catch (_) {}
  return Platform.operatingSystem;
}
