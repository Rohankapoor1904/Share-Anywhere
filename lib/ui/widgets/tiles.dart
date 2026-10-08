import 'package:flutter/material.dart';

import '../../core/protocol/models.dart';
import '../format.dart';
import '../theme.dart';

/// A single row in the received-files list with modern card styling.
class ReceivedFileTile extends StatelessWidget {
  const ReceivedFileTile(
      {super.key, required this.fileName, required this.path});

  final String fileName;
  final String path;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: AppColors.surfaceBorder.withValues(alpha: 0.6),
          width: 1,
        ),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
        leading: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: AppColors.success.withValues(alpha: 0.15),
            shape: BoxShape.circle,
          ),
          child: const Icon(
            Icons.check_circle_rounded,
            color: AppColors.success,
            size: 22,
          ),
        ),
        title: Text(
          fileName,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            fontWeight: FontWeight.w600,
            color: AppColors.textPrimary,
          ),
        ),
        subtitle: Text(
          path,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            color: AppColors.textMuted,
            fontSize: 12,
          ),
        ),
      ),
    );
  }
}

/// A card showing an in-flight or finished outbound file transfer.
class TransferTile extends StatelessWidget {
  const TransferTile({
    super.key,
    required this.fileName,
    required this.transferred,
    required this.total,
    required this.speed,
    required this.status,
  });

  final String fileName;
  final int transferred;
  final int total;
  final double speed;
  final String status;

  @override
  Widget build(BuildContext context) {
    final fraction = total <= 0 ? 0.0 : (transferred / total).clamp(0.0, 1.0);
    final isDone = status == 'done';
    final isFailed = status == 'failed';
    final remaining = speed <= 0
        ? Duration.zero
        : Duration(
            seconds: ((total - transferred) / speed).ceil().clamp(0, 1 << 30));

    final iconData = _fileIcon(fileName);

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 6),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDone
              ? AppColors.success.withValues(alpha: 0.3)
              : isFailed
                  ? AppColors.danger.withValues(alpha: 0.3)
                  : AppColors.surfaceBorder,
          width: 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: isDone
                      ? AppColors.success.withValues(alpha: 0.15)
                      : isFailed
                          ? AppColors.danger.withValues(alpha: 0.15)
                          : AppColors.accent.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  isDone
                      ? Icons.check_circle_outline_rounded
                      : isFailed
                          ? Icons.error_outline_rounded
                          : iconData,
                  size: 20,
                  color: isDone
                      ? AppColors.success
                      : isFailed
                          ? AppColors.danger
                          : AppColors.accent,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      fileName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      isDone
                          ? formatBytes(total)
                          : '${formatBytes(transferred)} / ${formatBytes(total)}',
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textMuted,
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: isDone
                      ? AppColors.success.withValues(alpha: 0.15)
                      : isFailed
                          ? AppColors.danger.withValues(alpha: 0.15)
                          : AppColors.surfaceHigh,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  isDone
                      ? 'Done'
                      : isFailed
                          ? 'Failed'
                          : '${(fraction * 100).toStringAsFixed(0)}%',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: isDone
                        ? AppColors.success
                        : isFailed
                            ? AppColors.danger
                            : AppColors.accent,
                  ),
                ),
              ),
            ],
          ),
          if (!isDone && !isFailed) ...[
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(
                value: fraction,
                minHeight: 6,
                backgroundColor: AppColors.surfaceHigh,
                valueColor:
                    const AlwaysStoppedAnimation<Color>(AppColors.accent),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  formatSpeed(speed),
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textSecondary,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                Text(
                  '${formatDuration(remaining)} left',
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textMuted,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  IconData _fileIcon(String name) {
    final ext = name.split('.').last.toLowerCase();
    return switch (ext) {
      'jpg' ||
      'jpeg' ||
      'png' ||
      'gif' ||
      'webp' ||
      'svg' =>
        Icons.image_rounded,
      'mp4' || 'mkv' || 'avi' || 'mov' || 'webm' => Icons.movie_rounded,
      'mp3' || 'wav' || 'flac' || 'aac' || 'ogg' => Icons.music_note_rounded,
      'pdf' => Icons.picture_as_pdf_rounded,
      'zip' || 'tar' || 'gz' || '7z' || 'rar' => Icons.folder_zip_rounded,
      'apk' => Icons.android_rounded,
      _ => Icons.insert_drive_file_rounded,
    };
  }
}

/// Small badge chip describing how a peer was discovered.
class DiscoveryBadge extends StatelessWidget {
  const DiscoveryBadge({super.key, required this.channel});
  final DiscoveryChannel channel;

  @override
  Widget build(BuildContext context) {
    final (icon, label) = switch (channel) {
      DiscoveryChannel.mdns => (Icons.wifi_rounded, 'Wi-Fi'),
      DiscoveryChannel.ble => (Icons.bluetooth_rounded, 'Bluetooth'),
      DiscoveryChannel.manual => (Icons.edit_location_alt_rounded, 'Manual'),
      DiscoveryChannel.unknown => (Icons.devices_rounded, 'Nearby'),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.surfaceHigh,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: AppColors.surfaceBorder.withValues(alpha: 0.5),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: AppColors.accent),
          const SizedBox(width: 4),
          Text(
            label,
            style: const TextStyle(
              fontSize: 11,
              color: AppColors.textSecondary,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
