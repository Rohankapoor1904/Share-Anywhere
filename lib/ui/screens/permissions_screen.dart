/// Requests the runtime permissions discovery and transfer need.
///
/// mDNS and BLE both require explicit grants on modern Android and iOS. The
/// screen returns early on desktop, where no runtime permissions apply.
library;

import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../core/platform/radio_adapter.dart';
import '../theme.dart';

class PermissionsScreen extends StatelessWidget {
  const PermissionsScreen({
    super.key,
    required this.capabilities,
    required this.onGranted,
  });

  final RadioCapabilities capabilities;

  /// Called once the user has responded, so the caller can re-evaluate the
  /// permission state and move on to the discovery screen without a restart.
  final VoidCallback onGranted;

  Future<void> _request(BuildContext context) async {
    final requests = <Permission>[
      if (capabilities.bleScan || capabilities.bleAdvertise) ...[
        Permission.bluetoothScan,
        Permission.bluetoothAdvertise,
        Permission.bluetoothConnect,
      ],
      Permission.nearbyWifiDevices,
      Permission.locationWhenInUse,
    ];
    await requests.request();
    // Re-check the moment the prompt is dismissed; the caller decides whether
    // to proceed or stay put.
    onGranted();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.wifi_tethering,
                      size: 72, color: AppColors.accent),
                  const SizedBox(height: 24),
                  Text('Find nearby devices',
                      style: Theme.of(context).textTheme.headlineMedium),
                  const SizedBox(height: 12),
                  const Text(
                    'LocalShare uses Wi-Fi and Bluetooth only to find and connect to '
                    'devices on your local network. Nothing leaves your network and no '
                    'account is required.',
                  ),
                  const SizedBox(height: 32),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: () => _request(context),
                      child: const Text('Grant permissions'),
                    ),
                  ),
                  TextButton(
                    onPressed: () => openAppSettings(),
                    child: const Text('Open settings'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
