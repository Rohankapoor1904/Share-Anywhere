/// Settings & preferences tab: device name, storage, radios and sync.
library;

import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/platform/radio_adapter.dart';
import '../../core/protocol/models.dart';
import '../../core/transport/transfer_client.dart';
import '../../platform/notification_sync.dart';
import '../format.dart';
import '../notifications_controller.dart';
import '../providers.dart';
import '../theme.dart';
import '../widgets/device_icons.dart';
import '../widgets/feedback.dart';
import '../widgets/glass_card.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final name = ref.watch(deviceNameProvider);
    final caps = ref.watch(capabilitiesProvider).valueOrNull;
    final storageDir = ref.watch(storageDirProvider).valueOrNull;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Settings & Preferences',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: AppColors.textPrimary,
              letterSpacing: -0.4,
            ),
          ),
          const SizedBox(height: 18),
          _DeviceNameCard(name: name),
          const SizedBox(height: 14),
          if (storageDir != null) ...[
            _DownloadDirCard(
              path: storageDir.path,
              onChange: () => _changeStorageDirectory(context, ref),
            ),
            const SizedBox(height: 14),
          ],
          if (caps != null) ...[
            _RadioCapabilitiesCard(caps: caps),
            const SizedBox(height: 14),
          ],
          const _ConnectedDevicesCard(),
          const SizedBox(height: 14),
          const _NotificationFeedCard(),
          const SizedBox(height: 14),
          const _NotificationSyncCard(),
        ],
      ),
    );
  }

  Future<void> _changeStorageDirectory(
    BuildContext context,
    WidgetRef ref,
  ) async {
    final selected = await FilePicker.platform.getDirectoryPath(
      dialogTitle: 'Choose where received files are saved',
    );
    if (selected == null || selected.trim().isEmpty || !context.mounted) {
      return;
    }
    try {
      await saveStorageDirectory(ref, selected);
      if (!context.mounted) return;
      showTransferNotice(
        context,
        'Download location updated. New transfers will use this folder.',
        icon: Icons.folder_rounded,
        color: AppColors.success,
      );
    } on Object catch (error) {
      if (context.mounted) {
        showTransferNotice(
          context,
          'Could not change download location: $error',
          icon: Icons.error_outline_rounded,
          color: AppColors.danger,
        );
      }
    }
  }
}

class _SettingsCardHeader extends StatelessWidget {
  const _SettingsCardHeader({
    required this.icon,
    required this.color,
    required this.title,
    this.trailing,
  });

  final IconData icon;
  final Color color;
  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        IconBadge(icon: icon, color: color, size: 18, padding: 7),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            title,
            style: const TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 15,
              color: AppColors.textPrimary,
            ),
          ),
        ),
        if (trailing != null) trailing!,
      ],
    );
  }
}

class _DeviceNameCard extends ConsumerWidget {
  const _DeviceNameCard({required this.name});

  final String name;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SettingsCardHeader(
            icon: Icons.edit_outlined,
            color: AppColors.accent,
            title: 'Device Visible Name',
          ),
          const SizedBox(height: 12),
          TextFormField(
            initialValue: name,
            decoration: const InputDecoration(
              hintText: 'Enter visible device name',
            ),
            onChanged: (value) =>
                ref.read(deviceNameProvider.notifier).state = value,
          ),
        ],
      ),
    );
  }
}

class _DownloadDirCard extends StatelessWidget {
  const _DownloadDirCard({required this.path, required this.onChange});

