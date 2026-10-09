/// Requests the runtime permissions discovery and transfer need.
///
/// mDNS and BLE both require explicit grants on modern Android and iOS. The
/// screen returns early on desktop, where no runtime permissions apply.
library;

import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../core/platform/radio_adapter.dart';
import '../theme.dart';
import '../widgets/device_icons.dart';
import '../widgets/glass_card.dart';

class PermissionsScreen extends StatelessWidget {
  const PermissionsScreen({
    super.key,
    required this.capabilities,
    required this.onGranted,
    this.onSkip,
  });

  final RadioCapabilities capabilities;

  /// Called once the user has responded, so the caller can re-evaluate the
  /// permission state and move on to the discovery screen without a restart.
  final VoidCallback onGranted;
  final VoidCallback? onSkip;

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
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [
              AppColors.background,
              AppColors.backgroundSecondary,
            ],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: Center(
          child: SingleChildScrollView(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: GlassCard(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 28,
                    vertical: 32,
                  ),
                  glowColor: AppColors.accent,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const GlowAvatar(
                        icon: Icons.wifi_tethering_rounded,
                        size: 84,
                        iconSize: 38,
                      ),
                      const SizedBox(height: 22),
                      Text(
                        'Find nearby devices',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.headlineMedium,
                      ),
                      const SizedBox(height: 10),
                      const Text(
                        'LocalShare uses Wi-Fi and Bluetooth only to find and connect to '
                        'devices on your local network. Nothing leaves your network and no '
                        'account is required.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: AppColors.textSecondary,
                          fontSize: 13.5,
                          height: 1.5,
                        ),
                      ),
                      const SizedBox(height: 14),
                      Wrap(
                        alignment: WrapAlignment.center,
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          if (capabilities.mdnsAdvertise ||
                              capabilities.mdnsDiscover)
                            const _CapabilityChip(
                              icon: Icons.wifi_rounded,
                              label: 'Wi-Fi discovery',
                            ),
                          if (capabilities.bleScan || capabilities.bleAdvertise)
                            const _CapabilityChip(
                              icon: Icons.bluetooth_rounded,
                              label: 'Bluetooth beacons',
                            ),
                        ],
                      ),
                      const SizedBox(height: 26),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton.icon(
                          onPressed: () => _request(context),
                          icon: const Icon(Icons.lock_open_rounded, size: 18),
                          label: const Text('Grant permissions'),
                        ),
                      ),
                      TextButton(
                        onPressed: () => openAppSettings(),
                        child: const Text('Open settings'),
                      ),
                      if (onSkip != null)
                        TextButton(
                          onPressed: onSkip,
                          child: const Text(
                            'Continue anyway (Wi-Fi only)',
                            style: TextStyle(color: AppColors.textSecondary),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _CapabilityChip extends StatelessWidget {
  const _CapabilityChip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.surfaceHigh.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.glassBorder),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: AppColors.accent),
          const SizedBox(width: 6),
          Text(
            label,
            style: const TextStyle(
              fontSize: 11.5,
              color: AppColors.textSecondary,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
