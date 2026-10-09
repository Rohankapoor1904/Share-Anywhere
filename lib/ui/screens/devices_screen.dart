/// Devices tab: my-device pairing card, favorites and nearby hardware.
///
/// O+ Connect parity: a "Devices" hub showing the linked device at a glance
/// with connection details, favorite peers first, and one-tap send — the
/// same information architecture as O+ (Devices / Files / Transfers).
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/protocol/models.dart';
import '../favorites_controller.dart';
import '../providers.dart';
import '../theme.dart';
import '../widgets/device_icons.dart';
import '../widgets/feedback.dart';
import '../widgets/glass_card.dart';
import '../widgets/states.dart';
import '../widgets/tiles.dart';

class DevicesScreen extends ConsumerWidget {
  const DevicesScreen({
    super.key,
    required this.onSendTo,
    required this.onManualConnect,
    required this.onRescan,
  });

  final ValueChanged<DeviceInfo> onSendTo;
  final VoidCallback onManualConnect;
  final VoidCallback onRescan;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final peersState = ref.watch(peersProvider);
    final peers = peersState.valueOrNull ?? const <DeviceInfo>[];
    final favorites = ref.watch(favoritesProvider);

    final sorted = List<DeviceInfo>.of(peers)
      ..sort((a, b) {
        final favA = favorites.contains(a.deviceId) ? 0 : 1;
        final favB = favorites.contains(b.deviceId) ? 0 : 1;
        if (favA != favB) return favA.compareTo(favB);
        return a.displayName.toLowerCase().compareTo(
              b.displayName.toLowerCase(),
            );
      });

    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
        18,
        18,
        18,
        24 + MediaQuery.paddingOf(context).bottom,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionHeader(
            icon: Icons.devices_rounded,
            title: 'Devices',
            subtitle: peers.isEmpty
                ? 'Your identity and linked hardware'
                : '${peers.length} device${peers.length == 1 ? '' : 's'} nearby',
            color: AppColors.accent,
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                IconButton(
                  tooltip: 'Rescan network',
                  onPressed: onRescan,
                  icon: const Icon(
                    Icons.refresh_rounded,
                    color: AppColors.accent,
                  ),
                ),
                IconButton(
                  tooltip: 'Connect via Direct IP',
                  onPressed: onManualConnect,
                  icon: const Icon(
                    Icons.add_link_rounded,
                    color: AppColors.accentPurple,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          const _MyDeviceCard(),
          const SizedBox(height: 14),
          if (peersState.hasError)
            InlineError(
              title: 'Device discovery is unavailable',
              message: '${peersState.error}',
              retryLabel: 'Retry discovery',
              onRetry: onRescan,
            )
          else if (peersState.isLoading && peers.isEmpty)
            const Center(
              child: Padding(
                padding: EdgeInsets.symmetric(vertical: 32),
                child: CircularProgressIndicator(),
              ),
            )
          else if (peers.isEmpty)
            const EmptyState(
              icon: Icons.wifi_tethering_rounded,
              title: 'No peers detected yet',
              subtitle:
                  'Connect both devices to the same Wi-Fi or Hotspot, or use the link button above to add one by IP.',
              color: AppColors.accentPurple,
            )
          else
            Column(
              children: [
                for (final peer in sorted)
                  _DeviceRow(
                    peer: peer,
                    isFavorite: favorites.contains(peer.deviceId),
                    onSend: () => onSendTo(peer),
                    onToggleFavorite: () => ref
                        .read(favoritesProvider.notifier)
                        .toggleSync(peer.deviceId),
                  ),
              ],
            ),
        ],
      ),
    );
  }
}

/// This device's identity + connection details (O+ "Add device" counterpart).
class _MyDeviceCard extends ConsumerWidget {
  const _MyDeviceCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final name = ref.watch(deviceNameProvider);
    final info = ref.watch(myDeviceInfoProvider);

