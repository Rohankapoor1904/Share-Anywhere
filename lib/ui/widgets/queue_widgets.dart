/// Transfer-queue surfaces: empty dropzone, queued rows and error banner.
library;

import 'package:flutter/material.dart';

import '../format.dart';
import '../send_controller.dart';
import '../theme.dart';
import 'device_icons.dart';

/// Dashed-feel empty dropzone that invites the user to stage files.
class EmptyDropzone extends StatelessWidget {
  const EmptyDropzone({super.key, required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(AppRadius.lg),
          onTap: onTap,
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
            decoration: BoxDecoration(
              color: AppColors.surfaceHigh.withValues(alpha: 0.35),
              borderRadius: BorderRadius.circular(AppRadius.lg),
              border: Border.all(
                color: AppColors.accent.withValues(alpha: 0.3),
                width: 1.5,
              ),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const GlowAvatar(
                  icon: Icons.cloud_upload_rounded,
                  size: 60,
                  iconSize: 28,
                ),
                const SizedBox(height: 12),
                const Text(
                  'Stage Files for Transfer',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                    color: AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Drag and drop files anywhere or tap to browse',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 11, color: AppColors.textMuted),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// One staged file with a type icon, size and remove affordance.
class QueuedFileTile extends StatelessWidget {
  const QueuedFileTile({
    super.key,
    required this.file,
    required this.onRemove,
  });

  final SelectedFile file;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final sizeLabel =
        file.sizeBytes != null ? formatBytes(file.sizeBytes!) : null;
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 3.5),
      decoration: BoxDecoration(
        color: AppColors.surfaceHigh.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(
          color: AppColors.glassBorder,
          width: 0.8,
        ),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 12),
        leading: IconBadge(
          icon: fileIconFor(file.fileName),
          color: AppColors.accent,
          size: 18,
          padding: 7,
        ),
        title: Text(
          file.fileName,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: AppColors.textPrimary,
          ),
        ),
        subtitle: sizeLabel != null
            ? Text(
                sizeLabel,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 11,
                  color: AppColors.textMuted,
                ),
              )
            : null,
        trailing: IconButton(
          tooltip: 'Remove ${file.fileName}',
          icon: const Icon(
            Icons.close_rounded,
            size: 18,
            color: AppColors.textMuted,
          ),
          onPressed: onRemove,
        ),
      ),
    );
  }
}

/// Inline error banner for queue-level send failures.
class QueueErrorBanner extends StatelessWidget {
  const QueueErrorBanner({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: AppColors.danger.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.danger.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.error_outline_rounded,
            color: AppColors.danger,
            size: 16,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(color: AppColors.danger, fontSize: 11),
            ),
          ),
        ],
      ),
    );
  }
}

/// Gradient primary action used to start a transfer.
class QueueSendButton extends StatelessWidget {
  const QueueSendButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.busy = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 48,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: onPressed == null ? null : AppColors.spatialGradient,
          color: onPressed == null ? AppColors.surfaceHigh : null,
          borderRadius: BorderRadius.circular(16),
          boxShadow: onPressed == null
              ? null
              : const [
                  BoxShadow(
                    color: AppColors.accentGlow,
                    blurRadius: 16,
                    offset: Offset(0, 4),
                  ),
                ],
        ),
        child: ElevatedButton.icon(
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.transparent,
            shadowColor: Colors.transparent,
            disabledBackgroundColor: Colors.transparent,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
          ),
          onPressed: busy ? null : onPressed,
          icon: busy
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : const Icon(
                  Icons.send_rounded,
                  color: Colors.white,
                  size: 18,
                ),
          label: Text(
            busy ? 'Sending…' : label,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              fontSize: 14,
            ),
          ),
        ),
      ),
    );
  }
}
