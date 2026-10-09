/// Receive-side HTTPS server.
///
/// Exposes a tiny REST surface over TLS:
///   POST /v1/session                    -> negotiate + accept/reject (+resume)
///   PUT  /v1/chunk?fileId=..            -> append raw bytes, ack new offset
///   POST /v1/file/commit?fileId=..      -> verify SHA-256, finalize
///   POST /v1/cancel                     -> abort a session
///
/// Files are written to `<name>.localshare.part` and only renamed to their
/// final name after the checksum matches, so a partial or corrupt file never
/// masquerades as a complete one.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import '../crypto/hashing.dart';
import '../interop/localsend/localsend_receiver.dart';
import '../protocol/models.dart';
import '../protocol/protocol.dart';
import '../util/errors.dart';

/// Receiver-side callbacks. The UI implements these (usually via the session
/// manager) to decide whether to accept, and to observe progress.
abstract class TransferTarget {
  /// Called for each new session request. Return the decision.
  Future<SessionDecision> onSessionRequest(
    String sessionId,
    SessionRequest request,
  );

  /// Bytes appended for [fileId] (cumulative from 0, not from offset).
  void onProgress(String fileId, int received, int total) {}

  /// A file finished and passed verification.
  void onFileReceived(FileDescriptor file, String path) {}

  /// A session ended (all files done, cancelled, or failed).
  void onSessionEnd(String sessionId, {String? error}) {}
}

/// Receiver's decision for a session request.
class SessionDecision {
  const SessionDecision.accept({this.resume = const {}})
      : accepted = true,
        challengePin = false,
        reason = null;
  const SessionDecision.reject(String this.reason)
      : accepted = false,
        challengePin = false,
        resume = const {};
  const SessionDecision.challenge()
      : accepted = false,
        challengePin = true,
        reason = 'pin_required',
        resume = const {};

  final bool accepted;

  /// True when the receiver wants a PIN before accepting.
  final bool challengePin;

  /// fileId -> bytes already stored (for resume).
  final Map<String, int> resume;
  final String? reason;
}

class _ActiveSession {
  _ActiveSession(this.request, this.sessionId);
  final SessionRequest request;
  final String sessionId;
  final Map<String, IOSink> sinks = {};
  final Map<String, int> received = {};
  bool cancelled = false;
}

class TransferServer {
  TransferServer({
    required this.securityContext,
    required this.target,
    required this.downloadDirectory,
    this.port = kDefaultPort,
    this.maxConcurrentSessions = 4,
    this.localSendReceiver,
  });

  final SecurityContext securityContext;
  final TransferTarget target;
  final Directory downloadDirectory;
  final int port;
  final int maxConcurrentSessions;

  /// Optional LocalSend v2 compatibility layer, mounted on the same server.
  LocalSendReceiver? localSendReceiver;

  HttpServer? _server;
  final Map<String, _ActiveSession> _sessions = {};
  final Random _random = Random.secure();

  int get boundPort => _server?.port ?? port;

  Future<void> start() async {
    await downloadDirectory.create(recursive: true);
    final server = await HttpServer.bindSecure(
      InternetAddress.anyIPv4,
      port,
      securityContext,
      shared: false,
    );
    _server = server;
    unawaited(_serve(server));
  }

  Future<void> _serve(HttpServer server) async {
    await for (final request in server) {
      unawaited(_handle(request).catchError((Object error) async {
        request.response.statusCode = HttpStatus.internalServerError;
        request.response.write('error: $error');
        await request.response.close();
      }));
    }
  }

  Future<void> stop() async {
    for (final session in _sessions.values) {
      await _closeSession(session);
    }
    _sessions.clear();
    await _server?.close(force: true);
    _server = null;
  }

