/// Send-side client for the LocalSend v2 upload API.
///
/// Walks the official flow against a discovered peer:
///   POST /api/localsend/v2/prepare-upload  -> session + per-file tokens
///   POST /api/localsend/v2/upload?...       -> raw bytes
///   POST /api/localsend/v2/cancel?sessionId -> best-effort abort
///
/// When the peer advertises `https`, its certificate is pinned to the
/// fingerprint from discovery before any bytes move.
library;

import 'dart:convert';
import 'dart:io';

import '../../connection/pinned_client.dart';
import '../../crypto/hashing.dart';
import '../../protocol/models.dart';
import '../../transport/chunk_engine.dart';
import '../../transport/progress.dart';
import '../../util/errors.dart';
import 'localsend_models.dart';

/// A file to send to a LocalSend peer.
class LocalSendOutgoing {
  LocalSendOutgoing({
    required this.path,
    required this.fileName,
    required this.sha256,
    required this.size,
    this.mime,
  });

  final String path;
  final String fileName;
  final String sha256;
  final int size;
  final String? mime;
}

/// Progress sink for a LocalSend upload.
abstract class LocalSendObserver {
  void onProgress(TransferProgress progress) {}
  void onFileDone(String fileId) {}
  void onError(String fileId, Object error) {}
}

class LocalSendClient {
  LocalSendClient({
    required this.localInfo,
    this.parallelFiles = 3,
    this.chunkSize = 1024 * 1024,
  });

  final LocalSendInfo localInfo;
  final int parallelFiles;
  final int chunkSize;

  HttpClient? _client;
  String? _sessionId;

  String? get sessionId => _sessionId;

  /// Prepare a session with [peer] for [files]. Returns fileId->token, or
  /// throws [SessionRejected] when the peer declines. [pin] is needed when the
  /// peer requires one.
  Future<Map<String, String>> prepare({
    required DeviceInfo peer,
    required List<LocalSendOutgoing> files,
    String? pin,
  }) async {
    final scheme = peer.platform == 'localsend-https' ? 'https' : 'http';
    _client =
        scheme == 'https' ? pinnedHttpClient(peer.fingerprint) : HttpClient();

    final byId = <String, LocalSendFile>{};
    for (var i = 0; i < files.length; i++) {
      final id = '$i-${files[i].fileName}';
      byId[id] = LocalSendFile(
        id: id,
        fileName: files[i].fileName,
        size: files[i].size,
        fileType: files[i].mime,
        sha256: files[i].sha256,
      );
    }

    final query = <String, String>{
      if (pin != null && pin.isNotEmpty) 'pin': pin,
    };
    final uri =
        _uri(peer, scheme, '$kLocalSendApiPrefix/prepare-upload', query);
    final req = await _client!.postUrl(uri);
    req.headers.contentType = ContentType.json;
    req.write(encodeJson(
        LocalSendPrepareRequest(info: localInfo, files: byId).toJson()));
    final res = await req.close();
    final body = await utf8.decoder.bind(res).join();

    if (res.statusCode == LocalSendStatus.pinRequired) {
      throw const SessionRejected('pin_required');
    }
    if (res.statusCode != HttpStatus.ok) {
      throw SessionRejected('peer rejected prepare-upload: ${res.statusCode}');
    }
    final response = LocalSendPrepareResponse.fromJson(decodeJson(body));
    _sessionId = response.sessionId;
    return response.files;
  }

  /// Upload every file, honouring [tokens] from [prepare].
  Future<void> sendAll({
    required DeviceInfo peer,
    required List<LocalSendOutgoing> files,
    required Map<String, String> tokens,
    required LocalSendObserver observer,
  }) async {
    final queue = List<LocalSendOutgoing>.from(files);
    final workers = <Future<void>>[];
    for (var i = 0; i < parallelFiles && i < queue.length; i++) {
      workers.add(_worker(peer, queue, tokens, observer));
    }
    await Future.wait(workers);
  }

  Future<void> _worker(
    DeviceInfo peer,
    List<LocalSendOutgoing> queue,
    Map<String, String> tokens,
    LocalSendObserver observer,
  ) async {
    while (queue.isNotEmpty) {
      final file = queue.removeAt(0);
      final id = tokens.keys.firstWhere(
        (k) => k.endsWith('-${file.fileName}'),
        orElse: () => '',
      );
      try {
        await _uploadOne(peer, id, file, tokens[id]!, observer);
        observer.onFileDone(id);
      } on Object catch (error) {
        observer.onError(id, error);
      }
    }
  }

  Future<void> _uploadOne(
    DeviceInfo peer,
    String fileId,
    LocalSendOutgoing file,
    String token,
    LocalSendObserver observer,
  ) async {
    final address = peer.bestAddress;
    if (address == null) {
      throw const ProtocolError('peer has no dialable address');
    }
    final scheme = peer.platform == 'localsend-https' ? 'https' : 'http';

    final uri = _uri(peer, scheme, '$kLocalSendApiPrefix/upload', {
      'sessionId': _sessionId!,
      'fileId': fileId,
      'token': token,
    });
    final req = await _client!.postUrl(uri);
    req.headers.contentType = ContentType.binary;
    req.headers.set(HttpHeaders.contentLengthHeader, '${file.size}');

    final meter = RateMeter();
    var sent = 0;
    await for (final block in File(file.path).openRead()) {
      req.add(block);
      sent += block.length;
      observer.onProgress(buildProgress(
        fileId: fileId,
        fileName: file.fileName,
        transferred: sent,
        total: file.size,
        meter: meter,
      ));
    }
    final res = await req.close();
    await res.drain<void>();

    if (res.statusCode == LocalSendStatus.checksumMismatch) {
      throw const ChecksumMismatch('peer reported checksum mismatch');
    }
    if (res.statusCode != HttpStatus.ok) {
      throw TransferInterrupted('upload failed: ${res.statusCode}', sent);
    }
  }

  /// Best-effort cancel of the current session.
  Future<void> cancel(DeviceInfo peer) async {
    final sessionId = _sessionId;
    if (sessionId == null) return;
    final scheme = peer.platform == 'localsend-https' ? 'https' : 'http';
    try {
      final req = await _client!.postUrl(
        _uri(peer, scheme, '$kLocalSendApiPrefix/cancel',
            {'sessionId': sessionId}),
      );
      await (await req.close()).drain<void>();
    } on Object {
      // Cancellation is advisory.
    }
  }

  Uri _uri(
      DeviceInfo peer, String scheme, String path, Map<String, String> query) {
    return Uri(
      scheme: scheme,
      host: peer.bestAddress!,
      port: peer.port,
      path: path,
      queryParameters: query,
    );
  }

  Future<void> close() async {
    _client?.close(force: true);
    _client = null;
  }
}

/// Hash a file for the LocalSend `sha256` field.
Future<String> hashForLocalSend(String path) => hashFile(path);
