/// Shared icon resolution so every surface shows the same device / file glyph.
library;

import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../core/protocol/models.dart';
import '../theme.dart';

/// Glyph for this device depending on host OS.
IconData selfDeviceIcon() {
  if (kIsWeb) return Icons.web_rounded;
  if (Platform.isLinux) return Icons.laptop_rounded;
  if (Platform.isWindows) return Icons.laptop_windows_rounded;
  if (Platform.isMacOS) return Icons.laptop_mac_rounded;
  if (Platform.isIOS) return Icons.phone_iphone_rounded;
  return Icons.smartphone_rounded;
}

/// Canonical device glyph for a discovered peer.
IconData deviceIconFor(DeviceInfo device) {
  final platform = device.platform?.toLowerCase() ?? '';
  if (platform.contains('android') || platform.contains('tv')) {
    return platform.contains('tv')
        ? Icons.tv_rounded
        : Icons.smartphone_rounded;
  }
  if (platform.contains('ios')) return Icons.phone_iphone_rounded;
  if (platform.contains('mac') || platform.contains('darwin')) {
    return Icons.laptop_mac_rounded;
  }
  if (platform.contains('win')) return Icons.laptop_windows_rounded;
  if (platform.contains('linux')) return Icons.laptop_rounded;
  if (platform.contains('localsend')) return Icons.sync_rounded;
  return device.discoveredVia == DiscoveryChannel.ble
      ? Icons.bluetooth_rounded
      : Icons.devices_rounded;
}

/// File buckets used by the Transfers tab filters (O+ "Files by type").
enum FileCategory { image, video, audio, document, archive, app, other }

/// Category for a file name, resolved from its extension.
FileCategory fileCategoryFor(String fileName) {
  final ext = fileName.split('.').last.toLowerCase();
  return switch (ext) {
    'jpg' ||
    'jpeg' ||
    'png' ||
    'gif' ||
    'webp' ||
    'svg' ||
    'heic' ||
    'bmp' ||
    'tiff' =>
      FileCategory.image,
    'mp4' || 'mkv' || 'avi' || 'mov' || 'webm' || '3gp' => FileCategory.video,
    'mp3' ||
    'wav' ||
    'flac' ||
    'aac' ||
    'ogg' ||
    'm4a' ||
    'opus' =>
      FileCategory.audio,
    'pdf' ||
    'doc' ||
    'docx' ||
    'odt' ||
    'rtf' ||
    'txt' ||
    'md' ||
    'xls' ||
    'xlsx' ||
    'csv' ||
    'ods' ||
    'ppt' ||
    'pptx' ||
    'odp' =>
      FileCategory.document,
    'zip' ||
    'tar' ||
    'gz' ||
    '7z' ||
    'rar' ||
    'bz2' ||
    'xz' =>
      FileCategory.archive,
    'apk' ||
    'aab' ||
    'exe' ||
    'msi' ||
    'dmg' ||
    'deb' ||
    'appimage' =>
      FileCategory.app,
    _ => FileCategory.other,
  };
}

/// Display metadata (label, glyph, tint) for a [FileCategory].
({String label, IconData icon, Color color}) fileCategoryMeta(
  FileCategory category,
) =>
    switch (category) {
      FileCategory.image => (
          label: 'Images',
          icon: Icons.image_rounded,
          color: AppColors.accentPurple,
        ),
      FileCategory.video => (
          label: 'Videos',
          icon: Icons.movie_rounded,
          color: AppColors.accentPink,
        ),
      FileCategory.audio => (
          label: 'Audio',
          icon: Icons.music_note_rounded,
          color: AppColors.success,
        ),
      FileCategory.document => (
          label: 'Documents',
          icon: Icons.description_rounded,
          color: AppColors.accentDeep,
        ),
      FileCategory.archive => (
          label: 'Archives',
          icon: Icons.folder_zip_rounded,
          color: AppColors.warning,
        ),
      FileCategory.app => (
          label: 'Apps',
          icon: Icons.apps_rounded,
          color: AppColors.accent,
        ),
      FileCategory.other => (
          label: 'Other',
          icon: Icons.insert_drive_file_rounded,
          color: AppColors.textMuted,
        ),
    };

/// Canonical file-type glyph for a file name.
IconData fileIconFor(String fileName) {
  final ext = fileName.split('.').last.toLowerCase();
  return switch (ext) {
    'jpg' ||
    'jpeg' ||
    'png' ||
    'gif' ||
    'webp' ||
    'svg' ||
    'heic' =>
      Icons.image_rounded,
    'mp4' || 'mkv' || 'avi' || 'mov' || 'webm' => Icons.movie_rounded,
    'mp3' ||
    'wav' ||
    'flac' ||
    'aac' ||
    'ogg' ||
    'm4a' =>
      Icons.music_note_rounded,
    'pdf' => Icons.picture_as_pdf_rounded,
    'doc' ||
    'docx' ||
    'odt' ||
    'rtf' ||
    'txt' ||
    'md' =>
      Icons.description_rounded,
    'xls' || 'xlsx' || 'csv' || 'ods' => Icons.table_chart_rounded,
    'ppt' || 'pptx' || 'odp' => Icons.slideshow_rounded,
    'zip' || 'tar' || 'gz' || '7z' || 'rar' => Icons.folder_zip_rounded,
    'apk' || 'aab' => Icons.android_rounded,
    'exe' || 'msi' || 'dmg' || 'deb' || 'appimage' => Icons.apps_rounded,
    _ => Icons.insert_drive_file_rounded,
  };
}

/// Small tinted icon badge used in tile headers, list rows and dialogs.
class IconBadge extends StatelessWidget {
  const IconBadge({
    super.key,
    required this.icon,
    this.color = AppColors.accent,
    this.size = 18,
    this.padding = 8,
    this.gradient = false,
  });

  final IconData icon;
  final Color color;
  final double size;
  final double padding;
  final bool gradient;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.all(padding),
      decoration: BoxDecoration(
        gradient: gradient
            ? LinearGradient(
                colors: [
                  color.withValues(alpha: 0.35),
                  color.withValues(alpha: 0.10),
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              )
            : null,
        color: gradient ? null : color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.35), width: 0.8),
      ),
      child: Icon(icon, size: size, color: color),
    );
  }
}

/// Circular gradient avatar used for peers, the app logo and drop targets.
class GlowAvatar extends StatelessWidget {
  const GlowAvatar({
    super.key,
    required this.icon,
    this.size = 56,
    this.iconSize = 24,
    this.gradient = AppColors.spatialGradient,
  });

  final IconData icon;
  final double size;
  final double iconSize;
  final Gradient gradient;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: gradient,
        border: Border.all(
          color: AppColors.glassBorderHighlight.withValues(alpha: 0.6),
          width: 1.5,
        ),
        boxShadow: const [
          BoxShadow(
            color: AppColors.accentGlow,
            blurRadius: 16,
            spreadRadius: 1,
          ),
          BoxShadow(
            color: AppColors.purpleGlow,
            blurRadius: 18,
            offset: Offset(2, 4),
          ),
        ],
      ),
      child: Center(
        child: Icon(icon, color: Colors.white, size: iconSize),
      ),
    );
  }
}
