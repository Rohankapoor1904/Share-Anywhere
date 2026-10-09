/// Centralised transient feedback (snack bars) so every surface looks the same.
library;

import 'package:flutter/material.dart';

import '../theme.dart';

/// Shows a short floating notice with a leading icon.
///
/// Hides any currently visible snack bar first, so rapid engine events don't
/// stack up into a queue of stale messages.
void showTransferNotice(
  BuildContext context,
  String message, {
  IconData icon = Icons.info_outline_rounded,
  Color color = AppColors.accent,
  Duration duration = const Duration(seconds: 4),
  SnackBarAction? action,
}) {
  final messenger = ScaffoldMessenger.of(context);
  messenger.hideCurrentSnackBar();
  messenger.showSnackBar(
    SnackBar(
      content: Row(
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(message, maxLines: 2, overflow: TextOverflow.ellipsis),
          ),
        ],
      ),
      behavior: SnackBarBehavior.floating,
      duration: duration,
      action: action,
    ),
  );
}