  Future<void> _handle(HttpRequest request) async {
    // LocalSend clients may speak over plain HTTP on the same port; the compat
    // layer handles those routes before our native v1 surface.
    final compat = localSendReceiver;
    if (compat != null && await compat.handle(request)) return;

    switch ('${request.method} ${request.uri.path}') {
      case 'POST /v1/session':
        await _handleSession(request);
        return;
      case 'PUT /v1/chunk':
        await _handleChunk(request);
        return;
      case 'POST /v1/file/commit':
        await _handleCommit(request);
        return;
      case 'POST /v1/cancel':
        await _handleCancel(request);
        return;
      case 'GET /v1/info':
        await _replyJson(request.response, {
          'protocolVersion': kProtocolVersion,
          'service': 'localshare',
          'capabilities': {
            'remoteFiles': true,
            'fileDownload': true,
            'clipboardSync': false,
            'notificationSync': false,
            'keyboardMouseSync': false,
          },
        });
        return;
      case 'GET /v1/files':
        await _handleFiles(request);
        return;
      case 'GET /v1/files/download':
        await _handleFileDownload(request);
        return;
      default:
        request.response.statusCode = HttpStatus.notFound;
        await request.response.close();
    }
  }

  Future<void> _handleFiles(HttpRequest request) async {
    final relative = request.uri.queryParameters['path'] ?? '';
    final path = _safePath(relative);
    final directory = path == null ? null : Directory(path);
    if (directory == null || !directory.existsSync()) {
      request.response.statusCode = HttpStatus.badRequest;
      await request.response.close();
      return;
    }
    if (directory.statSync().type != FileSystemEntityType.directory) {
      request.response.statusCode = HttpStatus.badRequest;
      await request.response.close();
      return;
    }
    final entries = <RemoteFileEntry>[];
    await for (final entity in directory.list(followLinks: false)) {
      final stat = await entity.stat();
      final name = entity.uri.pathSegments.isEmpty
          ? entity.path
          : entity.uri.pathSegments.last;
      final childRelative = relative.isEmpty ? name : '$relative/$name';
      entries.add(RemoteFileEntry(
        name: name,
        relativePath: childRelative,
        size: stat.type == FileSystemEntityType.file ? stat.size : 0,
        modified: stat.modified,
        isDirectory: stat.type == FileSystemEntityType.directory,
      ));
    }
    entries.sort((a, b) {
      if (a.isDirectory != b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.toLowerCase().compareTo(b.name.toLowerCase());
    });
    await _replyJson(request.response, {
      'protocolVersion': kControlProtocolVersion,
      'path': relative,
      'entries': entries.map((entry) => entry.toJson()).toList(),
    });
  }

  Future<void> _handleFileDownload(HttpRequest request) async {
    final relative = request.uri.queryParameters['path'];
    final path = relative == null ? null : _safePath(relative);
    final file = path == null ? null : File(path);
    if (file == null ||
        !file.existsSync() ||
        file.statSync().type != FileSystemEntityType.file) {
      request.response.statusCode = HttpStatus.notFound;
      await request.response.close();
      return;
    }
    request.response.headers.contentType = ContentType.binary;
    request.response.contentLength = await file.length();
    await request.response.addStream(file.openRead());
    await request.response.close();
  }

  String? _safePath(String relative) {
    final normalized = relative.replaceAll('\\', '/');
    if (normalized.startsWith('/') ||
        normalized.split('/').any((part) => part == '..')) {
      return null;
    }
    final root = downloadDirectory.absolute;
    final candidate =
        File('${root.path}${Platform.pathSeparator}$normalized').absolute;
    final rootPath = root.path.endsWith(Platform.pathSeparator)
        ? root.path
        : '${root.path}${Platform.pathSeparator}';
    if (candidate.path != root.path && !candidate.path.startsWith(rootPath)) {
      return null;
    }
    return candidate.path;
  }

  Future<void> _handleSession(HttpRequest request) async {
    final body = await utf8.decoder.bind(request).join();
    final SessionRequest sessionRequest;
    try {
      sessionRequest = SessionRequest.fromJson(decodeJson(body));
    } on Object catch (e) {
      throw ProtocolError('invalid session request: $e');
    }

    if (sessionRequest.protocolVersion != kProtocolVersion) {
      await _replyJson(request.response, {
        'sessionId': '',
        'accepted': false,
        'reason': 'protocol_mismatch',
      });
      return;
    }

    final sessionId = _newSessionId();
    final decision = await target.onSessionRequest(sessionId, sessionRequest);
    if (decision.challengePin) {
      await _replyJson(request.response, {
        'sessionId': '',
        'accepted': false,
        'reason': 'pin_required',
      });
      return;
    }
    if (!decision.accepted) {
      await _replyJson(request.response, {
        'sessionId': '',
        'accepted': false,
        'reason': decision.reason ?? 'rejected',
      });
      return;
    }

    if (_sessions.length >= maxConcurrentSessions) {
      await _replyJson(request.response, {
        'sessionId': '',
        'accepted': false,
        'reason': 'busy',
      });
      return;
    }

    final session = _ActiveSession(sessionRequest, sessionId);
    _sessions[session.sessionId] = session;

    // Report how much of each file already exists so the sender can resume.
    // Partial files are content-addressed by SHA-256, so a transfer that was
    // interrupted (even in an earlier session or run) can continue where it
    // stopped as long as the content is identical.
    final resume = <String, int>{};
    for (final file in sessionRequest.files) {
      final finalFile = File(_finalPathFor(file));
      if (finalFile.existsSync() && finalFile.lengthSync() == file.size) {
        resume[file.id] = file.size;
        continue;
      }
      final part = File(_tempPathFor(file));
      if (part.existsSync()) {
        final length = part.lengthSync();
        if (length > 0 && length <= file.size) {
          resume[file.id] = length;
          session.received[file.id] = length;
        }
      }
    }

    await _replyJson(
      request.response,
      SessionResponse(
              sessionId: session.sessionId, accepted: true, resume: resume)
          .toJson(),
    );
  }

  Future<void> _handleChunk(HttpRequest request) async {
    final session = _requireSession(request);
    final fileId = request.uri.queryParameters['fileId'];
    if (fileId == null) throw ProtocolError('missing fileId');
    final sessionFile = session.request.files.firstWhere(
      (f) => f.id == fileId,
      orElse: () => throw ProtocolError('unknown fileId $fileId'),
    );

    final sink = session.sinks[fileId] ??= _openSink(sessionFile);
    var written = session.received[fileId] ?? 0;
    final limit = sessionFile.size;

    await for (final block in request) {
      if (written + block.length > limit) {
        throw ProtocolError('received more than declared size for $fileId');
      }
      sink.add(block);
      written += block.length;
      session.received[fileId] = written;
      target.onProgress(fileId, written, limit);
    }
    await sink.flush();
    await _replyJson(request.response, ChunkAck(received: written).toJson());
  }

  Future<void> _handleCommit(HttpRequest request) async {
    final session = _requireSession(request);
    final fileId = request.uri.queryParameters['fileId'];
    if (fileId == null) throw ProtocolError('missing fileId');
    final sessionFile = session.request.files.firstWhere(
      (f) => f.id == fileId,
      orElse: () => throw ProtocolError('unknown fileId $fileId'),
    );
    final body = await utf8.decoder.bind(request).join();
    final commit = CommitRequest.fromJson(decodeJson(body));

    await session.sinks.remove(fileId)?.close();
    final tempFile = File(_tempPathFor(sessionFile));
    if (!tempFile.existsSync()) {
      await _replyJson(request.response,
          CommitResponse(verified: false, reason: 'missing_data').toJson());
      return;
    }
    final length = tempFile.lengthSync();
    if (length != sessionFile.size) {
      await _replyJson(request.response,
          CommitResponse(verified: false, reason: 'size_mismatch').toJson());
      return;
    }

    final digest = await _hashFile(tempFile.path);
    if (digest != commit.sha256 || digest != sessionFile.sha256) {
      await _replyJson(
          request.response,
          CommitResponse(verified: false, reason: 'checksum_mismatch')
              .toJson());
      return;
    }

    final finalPath = _finalPathFor(sessionFile);
    final finalFile = File(finalPath);
    await finalFile.parent.create(recursive: true);
    if (finalFile.existsSync()) await finalFile.delete();
    await tempFile.rename(finalPath);
    target.onFileReceived(sessionFile, finalPath);
    await _replyJson(request.response, CommitResponse(verified: true).toJson());
  }

  Future<void> cancelSession(String sessionId,
      {String reason = 'declined'}) async {
    final session = _sessions[sessionId];
    if (session != null) {
      await _closeSession(session);
      target.onSessionEnd(sessionId, error: reason);
    }
  }

  Future<void> _handleCancel(HttpRequest request) async {
    final session = _requireSession(request);
    await _closeSession(session);
    _sessions.remove(session.sessionId);
    target.onSessionEnd(session.sessionId, error: 'cancelled');
    request.response.statusCode = HttpStatus.ok;
    await request.response.close();
  }

  _ActiveSession _requireSession(HttpRequest request) {
    final id = request.uri.queryParameters['sessionId'] ??
        request.headers.value(kHeaderSessionId);
    final session = id == null ? null : _sessions[id];
    if (session == null) throw ProtocolError('unknown or expired session');
    if (session.cancelled) throw ProtocolError('Receiver declined');
    return session;
  }

  IOSink _openSink(FileDescriptor file) {
    final path = _tempPathFor(file);
    final existing = File(path).existsSync() ? File(path).lengthSync() : 0;
    final mode = existing > 0 ? FileMode.append : FileMode.write;
    File(path).parent.createSync(recursive: true);
    return File(path).openWrite(mode: mode);
  }

  /// Partial files live beside their final destination and are content-addressed
  /// by SHA-256 so resume survives new sessions and app restarts.
  String _tempPathFor(FileDescriptor file) {
    final segments = _safeSegments(file);
    final safeName = segments.isEmpty ? 'file' : segments.last;
    return '${downloadDirectory.path}${Platform.pathSeparator}'
        '${file.sha256}$kPartialSuffix.$safeName';
  }

  List<String> _safeSegments(FileDescriptor file) =>
      (file.relativePath ?? file.fileName)
          .split(RegExp(r'[/\\]'))
          .where((s) => s.isNotEmpty && s != '.' && s != '..')
          .map((s) => s.replaceAll(RegExp(r'[^\w\.\- ]'), '_'))
          .toList();

  /// Final destination, with traversal-safe segments and a unique name.
  String _finalPathFor(FileDescriptor file) {
    final segments = _safeSegments(file);
    final safe = segments.isEmpty
        ? 'file_${file.id}'
        : segments.join(Platform.pathSeparator);
    var path = '${downloadDirectory.path}${Platform.pathSeparator}$safe';
    if (File(path).existsSync() && File(path).lengthSync() != file.size) {
      path =
          '${downloadDirectory.path}${Platform.pathSeparator}${segments.isEmpty ? 'file' : segments.last}'
          '(${file.id})';
    }
    return path;
  }

  Future<void> _closeSession(_ActiveSession session) async {
    session.cancelled = true;
    for (final sink in session.sinks.values) {
      await sink.close();
    }
    session.sinks.clear();
  }

  String _newSessionId() {
    final bytes = List<int>.generate(16, (_) => _random.nextInt(256));
    return base64Url.encode(bytes);
  }

  Future<String> _hashFile(String path) => hashFile(path);

  Future<void> _replyJson(
      HttpResponse response, Map<String, Object?> body) async {
    response.headers.contentType = ContentType.json;
    response.write(jsonEncode(body));
    await response.close();
  }
}
