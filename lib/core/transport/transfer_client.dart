/// Send-side HTTPS client.
///
/// Connects to a peer, pins the peer's certificate to its advertised
/// fingerprint (so a spoofed responder is rejected), negotiates a session, and
/// streams each file in chunks. Uploads of different files run concurrently up
/// to [parallelFiles]; resume starts from the offset the receiver reports.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import '../protocol/models.dart';
import '../protocol/protocol.dart';
import '../util/errors.dart';
import 'chunk_engine.dart';
import '../connection/pinned_client.dart';
import 'progress.dart';

/// A file to send: local path plus metadata.
class OutgoingFile {
  OutgoingFile({
    required this.path,
    required this.descriptor,
    this.relativePath,
  });

  final String path;
  final FileDescriptor descriptor;
  final String? relativePath;
}

/// Sender-side progress callbacks.
abstract class SendObserver {
  void onSessionEstablished(String sessionId) {}
  void onProgress(TransferProgress progress) {}
  void onFileDone(String fileId) {}
  void onError(String fileId, Object error) {}
}

class TransferClient {
  TransferClient({
    required this.expectedFingerprint,
    this.parallelFiles = 3,
    this.chunkSize = kDefaultChunkSize,
  });

  /// The peer's certificate fingerprint we require (TOFU).
  final String expectedFingerprint;
  final int parallelFiles;
  final int chunkSize;

  HttpClient? _client;
  String? _sessionId;

  /// The negotiated session id (set by [openSession]).
  String? get sessionId => _sessionId;

  /// Establish a session. Returns the receiver's response (accepted/resume).
  Future<SessionResponse> openSession({
    required DeviceInfo peer,
    required SessionRequest request,
  }) async {
    final address = peer.bestAddress;
    if (address == null) {
      throw ProtocolError('peer has no dialable address');
    }

    final client = pinnedHttpClient(expectedFingerprint);
    _client = client;

    final uri = Uri.https(
      '$address:${peer.port}',
      '/v1/session',
    );
    final req = await client.postUrl(uri);
    req.headers.contentType = ContentType.json;
    req.headers.set(kHeaderDeviceId, request.deviceId);
    req.headers.set(kHeaderFingerprint, request.fingerprint);
    req.write(encodeJson(request.toJson()));
    final res = await req.close();
    final body = await utf8.decoder.bind(res).join();
    if (res.statusCode != HttpStatus.ok) {
      throw ProtocolError('session request failed: ${res.statusCode} $body');
    }
    final response = SessionResponse.fromJson(decodeJson(body));
    _sessionId = response.sessionId;
    return response;
  }

  /// Upload every file in [files], honouring resume offsets and running up to
  /// [parallelFiles] files at once.
  Future<void> sendAll({
    required DeviceInfo peer,
    required List<OutgoingFile> files,
    required SessionResponse session,
    required SendObserver observer,
  }) async {
    if (!session.accepted) {
      throw SessionRejected(session.reason ?? 'receiver rejected the session');
    }

    final queue = List<OutgoingFile>.from(files);
    final workers = <Future<void>>[];
    for (var i = 0; i < parallelFiles && i < queue.length; i++) {
      workers.add(_worker(peer, queue, session, observer));
    }
    await Future.wait(workers);
  }

  Future<void> _worker(
    DeviceInfo peer,
    List<OutgoingFile> queue,
    SessionResponse session,
    SendObserver observer,
  ) async {
    while (queue.isNotEmpty) {
      final file = queue.removeAt(0);
      try {
        await _sendOne(peer, file, session, observer);
        observer.onFileDone(file.descriptor.id);
      } on Object catch (error) {
        observer.onError(file.descriptor.id, error);
      }
    }
  }

  Future<void> _sendOne(
    DeviceInfo peer,
    OutgoingFile file,
    SessionResponse session,
    SendObserver observer,
  ) async {
    final address = peer.bestAddress!;
    final id = file.descriptor.id;
    final start = startOffsetFor(file, session);
    final total = file.descriptor.size;
    final meter = RateMeter();
    final chunker = FileChunker(path: file.path, chunkSize: chunkSize);

    final uri = Uri.https(
      '$address:${peer.port}',
      '/v1/chunk',
      {'sessionId': session.sessionId, 'fileId': id},
    );
    final req = await _client!.putUrl(uri);
    req.headers.contentType = ContentType.binary;
    req.headers.set(kHeaderSessionId, session.sessionId);

    var cancelled = false;
    await for (final block in chunker.chunkStream(
      startOffset: start,
      isCancelled: () => cancelled,
      onProgress: (cumulative) {
        observer.onProgress(buildProgress(
          fileId: id,
          fileName: file.descriptor.fileName,
          transferred: cumulative,
          total: total,
          meter: meter,
        ));
      },
    )) {
      req.add(block);
    }
    final res = await req.close();
    if (res.statusCode != HttpStatus.ok) {
      final body = await utf8.decoder.bind(res).join();
      cancelled = true;
      throw TransferInterrupted('chunk upload failed: ${res.statusCode} $body', start);
    }
    await res.drain<void>();

    // Finalize: receiver verifies the whole-file checksum.
    final commitUri = Uri.https(
      '$address:${peer.port}',
      '/v1/file/commit',
      {'sessionId': session.sessionId, 'fileId': id},
    );
    final commitReq = await _client!.postUrl(commitUri);
    commitReq.headers.contentType = ContentType.json;
    commitReq.write(encodeJson(CommitRequest(sha256: file.descriptor.sha256).toJson()));
    final commitRes = await commitReq.close();
    final commitBody = await utf8.decoder.bind(commitRes).join();
    final commit = CommitResponse.fromJson(decodeJson(commitBody));
    if (!commit.verified) {
      throw ChecksumMismatch(commit.reason ?? 'receiver reported checksum mismatch');
    }
  }

  /// Bytes already present on the receiver for [file] (resume offset).
  int startOffsetFor(OutgoingFile file, SessionResponse session) {
    final known = session.resume[file.descriptor.id] ?? 0;
    if (known < 0 || known > file.descriptor.size) return 0;
    return known;
  }

  Future<void> close() async {
    _client?.close(force: true);
    _client = null;
  }
}
