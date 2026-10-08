/// Streaming SHA-256 helpers.
///
/// Files can be many gigabytes, so we never load them into memory: hashing
/// reads fixed-size blocks and feeds the digest incrementally.
library;

import 'dart:io';

import 'package:convert/convert.dart';
import 'package:crypto/crypto.dart';

/// Hash a file at [path] in streaming fashion and return the hex digest.
///
/// [onProgress] receives (bytesHashed, totalBytes) periodically so the UI can
/// show a "verifying" progress bar.
Future<String> hashFile(
  String path, {
  void Function(int hashed, int total)? onProgress,
}) async {
  final file = File(path);
  final total = await file.length();
  final output = AccumulatorSink<Digest>();
  final input = sha256.startChunkedConversion(output);
  int hashed = 0;

  await for (final chunk in file.openRead()) {
    input.add(chunk);
    hashed += chunk.length;
    onProgress?.call(hashed, total);
  }
  input.close();
  return output.events.single.toString();
}

/// Hash an in-memory byte buffer and return the hex digest.
String hashBytes(List<int> bytes) => sha256.convert(bytes).toString();
