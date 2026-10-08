/// Bounded, resumable file reading.
///
/// The engine never loads a whole file: it reads [chunkSize] blocks from a
/// start offset and hands them to the transport. Concurrency is capped by the
/// caller, and resume simply means starting from the receiver's reported offset.
library;

import 'dart:io';

import 'progress.dart';

/// Streams a file in chunks, reporting progress as it goes.
class FileChunker {
  FileChunker({
    required this.path,
    this.chunkSize = 1024 * 1024,
  });

  final String path;
  final int chunkSize;

  /// Stream chunks of the file starting at [startOffset].
  ///
  /// [onProgress] receives cumulative byte counts measured from the start of
  /// the whole file (not from the offset), so resumed transfers show correct
  /// overall progress.
  Stream<List<int>> chunkStream({
    int startOffset = 0,
    void Function(int cumulative)? onProgress,
    bool Function()? isCancelled,
  }) async* {
    final file = File(path);
    final total = await file.length();
    var offset = startOffset;

    final raf = await file.open();
    try {
      if (offset > 0) await raf.setPosition(offset);
      while (offset < total) {
        if (isCancelled?.call() ?? false) break;
        final remaining = total - offset;
        final readSize = remaining < chunkSize ? remaining : chunkSize;
        final block = await raf.read(readSize);
        if (block.isEmpty) break;
        offset += block.length;
        yield block;
        onProgress?.call(offset);
      }
    } finally {
      await raf.close();
    }
  }

  /// Total size of the file in bytes.
  Future<int> get totalBytes async => File(path).length();
}

/// Chooses a chunk size based on file size so tiny files do not spawn overhead
/// and huge files still stream smoothly.
int chooseChunkSize(int totalBytes, {int preferred = 1024 * 1024}) {
  if (totalBytes <= preferred) return totalBytes < 4096 ? 4096 : totalBytes;
  return preferred;
}

/// Convenience: cumulative-progress -> [TransferProgress] adapter.
TransferProgress buildProgress({
  required String fileId,
  required String fileName,
  required int transferred,
  required int total,
  required RateMeter meter,
}) {
  meter.add(transferred);
  return TransferProgress(
    fileId: fileId,
    fileName: fileName,
    transferred: transferred,
    total: total,
    bytesPerSecond: meter.rate,
  );
}