    return GlassCard(
      glowColor: AppColors.accent,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GlowAvatar(
            icon: selfDeviceIcon(),
            size: 52,
            iconSize: 24,
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 16,
                          color: AppColors.textPrimary,
                          letterSpacing: -0.2,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.success.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: AppColors.success.withValues(alpha: 0.35),
                        ),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.circle,
                            size: 7,
                            color: AppColors.success,
                          ),
                          SizedBox(width: 5),
                          Text(
                            'Online',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: AppColors.success,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                const Text(
                  'This device — others can add you by IP',
                  style: TextStyle(
                    fontSize: 11.5,
                    color: AppColors.textMuted,
                  ),
                ),
                const SizedBox(height: 10),
                info.when(
                  data: (mine) => _ConnectionDetails(
                    addresses: mine.addresses,
                    port: mine.port,
                    fingerprint: mine.fingerprint,
                  ),
                  loading: () => const Text(
                    'Reading network addresses…',
                    style: TextStyle(
                      fontSize: 12,
                      color: AppColors.textMuted,
                    ),
                  ),
                  error: (error, _) => Text(
                    'Network details unavailable: $error',
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.warning,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ConnectionDetails extends StatelessWidget {
  const _ConnectionDetails({
    required this.addresses,
    required this.port,
    required this.fingerprint,
  });

  final List<String> addresses;
  final int port;
  final String fingerprint;

  @override
  Widget build(BuildContext context) {
    final primary = addresses.isEmpty ? 'No LAN address' : addresses.first;
    final shortFp = fingerprint.length <= 16
        ? fingerprint
        : '${fingerprint.substring(0, 16)}…';
    return Column(
      children: [
        _DetailRow(
          icon: Icons.wifi_rounded,
          label: '$primary:$port',
          tooltip: 'Copy address',
          copyText: '$primary:$port',
        ),
        if (addresses.length > 1)
          _DetailRow(
            icon: Icons.lan_rounded,
            label: '+ ${addresses.length - 1} more address'
                '${addresses.length - 1 == 1 ? '' : 'es'}',
            tooltip: 'Copy all addresses',
            copyText: addresses.join(', '),
          ),
        _DetailRow(
          icon: Icons.fingerprint_rounded,
          label: 'ID $shortFp',
          tooltip: 'Copy full fingerprint',
          copyText: fingerprint,
        ),
      ],
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.icon,
    required this.label,
    required this.tooltip,
    required this.copyText,
  });

  final IconData icon;
  final String label;
  final String tooltip;
  final String copyText;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        children: [
          Icon(icon, size: 14, color: AppColors.textMuted),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 12.5,
                color: AppColors.textSecondary,
                fontFamily: 'monospace',
              ),
            ),
          ),
          InkWell(
            borderRadius: BorderRadius.circular(8),
            onTap: () {
              Clipboard.setData(ClipboardData(text: copyText));
              showTransferNotice(
                context,
                'Copied to clipboard',
                icon: Icons.copy_rounded,
                color: AppColors.success,
                duration: const Duration(seconds: 2),
              );
            },
            child: Tooltip(
              message: tooltip,
              child: const Padding(
                padding: EdgeInsets.all(4),
                child: Icon(
                  Icons.copy_rounded,
                  size: 14,
                  color: AppColors.textMuted,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// One nearby peer: favorite star, channel badge and one-tap send.
class _DeviceRow extends StatelessWidget {
  const _DeviceRow({
    required this.peer,
    required this.isFavorite,
    required this.onSend,
    required this.onToggleFavorite,
  });

  final DeviceInfo peer;
  final bool isFavorite;
  final VoidCallback onSend;
  final VoidCallback onToggleFavorite;

  @override
  Widget build(BuildContext context) {
    final address = peer.bestAddress;
    final subtitle = [
      if (address != null) '$address:${peer.port}',
      peer.platform ?? peer.discoveredVia.name,
    ].join(' • ');
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: AppColors.surfaceGlass,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(
          color: isFavorite
              ? AppColors.warning.withValues(alpha: 0.45)
              : AppColors.glassBorder,
        ),
        boxShadow: AppShadows.glowSoft,
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        onTap: onSend,
        leading: GlowAvatar(
          icon: deviceIconFor(peer),
          size: 46,
          iconSize: 20,
        ),
        title: Row(
          children: [
            Expanded(
              child: Text(
                peer.displayName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                  color: AppColors.textPrimary,
                ),
              ),
            ),
            IconButton(
              tooltip: isFavorite ? 'Unpin favorite' : 'Pin as favorite',
              visualDensity: VisualDensity.compact,
              onPressed: onToggleFavorite,
              icon: Icon(
                isFavorite ? Icons.star_rounded : Icons.star_outline_rounded,
                size: 20,
                color: isFavorite ? AppColors.warning : AppColors.textMuted,
              ),
            ),
          ],
        ),
        subtitle: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              subtitle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: AppColors.textMuted,
                fontSize: 12,
              ),
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                DiscoveryBadge(channel: peer.discoveredVia),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 5,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.accent.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: AppColors.accent.withValues(alpha: 0.35),
                    ),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Send',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: AppColors.accent,
                        ),
                      ),
                      SizedBox(width: 4),
                      Icon(
                        Icons.arrow_forward_rounded,
                        size: 13,
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
    );
  }
}
