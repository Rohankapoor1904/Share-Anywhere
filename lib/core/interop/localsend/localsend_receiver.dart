/// Receive-side implementation of the LocalSend v2 upload API.
///
/// Mounted onto [TransferServer] so official LocalSend clients can push files
/// to LocalShare. It reuses LocalShare's own accept/pairing policy and writes
/// through the same traversal-safe, verify-then-rename path as native
/// transfers, so a LocalSend upload gets identical integrity guarantees.
///
/// Routes:
///   POST /api/localsend/v2/register         -> identity exchange
///   POST /api/localsend/v2/prepare-upload   -> accept/reject + tokens
///   POST /api/localsend/v2/upload           -> raw bytes (query-pinned)
///   POST /api/localsend/v2/cancel           -> abort
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import '../../crypto/hashing.dart';
import '../../protocol/models.dart';
import '../../protocol/protocol.dart';
import '../../transport/transfer_server.dart';
import 'localsend_models.dart';

/// What the compat layer needs from the engine.
abstract class LocalSendHost {
  /// Our advertised identity.
  LocalSendInfo get info;

  /// Decide on an incoming LocalSend session (reuse the PIN/trust policy).
  Future<SessionDecision> onLocalSendSession(SessionRequest request);

  /// Bytes appended for a file (cumulative).
  void onLocalSendProgress(String fileId, int received, int total) {}

  /// A file finished and passed verification.
  void onLocalSendFileReceived(FileDescriptor file, String path) {}
}

class _LocalSendSession {
  _LocalSendSession(this.request, this.sessionId);
  final SessionRequest request;
  final String sessionId;

  /// fileId -> upload token.
  final Map<String, String> tokens = {};
  final Map<String, IOSink> sinks = {};
  final Map<String, int> received = {};
  bool cancelled = false;
}

class LocalSendReceiver {
  LocalSendReceiver({
    required this.host,
    required this.downloadDirectory,
    this.maxConcurrentSessions = 4,
  });

  final LocalSendHost host;
  final Directory downloadDirectory;
  final int maxConcurrentSessions;

  /// Called when a peer announces itself via `register`, so the engine can add
  /// it to the discovered peer list.
  void Function(Map<String, Object?> info, String address)? onRegister;

  final Map<String, _LocalSendSession> _sessions = {};
  final Random _random = Random.secure();

  /// Handles a v2 route. Returns false when [path] is not a LocalSend route, so
  /// the caller can fall through to other handlers.
  Future<bool> handle(HttpRequest request) async {
    final path = request.uri.path;
    if (!path.startsWith(kLocalSendApiPrefix)) return false;

    switch ('${request.method} $path') {
      case 'POST $kLocalSendApiPrefix/register':
        await _register(request);
      case 'GET $kLocalSendApiPrefix/info':
        await _replyJson(request.response, host.info.toJson());
      case 'POST $kLocalSendApiPrefix/prepare-upload':
        await _prepareUpload(request);
      case 'POST $kLocalSendApiPrefix/upload':
        await _upload(request);
      case 'POST $kLocalSendApiPrefix/cancel':
        await _cancel(request);
      default:
        request.response.statusCode = HttpStatus.notFound;
        await request.response.close();
    }
    return true;
  }

  Future<void> _register(HttpRequest request) async {
    final body = await utf8.decoder.bind(request).join();
    // The peer's alias/port are informational; we only reply with our own info.
    if (body.isNotEmpty) {
      try {
        final json = (jsonDecode(body) as Map).cast<String, Object?>();
        final address = request.connectionInfo?.remoteAddress.address;
        if (address != null) onRegister?.call(json, address);
      } on Object {
        request.response.statusCode = LocalSendStatus.badRequest;
        await request.response.close();
        return;
      }
    }
    await _replyJson(request.response, host.info.toJson());
  }

  Future<void> _prepareUpload(HttpRequest request) async {
    final body = await utf8.decoder.bind(request).join();
    final LocalSendPrepareRequest prepare;
    try {
      prepare = LocalSendPrepareRequest.fromJson(
        (jsonDecode(body) as Map).cast<String, Object?>(),
      );
    } on Object {
      request.response.statusCode = LocalSendStatus.badRequest;
      await request.response.close();
      return;
    }
    if (prepare.files.isEmpty) {
      request.response.statusCode = LocalSendStatus.badRequest;
      await request.response.close();
      return;
    }

    final pin = request.uri.queryParameters['pin'];
    final request0 = _toSessionRequest(prepare, pin);
    final decision = await host.onLocalSendSession(request0);

    if (!decision.accepted) {
      request.response.statusCode = localSendStatusForReason(decision.reason);
      await request.response.close();
      return;
    }
    if (_sessions.length >= maxConcurrentSessions) {
      request.response.statusCode = LocalSendStatus.blockedBySession;
      await request.response.close();
      return;
    }

    final sessionId = _token(16);
    final session = _LocalSendSession(request0, sessionId);
    for (final id in prepare.files.keys) {
      session.tokens[id] = _token(12);
    }
    _sessions[sessionId] = session;

    await _replyJson(
      request.response,
      LocalSendPrepareResponse(sessionId: sessionId, files: session.tokens)
          .toJson(),
    );
  }

