/// Spatial Liquid Glass tiles and cards for LocalShare.
library;

import 'package:flutter/material.dart';

import '../../core/protocol/models.dart';
import '../format.dart';
import '../theme.dart';

/// A single row in the received-files list with liquid glass card styling.
class ReceivedFileTile extends StatelessWidget {
  const ReceivedFileTile({
    super.key,
    required this.fileName,
    required this.path,
    this.size,
    this.onTap,
    this.onCopy,
  });

  final String fileName;
  final String path;
  final int? size;
  final VoidCallback? onTap;
  final VoidCallback? onCopy;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.surfaceGlass,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: AppColors.glassBorder,
          width: 0.8,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.25),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
        onTap: onTap,
        leading: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [
                AppColors.success.withValues(alpha: 0.25),
                AppColors.success.withValues(alpha: 0.08),
              ],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: AppColors.success.withValues(alpha: 0.35),
              width: 0.8,
            ),
          ),
          child: const Icon(
            Icons.check_circle_rounded,
            color: AppColors.success,
            size: 20,
          ),
        ),
        title: Text(
          fileName,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            fontWeight: FontWeight.w700,
            fontSize: 14,
            color: AppColors.textPrimary,
            letterSpacing: -0.2,
          ),
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 2),
          child: Text(
            size != null ? '${formatBytes(size!)} • $path' : path,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: AppColors.textMuted,
              fontSize: 12,
            ),
          ),
        ),
        trailing: onCopy != null
            ? IconButton(
                tooltip: 'Copy path',
                icon: const Icon(Icons.copy_rounded,
                    size: 18, color: AppColors.textSecondary),
                onPressed: onCopy,
              )
            : null,
      ),
    );
  }
}

/// A spatial glass card showing an active, finished, or failed file transfer.
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
      margin: const EdgeInsets.symmetric(vertical: 5),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surfaceGlass,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: isDone
              ? AppColors.success.withValues(alpha: 0.4)
              : isFailed
                  ? AppColors.danger.withValues(alpha: 0.4)
                  : AppColors.glassBorder,
          width: 1,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.3),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
          if (isDone)
            BoxShadow(
              color: AppColors.success.withValues(alpha: 0.15),
              blurRadius: 16,
            ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(9),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      (isDone
                              ? AppColors.success
                              : isFailed
                                  ? AppColors.danger
                                  : AppColors.accent)
                          .withValues(alpha: 0.25),
                      (isDone
                              ? AppColors.success
                              : isFailed
                                  ? AppColors.danger
                                  : AppColors.accent)
                          .withValues(alpha: 0.08),
                    ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: (isDone
                            ? AppColors.success
                            : isFailed
                                ? AppColors.danger
                                : AppColors.accent)
                        .withValues(alpha: 0.4),
                  ),
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
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                        color: AppColors.textPrimary,
                        letterSpacing: -0.2,
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
                          : AppColors.accent.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: isDone
                        ? AppColors.success.withValues(alpha: 0.35)
                        : isFailed
                            ? AppColors.danger.withValues(alpha: 0.35)
                            : AppColors.accent.withValues(alpha: 0.35),
                    width: 0.8,
                  ),
                ),
                child: Text(
                  isDone
                      ? 'Completed'
                      : isFailed
                          ? 'Failed'
                          : '${(fraction * 100).toStringAsFixed(0)}%',
                  style: TextStyle(
                    fontSize: 11,
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
              borderRadius: BorderRadius.circular(8),
              child: Stack(
                children: [
                  Container(
                    height: 6,
                    color: AppColors.surfaceHigh,
                  ),
                  FractionallySizedBox(
                    widthFactor: fraction,
                    child: Container(
                      height: 6,
                      decoration: const BoxDecoration(
                        gradient: AppColors.spatialGradient,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(Icons.speed_rounded,
                        size: 13, color: AppColors.accent),
                    const SizedBox(width: 4),
                    Text(
                      formatSpeed(speed),
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textSecondary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
                Text(
                  '${formatDuration(remaining)} remaining',
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

/// Small frosted badge chip describing how a peer was discovered.
class DiscoveryBadge extends StatelessWidget {
  const DiscoveryBadge({super.key, required this.channel});
  final DiscoveryChannel channel;

  @override
  Widget build(BuildContext context) {
    final (icon, label, color) = switch (channel) {
      DiscoveryChannel.mdns => (Icons.wifi_rounded, 'Wi-Fi', AppColors.accent),
      DiscoveryChannel.ble => (
          Icons.bluetooth_rounded,
          'BLE',
          AppColors.accentPurple
        ),
      DiscoveryChannel.manual => (
          Icons.edit_location_alt_rounded,
          'Direct IP',
          AppColors.warning
        ),
      DiscoveryChannel.unknown => (
          Icons.devices_rounded,
          'Nearby',
          AppColors.textMuted
        ),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: color.withValues(alpha: 0.3),
          width: 0.8,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 10,
              color: color,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}
