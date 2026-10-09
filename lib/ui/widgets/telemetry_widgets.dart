/// Transfer telemetry: idle stats, security note and stat cards.
library;

import 'package:flutter/material.dart';

import '../theme.dart';

/// Tappable stat card used in the telemetry tile.
class TelemetryStatCard extends StatelessWidget {
  const TelemetryStatCard({
    super.key,
    required this.title,
    required this.value,
    required this.icon,
    required this.color,
    this.onTap,
  });

  final String title;
  final String value;
  final IconData icon;
  final Color color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadius.md),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: AppColors.surfaceHigh.withValues(alpha: 0.5),
            borderRadius: BorderRadius.circular(AppRadius.md),
            border: Border.all(color: AppColors.glassBorder),
          ),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(7),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, size: 16, color: color),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppColors.textMuted,
                      ),
                    ),
                    Text(
                      value,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: color,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Idle telemetry view shown when no transfer is in flight.
class TelemetryIdleView extends StatelessWidget {
  const TelemetryIdleView({
    super.key,
    required this.receivedCount,
    required this.onViewHistory,
  });

  final int receivedCount;
  final VoidCallback onViewHistory;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Row(
          children: [
            Expanded(
              child: TelemetryStatCard(
                title: 'Received',
                value: '$receivedCount',
                icon: Icons.download_done_rounded,
                color: AppColors.success,
                onTap: onViewHistory,
              ),
            ),
            const SizedBox(width: 10),
            const Expanded(
              child: TelemetryStatCard(
                title: 'Security',
                value: 'E2E TLS',
                icon: Icons.lock_outline_rounded,
                color: AppColors.accent,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: AppColors.surfaceHigh.withValues(alpha: 0.5),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.glassBorder),
          ),
          child: const Row(
            children: [
              Icon(
                Icons.shield_outlined,
                size: 15,
                color: AppColors.success,
              ),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Zero internet servers • Direct local peer transmission',
                  style: TextStyle(
                    fontSize: 11,
                    color: AppColors.textSecondary,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
