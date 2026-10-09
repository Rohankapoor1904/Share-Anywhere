/// Peer discovery surfaces: protocol pills, peer cards and the strip.
library;

import 'package:flutter/material.dart';

import '../../core/protocol/models.dart';
import '../theme.dart';
import 'device_icons.dart';
import 'states.dart';
import 'tiles.dart';

/// Row of capability pills shown under the radar.
class ProtocolPills extends StatelessWidget {
  const ProtocolPills({super.key});

  @override
  Widget build(BuildContext context) {
    return const Wrap(
      alignment: WrapAlignment.center,
      spacing: 8,
      runSpacing: 6,
      children: [
        _ProtocolPill(title: 'mDNS P2P', icon: Icons.wifi_rounded),
        _ProtocolPill(title: 'BLE Beacon', icon: Icons.bluetooth_rounded),
        _ProtocolPill(title: 'LocalSend v2', icon: Icons.sync_rounded),
      ],
    );
  }
}

class _ProtocolPill extends StatelessWidget {
  const _ProtocolPill({required this.title, required this.icon});

  final String title;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.surfaceHigh.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: AppColors.glassBorder,
          width: 0.6,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 11, color: AppColors.textMuted),
          const SizedBox(width: 4),
          Text(
            title,
            style: const TextStyle(
              fontSize: 10,
              color: AppColors.textMuted,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

/// Single tappable peer card in the horizontal strip.
class PeerCard extends StatelessWidget {
  const PeerCard({super.key, required this.peer, required this.onTap});

  final DeviceInfo peer;
  final ValueChanged<DeviceInfo> onTap;

  @override
  Widget build(BuildContext context) {
    final addressStr = peer.bestAddress ?? 'No IP';
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadius.lg),
        onTap: () => onTap(peer),
        child: Container(
          width: 210,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.surfaceGlass,
            borderRadius: BorderRadius.circular(AppRadius.lg),
            border: Border.all(
              color: AppColors.glassBorder,
              width: 1,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.25),
                blurRadius: 10,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Row(
                children: [
                  GlowAvatar(
                    icon: deviceIconFor(peer),
                    size: 38,
                    iconSize: 16,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      peer.displayName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                        color: AppColors.textPrimary,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                '$addressStr:${peer.port}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 11,
                  color: AppColors.textMuted,
                ),
              ),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  DiscoveryBadge(channel: peer.discoveredVia),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.accent.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          'Send',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            color: AppColors.accent,
                          ),
                        ),
                        SizedBox(width: 3),
                        Icon(
                          Icons.arrow_forward_rounded,
                          size: 10,
                          color: AppColors.accent,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Horizontal peer strip with loading / empty / error handling.
class PeersStrip extends StatelessWidget {
  const PeersStrip({
    super.key,
    required this.peers,
    required this.isLoading,
    this.error,
    required this.onTap,
    required this.onRetry,
  });

  final List<DeviceInfo> peers;
  final bool isLoading;
  final Object? error;
  final ValueChanged<DeviceInfo> onTap;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    if (error != null) {
      return InlineError(
        title: 'Device discovery is unavailable',
        message: '$error',
        retryLabel: 'Retry discovery',
        onRetry: onRetry,
      );
    }
    if (isLoading && peers.isEmpty) {
      return const PeerStripSkeleton();
    }
    if (peers.isEmpty) {
      return const EmptyState(
        icon: Icons.wifi_tethering_rounded,
        title: 'No peers detected yet',
        subtitle:
            'Connect both devices to the same Wi-Fi or Hotspot, or use "Add IP".',
        color: AppColors.accentPurple,
      );
    }
    return ListView.separated(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(vertical: 4),
      itemCount: peers.length,
      separatorBuilder: (_, __) => const SizedBox(width: 10),
      itemBuilder: (context, i) => PeerCard(peer: peers[i], onTap: onTap),
    );
  }
}