  final String path;
  final VoidCallback onChange;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SettingsCardHeader(
            icon: Icons.folder_outlined,
            color: AppColors.success,
            title: 'Download Directory',
            trailing: IconButton(
              tooltip: 'Change download folder',
              onPressed: onChange,
              icon: const Icon(Icons.drive_file_move_rounded, size: 20),
            ),
          ),
          const SizedBox(height: 10),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.surfaceHigh.withValues(alpha: 0.5),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.glassBorder),
            ),
            child: SelectableText(
              path,
              style: const TextStyle(
                color: AppColors.textSecondary,
                fontSize: 13,
                fontFamily: 'monospace',
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _RadioCapabilitiesCard extends StatelessWidget {
  const _RadioCapabilitiesCard({required this.caps});

  final RadioCapabilities caps;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SettingsCardHeader(
            icon: Icons.tune_rounded,
            color: AppColors.accentPurple,
            title: 'Radio Capabilities',
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final entry in caps.toJson().entries)
                Chip(
                  avatar: Icon(
                    entry.value
                        ? Icons.check_circle_rounded
                        : Icons.cancel_rounded,
                    size: 16,
                    color:
                        entry.value ? AppColors.success : AppColors.textMuted,
                  ),
                  label: Text(
                    '${entry.key}: ${entry.value ? "Active" : "Unavailable"}',
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ConnectedDevicesCard extends ConsumerWidget {
  const _ConnectedDevicesCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final peers = ref.watch(peersProvider).valueOrNull ?? const <DeviceInfo>[];
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SettingsCardHeader(
            icon: Icons.devices_other_rounded,
            color: AppColors.accent,
            title: 'Connected experience',
            trailing: IconButton(
              tooltip: 'Scan for devices',
              onPressed: () async {
                final node = await ref.read(nodeStartedProvider.future);
                node.rescan();
              },
              icon: const Icon(Icons.refresh_rounded),
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Browse files on a trusted device without exposing folders outside its LocalShare storage.',
            style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
          ),
          const SizedBox(height: 12),
          if (peers.isEmpty)
            const Text(
              'No nearby devices yet.',
              style: TextStyle(color: AppColors.textMuted),
            )
          else
            for (final peer in peers)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(deviceIconFor(peer)),
                title: Text(peer.displayName),
                subtitle: Text(
                  peer.fingerprint.isEmpty
                      ? 'Pair this device before browsing'
                      : 'Trusted connection available',
                ),
                trailing: IconButton(
                  tooltip: 'Browse files',
                  onPressed: peer.fingerprint.isEmpty
                      ? null
                      : () => _browseRemoteFiles(context, peer),
                  icon: const Icon(Icons.folder_open_rounded),
                ),
              ),
        ],
      ),
    );
  }

  Future<void> _browseRemoteFiles(BuildContext context, DeviceInfo peer) async {
    try {
      final entries = await TransferClient(
        expectedFingerprint: peer.fingerprint,
      ).listRemoteFiles(peer: peer);
      if (!context.mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text('${peer.displayName} files'),
          content: SizedBox(
            width: 480,
            child: entries.isEmpty
                ? const Text('This folder is empty.')
                : ListView.builder(
                    shrinkWrap: true,
                    itemCount: entries.length,
                    itemBuilder: (context, index) {
                      final entry = entries[index];
                      return ListTile(
                        leading: Icon(
                          entry.isDirectory
                              ? Icons.folder_rounded
                              : fileIconFor(entry.name),
                        ),
                        title: Text(entry.name),
                        subtitle: Text(
                          entry.isDirectory
                              ? 'Folder'
                              : formatBytes(entry.size),
                        ),
                      );
                    },
                  ),
          ),
        ),
      );
    } on Object catch (error) {
      if (context.mounted) {
        showTransferNotice(
          context,
          'Could not browse ${peer.displayName}: $error',
          icon: Icons.error_outline_rounded,
          color: AppColors.danger,
        );
      }
    }
  }
}

/// Recent synced phone notifications (O+ "Content Sync" feed, Android only).
class _NotificationFeedCard extends ConsumerWidget {
  const _NotificationFeedCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final feed = ref.watch(notificationFeedProvider).valueOrNull ??
        const <AppNotification>[];
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SettingsCardHeader(
            icon: Icons.notifications_active_rounded,
            color: AppColors.accentPurple,
            title: 'Synced notifications',
            trailing: feed.isNotEmpty
                ? TextButton(
                    onPressed: () => _showAll(context, feed),
                    child: const Text('View all'),
                  )
                : null,
          ),
          const SizedBox(height: 6),
          if (feed.isEmpty)
            const Text(
              'Phone notifications shared from a linked device will appear here. Android only.',
              style: TextStyle(color: AppColors.textMuted, fontSize: 12),
            )
          else
            for (final item in feed.take(3))
              ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                leading: const IconBadge(
                  icon: Icons.notifications_rounded,
                  color: AppColors.accentPurple,
                  size: 16,
                  padding: 7,
                ),
                title: Text(
                  item.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary,
                  ),
                ),
                subtitle: Text(
                  item.body,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textMuted,
                  ),
                ),
              ),
        ],
      ),
    );
  }

  Future<void> _showAll(
      BuildContext context, List<AppNotification> feed) async {
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(left: 8, bottom: 12),
                child: Text(
                  'Synced notifications (${feed.length})',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
              Flexible(
                child: ListView.separated(
                  shrinkWrap: true,
                  itemCount: feed.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (context, i) {
                    final item = feed[i];
                    return ListTile(
                      leading: const IconBadge(
                        icon: Icons.notifications_rounded,
                        color: AppColors.accentPurple,
                        size: 18,
                        padding: 8,
                      ),
                      title: Text(
                        item.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          color: AppColors.textPrimary,
                        ),
                      ),
                      subtitle: Text(
                        item.body,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: AppColors.textMuted,
                          fontSize: 12,
                        ),
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NotificationSyncCard extends StatelessWidget {
  const _NotificationSyncCard();

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      child: FutureBuilder<bool>(
        future: NotificationSync.isAccessGranted(),
        builder: (context, snapshot) {
          final granted = snapshot.data ?? false;
          return Row(
            children: [
              Icon(
                granted
                    ? Icons.notifications_active_rounded
                    : Icons.notifications_none_rounded,
                color: granted ? AppColors.success : AppColors.accent,
              ),
              const SizedBox(width: 10),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Notification sync',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    SizedBox(height: 3),
                    Text(
                      'Android permission is required before notifications can be shared.',
                      style: TextStyle(
                        color: AppColors.textSecondary,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              TextButton(
                onPressed: !Platform.isAndroid
                    ? null
                    : () => NotificationSync.openAccessSettings(),
                child: Text(granted ? 'Manage' : 'Enable'),
              ),
            ],
          );
        },
      ),
    );
  }
}
