/// Share-hub Bento grid: radar, peers, queue and telemetry tiles.
///
/// This is the visual centrepiece extracted from the former monolithic
/// `HomeScreen`. It stays purely presentational — engine actions arrive as
/// callbacks so the parent shell owns `BuildContext`-dependent feedback.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/protocol/models.dart';
import '../format.dart';
import '../providers.dart';
import '../receive_controller.dart';
import '../send_controller.dart';
import '../theme.dart';
import '../widgets/glass_card.dart';
import '../widgets/peer_widgets.dart';
import '../widgets/queue_widgets.dart';
import '../widgets/radar_view.dart';
import '../widgets/telemetry_widgets.dart';
import '../widgets/tiles.dart';

class ShareHubScreen extends ConsumerWidget {
  const ShareHubScreen({
    super.key,
    required this.isActive,
    required this.onRescan,
    required this.onManualConnect,
    required this.onAddFiles,
    required this.onAddNote,
    required this.onClearQueue,
    required this.onRemoveFile,
    required this.onSendTo,
    required this.onSendAll,
    required this.onViewHistory,
  });

  /// Whether the hub tab is currently visible (pauses the radar when hidden).
  final bool isActive;
  final VoidCallback onRescan;
  final VoidCallback onManualConnect;
  final VoidCallback onAddFiles;
  final VoidCallback onAddNote;
  final VoidCallback onClearQueue;
  final ValueChanged<SelectedFile> onRemoveFile;
  final ValueChanged<DeviceInfo> onSendTo;
  final VoidCallback onSendAll;
  final VoidCallback onViewHistory;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isWide = MediaQuery.sizeOf(context).width >= AppBreakpoints.wide;
    if (isWide) return _desktopLayout(context, ref);
    return _mobileLayout(context, ref);
  }

  // -- Layouts ---------------------------------------------------------------

  Widget _desktopLayout(BuildContext context, WidgetRef ref) {
    return LayoutBuilder(
      builder: (context, constraints) => Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(
            maxWidth: AppBreakpoints.maxContentWidth,
          ),
          child: Padding(
            padding: EdgeInsets.fromLTRB(
              constraints.maxWidth > 1200 ? 28 : 18,
              18,
              constraints.maxWidth > 1200 ? 28 : 18,
              24,
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  flex: 5,
                  child: Column(
                    children: [
                      Expanded(flex: 6, child: _radarHub(context, ref)),
                      const SizedBox(height: AppSpacing.tileGap),
                      Expanded(flex: 4, child: _peersTile(context, ref)),
                    ],
                  ),
                ),
                const SizedBox(width: AppSpacing.tileGap),
                Expanded(
                  flex: 4,
                  child: Column(
                    children: [
                      Expanded(flex: 6, child: _queueTile(context, ref)),
                      const SizedBox(height: AppSpacing.tileGap),
                      Expanded(flex: 4, child: _telemetryTile(ref)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _mobileLayout(BuildContext context, WidgetRef ref) {
    final bottomPad = MediaQuery.paddingOf(context).bottom;
    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(14, 10, 14, 24 + bottomPad + 72),
      child: Column(
        children: [
          SizedBox(height: 330, child: _radarHub(context, ref)),
          const SizedBox(height: AppSpacing.tileGap),
          SizedBox(height: 230, child: _peersTile(context, ref)),
          const SizedBox(height: AppSpacing.tileGap),
          SizedBox(height: 350, child: _queueTile(context, ref)),
          const SizedBox(height: AppSpacing.tileGap),
          SizedBox(height: 260, child: _telemetryTile(ref)),
        ],
      ),
    );
  }

  // -- Tile 1: radar ----------------------------------------------------------

  Widget _radarHub(BuildContext context, WidgetRef ref) {
    final peers = ref.watch(peersProvider).valueOrNull ?? const <DeviceInfo>[];
    final reduceMotion = MediaQuery.disableAnimationsOf(context);

    return BentoTile(
      title: 'Holographic Radar Hub',
      subtitle: 'Scanning LAN & Bluetooth for LocalShare & LocalSend peers',
      icon: Icons.radar_rounded,
      iconColor: AppColors.accent,
      badgeText: peers.isEmpty ? 'Scanning' : '${peers.length} in range',
      badgeColor: peers.isEmpty ? AppColors.accent : AppColors.success,
      trailing: TextButton.icon(
        style: TextButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          backgroundColor: AppColors.surfaceHigh.withValues(alpha: 0.5),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
            side: const BorderSide(color: AppColors.glassBorder),
          ),
        ),
        onPressed: onRescan,
        icon: const Icon(
          Icons.refresh_rounded,
          size: 14,
          color: AppColors.accent,
        ),
        label: const Text(
          'Rescan',
          style: TextStyle(fontSize: 11, color: AppColors.accent),
        ),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final radarSize =
              (constraints.biggest.shortestSide * 0.90).clamp(180.0, 360.0);
          return Column(
            children: [
              Expanded(
                child: Center(
                  child: RepaintBoundary(
                    child: RadarView(
                      size: radarSize,
                      devices: peers,
                      active: isActive && !reduceMotion,
                      onDeviceTap: onSendTo,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 6),
              const ProtocolPills(),
            ],
          );
        },
      ),
    );
  }

  // -- Tile 2: peers ----------------------------------------------------------

  Widget _peersTile(BuildContext context, WidgetRef ref) {
    final peersState = ref.watch(peersProvider);
    final peers = peersState.valueOrNull ?? const <DeviceInfo>[];
    final isLoading = peersState.isLoading;

    return BentoTile(
      title: 'Discovered Peers',
      subtitle: 'Tap any peer to immediately send staged files',
      icon: Icons.devices_rounded,
      iconColor: AppColors.accentPurple,
      badgeText: '${peers.length}',
      badgeColor: AppColors.accentPurple,
      trailing: TextButton.icon(
        style: TextButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          backgroundColor: AppColors.surfaceHigh.withValues(alpha: 0.5),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
            side: const BorderSide(color: AppColors.glassBorder),
          ),
        ),
        onPressed: onManualConnect,
        icon: const Icon(
          Icons.add_link_rounded,
          size: 14,
          color: AppColors.accentPurple,
        ),
        label: const Text(
          'Add IP',
          style: TextStyle(fontSize: 11, color: AppColors.accentPurple),
        ),
      ),
      child: PeersStrip(
        peers: peers,
        isLoading: isLoading,
        error: peersState.hasError ? peersState.error : null,
        onTap: onSendTo,
        onRetry: onRescan,
      ),
    );
  }

  // -- Tile 3: queue ----------------------------------------------------------

  Widget _queueTile(BuildContext context, WidgetRef ref) {
    final send = ref.watch(sendControllerProvider);
    final files = send.files;
    final totalBytes = send.totalStagedBytes;
    final subtitle = files.isEmpty
        ? 'Drop files here or stage files for sending'
        : totalBytes != null
            ? '${files.length} file(s) • ${formatBytes(totalBytes)} staged'
            : '${files.length} file(s) staged and ready to transfer';

    return BentoTile(
      title: 'Transfer Queue',
      subtitle: subtitle,
      icon: Icons.cloud_upload_outlined,
      iconColor: AppColors.accent,
      badgeText: files.isEmpty ? 'Empty' : '${files.length}',
      badgeColor: files.isEmpty ? AppColors.textMuted : AppColors.accent,
      trailing: files.isNotEmpty
          ? Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                IconButton(
                  tooltip: 'Share a text note',
                  icon: const Icon(
                    Icons.note_add_rounded,
                    size: 20,
                    color: AppColors.accentPurple,
                  ),
                  onPressed: onAddNote,
                ),
                IconButton(
                  tooltip: 'Add more files',
                  icon: const Icon(
                    Icons.add_rounded,
                    size: 20,
                    color: AppColors.accent,
                  ),
                  onPressed: onAddFiles,
                ),
                IconButton(
                  tooltip: 'Clear queue',
                  icon: const Icon(
                    Icons.clear_all_rounded,
                    size: 20,
                    color: AppColors.danger,
                  ),
                  onPressed: onClearQueue,
                ),
              ],
            )
          : null,
      child: Column(
        children: [
          Expanded(
            child: files.isEmpty
                ? Column(
                    children: [
                      Expanded(child: EmptyDropzone(onTap: onAddFiles)),
                      TextButton.icon(
                        onPressed: onAddNote,
                        icon: const Icon(
                          Icons.note_add_rounded,
                          size: 16,
                        ),
                        label: const Text('or share a text note'),
                      ),
                    ],
                  )
                : ListView.builder(
                    itemCount: files.length,
                    itemBuilder: (context, i) {
                      final file = files[i];
                      return QueuedFileTile(
                        file: file,
                        onRemove: () => onRemoveFile(file),
                      );
                    },
                  ),
          ),
          if (files.isNotEmpty) ...[
            const SizedBox(height: 12),
            QueueSendButton(
              label: 'Send ${files.length} File(s) to Peer',
              busy: send.busy,
              onPressed: send.busy ? null : onSendAll,
            ),
          ],
          if (send.error != null) ...[
            const SizedBox(height: 8),
            QueueErrorBanner(message: send.error!),
          ],
        ],
      ),
    );
  }

  // -- Tile 4: telemetry ------------------------------------------------------

  Widget _telemetryTile(WidgetRef ref) {
    final send = ref.watch(sendControllerProvider);
    final inFlightJobs = send.jobs.values.toList();
    final history = ref.watch(receivedFilesHistoryProvider);

    return BentoTile(
      title: 'Transfer Telemetry',
      subtitle: inFlightJobs.isNotEmpty
          ? '${inFlightJobs.length} active transfer(s) in progress'
          : 'High-speed local encrypted pipeline active',
      icon: Icons.speed_rounded,
      iconColor: AppColors.success,
      badgeText:
          inFlightJobs.isNotEmpty ? '${inFlightJobs.length} Active' : 'Standby',
      badgeColor:
          inFlightJobs.isNotEmpty ? AppColors.accent : AppColors.success,
      trailing: TextButton(
        style: TextButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          minimumSize: Size.zero,
        ),
        onPressed: onViewHistory,
        child: const Text(
          'History',
          style: TextStyle(fontSize: 11, color: AppColors.accent),
        ),
      ),
      child: inFlightJobs.isNotEmpty
          ? ListView(
              padding: EdgeInsets.zero,
              children: [
                for (final job in inFlightJobs)
                  TransferTile(
                    fileName: job.fileName,
                    transferred: job.transferred,
                    total: job.total,
                    speed: job.bytesPerSecond,
                    status: job.status,
                  ),
              ],
            )
          : TelemetryIdleView(
              receivedCount: history.length,
              onViewHistory: onViewHistory,
            ),
    );
  }
}
