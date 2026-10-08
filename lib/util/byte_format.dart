/// Human-friendly formatting for sizes, rates and remaining time. Decimal
/// units (1000-based) match how OS file managers report transfer sizes.
library;

String formatBytes(int bytes, {int decimals = 1}) {
  if (bytes < 1000) return '$bytes B';
  const units = ['KB', 'MB', 'GB', 'TB'];
  double value = bytes.toDouble();
  int unit = -1;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return '${value.toStringAsFixed(decimals)} ${units[unit]}';
}

String formatRate(double bytesPerSecond) => '${formatBytes(bytesPerSecond.round())}/s';

String formatEta(Duration remaining) {
  if (remaining.inSeconds <= 0) return 'done';
  if (remaining.inHours > 0) {
    return '${remaining.inHours}h ${remaining.inMinutes % 60}m left';
  }
  if (remaining.inMinutes > 0) {
    return '${remaining.inMinutes}m ${remaining.inSeconds % 60}s left';
  }
  return '${remaining.inSeconds}s left';
}
