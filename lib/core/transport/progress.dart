/// Progress and resume bookkeeping shared by sender and receiver.
library;

/// Live progress of a single file transfer.
class TransferProgress {
  const TransferProgress({
    required this.fileId,
    required this.fileName,
    required this.transferred,
    required this.total,
    required this.bytesPerSecond,
  });

  final String fileId;
  final String fileName;
  final int transferred;
  final int total;
  final double bytesPerSecond;

  double get fraction => total <= 0 ? 0 : (transferred / total).clamp(0, 1);

  Duration get remaining {
    if (bytesPerSecond <= 0) return Duration.zero;
    final left = (total - transferred) / bytesPerSecond;
    if (left <= 0 || left.isInfinite) return Duration.zero;
    return Duration(seconds: left.ceil());
  }
}

/// Tracks smoothed throughput for a stream of byte counts.
class RateMeter {
  RateMeter({this.window = const Duration(seconds: 3)});
  final Duration window;

  final List<_Sample> _samples = [];

  void add(int cumulativeBytes) {
    final now = DateTime.now();
    _samples.add(_Sample(now, cumulativeBytes));
    _samples.removeWhere((s) => now.difference(s.at) > window);
  }

  /// Bytes per second over the recent window, or 0 with insufficient samples.
  double get rate {
    if (_samples.length < 2) return 0;
    final first = _samples.first;
    final last = _samples.last;
    final seconds = last.at.difference(first.at).inMicroseconds / 1e6;
    if (seconds <= 0) return 0;
    return (last.bytes - first.bytes) / seconds;
  }
}

class _Sample {
  _Sample(this.at, this.bytes);
  final DateTime at;
  final int bytes;
}