  Future<void> _upload(HttpRequest request) async {
    final params = request.uri.queryParameters;
    final session = _sessions[params['sessionId']];
    final fileId = params['fileId'];
    final token = params['token'];
    if (session == null || fileId == null || token == null) {
      request.response.statusCode = LocalSendStatus.badRequest;
      await request.response.close();
      return;
    }
    if (session.cancelled || session.tokens[fileId] != token) {
      request.response.statusCode = LocalSendStatus.rejected;
      await request.response.close();
      return;
    }

    final file = session.request.files.firstWhere(
      (f) => f.id == fileId,
      orElse: () => throw StateError('unknown fileId'),
    );
    if (request.contentLength > file.size) {
      request.response.statusCode = LocalSendStatus.badRequest;
      await request.response.close();
      return;
    }

    final sink = session.sinks[fileId] ??= _openSink(file);
    var written = session.received[fileId] ?? 0;
    await for (final block in request) {
      if (written + block.length > file.size) {
        request.response.statusCode = LocalSendStatus.badRequest;
        await request.response.close();
        return;
      }
      sink.add(block);
      written += block.length;
      session.received[fileId] = written;
      host.onLocalSendProgress(fileId, written, file.size);
    }
    await sink.flush();
    await sink.close();
    session.sinks.remove(fileId);

    if (written != file.size) {
      request.response.statusCode = LocalSendStatus.badRequest;
      await request.response.close();
      return;
    }

    final temp = File(_tempPathFor(file));
    if (file.sha256.isNotEmpty) {
      final digest = await hashFile(temp.path);
      if (digest != file.sha256) {
        request.response.statusCode = LocalSendStatus.checksumMismatch;
        await request.response.close();
        return;
      }
    }
    final finalPath = _finalPathFor(file);
    final finalFile = File(finalPath);
    await finalFile.parent.create(recursive: true);
    if (finalFile.existsSync()) await finalFile.delete();
    await temp.rename(finalPath);
    host.onLocalSendFileReceived(file, finalPath);

    request.response.statusCode = HttpStatus.ok;
    await request.response.close();
  }

  Future<void> _cancel(HttpRequest request) async {
    final session = _sessions[request.uri.queryParameters['sessionId']];
    if (session != null) {
      await _closeSession(session);
      _sessions.remove(session.sessionId);
    }
    request.response.statusCode = HttpStatus.ok;
    await request.response.close();
  }

  SessionRequest _toSessionRequest(
      LocalSendPrepareRequest prepare, String? pin) {
    final files = prepare.files.values.map((f) {
      return FileDescriptor(
        id: f.id,
        fileName: f.fileName,
        size: f.size,
        sha256: f.sha256 ?? '',
        mime: f.fileType,
      );
    }).toList();
    return SessionRequest(
      protocolVersion: 2,
      deviceId: prepare.info.fingerprint.isEmpty
          ? prepare.info.alias
          : prepare.info.fingerprint,
      displayName: prepare.info.alias,
      fingerprint: prepare.info.fingerprint,
      files: files,
      pin: pin,
    );
  }

  IOSink _openSink(FileDescriptor file) {
    final path = _tempPathFor(file);
    final existing = File(path).existsSync() ? File(path).lengthSync() : 0;
    File(path).parent.createSync(recursive: true);
    return File(path)
        .openWrite(mode: existing > 0 ? FileMode.append : FileMode.write);
  }

  String _tempPathFor(FileDescriptor file) => '${downloadDirectory.path}'
      '${Platform.pathSeparator}${_safeName(file)}$kPartialSuffix';

  String _finalPathFor(FileDescriptor file) {
    var path =
        '${downloadDirectory.path}${Platform.pathSeparator}${_safeName(file)}';
    if (File(path).existsSync()) {
      path =
          '${downloadDirectory.path}${Platform.pathSeparator}${_dedupeName(file)}';
    }
    return path;
  }

  /// Traversal-safe single file name (LocalSend has no folder semantics).
  String _safeName(FileDescriptor file) {
    final base = file.fileName.split(RegExp(r'[/\\]')).last;
    final cleaned = base.replaceAll(RegExp(r'[^\w\.\- ]'), '_');
    return cleaned.isEmpty ? 'file_${file.id}' : cleaned;
  }

  String _dedupeName(FileDescriptor file) {
    final name = _safeName(file);
    final dot = name.lastIndexOf('.');
    if (dot <= 0) return '$name (1)';
    return '${name.substring(0, dot)} (1)${name.substring(dot)}';
  }

  Future<void> _closeSession(_LocalSendSession session) async {
    session.cancelled = true;
    for (final sink in session.sinks.values) {
      await sink.close();
    }
    session.sinks.clear();
  }

  String _token(int bytes) {
    final data = List<int>.generate(bytes, (_) => _random.nextInt(256));
    return base64Url.encode(data);
  }

  Future<void> _replyJson(
      HttpResponse response, Map<String, Object?> body) async {
    response.headers.contentType = ContentType.json;
    response.write(jsonEncode(body));
    await response.close();
  }
}
