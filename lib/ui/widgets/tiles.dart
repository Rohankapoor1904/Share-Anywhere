import 'package:flutter/material.dart';

import '../../core/protocol/models.dart';
import '../format.dart';

/// A single row in the received-files list.
class ReceivedFileTile extends StatelessWidget {
  const ReceivedFileTile({super.key, required this.fileName, required this.path});

  final String fileName;
  final String path;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: const Icon(Icons.check_circle_outline, color: Color(0xFF43D9AD)),
      title: Text(fileName, maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Text(path, maxLines: 1, overflow: TextOverflow.ellipsis),
    );
  }
}

/// A row showing an in-flight or finished outbound file.
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
    final remaining = speed <= 0
        ? Duration.zero
        : Duration(seconds: ((total - transferred) / speed).ceil().clamp(0, 1 << 30));

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  fileName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
              Text(
                status == 'done' ? 'Done' : '${(fraction * 100).toStringAsFixed(0)}%',
                style: TextStyle(
                  color: status == 'done' ? const Color(0xFF43D9AD) : null,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(value: fraction, minHeight: 6),
          ),
          const SizedBox(height: 6),
          if (status != 'done')
            Text(
              '${formatBytes(transferred)} / ${formatBytes(total)}  ·  '
              '${formatSpeed(speed)}  ·  ${formatDuration(remaining)} left',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
        ],
      ),
    );
  }
}

/// Small chip describing how a peer was discovered.
class DiscoveryBadge extends StatelessWidget {
  const DiscoveryBadge({super.key, required this.channel});
  final DiscoveryChannel channel;

  @override
  Widget build(BuildContext context) {
    final (icon, label) = switch (channel) {
      DiscoveryChannel.mdns => (Icons.wifi, 'Wi-Fi'),
      DiscoveryChannel.ble => (Icons.bluetooth, 'Bluetooth'),
      DiscoveryChannel.manual => (Icons.edit_location_alt, 'Manual'),
      DiscoveryChannel.unknown => (Icons.devices, 'Nearby'),
    };
    return Chip(
      avatar: Icon(icon, size: 16),
      label: Text(label),
      visualDensity: VisualDensity.compact,
    );
  }
}
