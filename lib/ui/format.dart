/// Formatted byte/speed/duration helpers for the transfer UI.
library;

/// Human-readable file size, e.g. `1.4 GB`.
String formatBytes(int bytes, {int decimals = 1}) {
  if (bytes < 1024) return '$bytes B';
  const units = ['KB', 'MB', 'GB', 'TB'];
  var value = bytes / 1024;
  var unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return '${value.toStringAsFixed(decimals)} ${units[unit]}';
}

/// Transfer rate, e.g. `12.3 MB/s`.
String formatSpeed(double bytesPerSecond) =>
    bytesPerSecond <= 0 ? '—' : '${formatBytes(bytesPerSecond.round())}/s';

/// Compact countdown, e.g. `1m 20s` or `45s`.
String formatDuration(Duration duration) {
  if (duration.inSeconds <= 0) return '—';
  if (duration.inHours > 0) {
    return '${duration.inHours}h ${duration.inMinutes % 60}m';
  }
  if (duration.inMinutes > 0) {
    return '${duration.inMinutes}m ${duration.inSeconds % 60}s';
  }
  return '${duration.inSeconds}s';
}
