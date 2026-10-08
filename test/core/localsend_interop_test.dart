/// LocalSend v2 interop tests.
///
/// The receiver tests drive LocalShare's real [LocalSendReceiver] over a real
/// HTTP socket using a spec-faithful client. The sender test runs LocalShare's
/// real [LocalSendClient] against an independent, spec-written receiver, so
/// both halves of the protocol are checked against something other than
/// themselves.
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:localshare/core/crypto/hashing.dart';
import 'package:localshare/core/interop/localsend/localsend_models.dart';
import 'package:localshare/core/interop/localsend/localsend_receiver.dart';
import 'package:localshare/core/interop/localsend/localsend_sender.dart';
import 'package:localshare/core/interop/localsend/localsend_server.dart';
import 'package:localshare/core/protocol/models.dart';
import 'package:localshare/core/transport/transfer_server.dart';

/// A [LocalSendHost] that accepts unless [pin] is set and wrong.
class _Host extends LocalSendHost {
  _Host(this.dir, {this.pin});
  final Directory dir;
  final String? pin;
  final List<String> received = [];
  String? lastSessionFingerprint;

  @override
  LocalSendInfo get info => const LocalSendInfo(
        alias: 'LocalShare Test',
        version: '2.2',
        fingerprint: 'self-fp',
        port: 53317,
        protocol: 'http',
      );

  @override
  Future<SessionDecision> onLocalSendSession(SessionRequest request) async {
    lastSessionFingerprint = request.fingerprint;
    if (pin != null && request.pin != pin) {
      return const SessionDecision.challenge();
    }
    return const SessionDecision.accept();
  }

  @override
  void onLocalSendFileReceived(FileDescriptor file, String path) =>
      received.add(path);
}

/// Spec-written receiver, independent of LocalShare's sender implementation.
class _SpecReceiver {
  _SpecReceiver(this.dir);
  final Directory dir;
  HttpServer? _server;
  final sessions = <String, Map<String, String>>{};
  final expectedSha = <String, String>{};
  final fileNames = <String, String>{};
  int? requirePin;
  String? preparedSessionId;
  int prepareCount = 0;

  int get port => _server!.port;
  String get base => 'http://127.0.0.1:$port';

  Future<void> start() async {
    _server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    _server!.listen((req) async {
      final p = req.uri.path;
      if (req.method == 'POST' && p == '$kLocalSendApiPrefix/prepare-upload') {
        prepareCount++;
        if (requirePin != null &&
            req.uri.queryParameters['pin'] != '$requirePin') {
          req.response.statusCode = LocalSendStatus.pinRequired;
          await req.response.close();
          return;
        }
        final body = (jsonDecode(await utf8.decoder.bind(req).join()) as Map)
            .cast<String, Object?>();
        final files = (body['files'] as Map).cast<String, Object?>();
        final sid = 'spec-session';
        final tokens = <String, String>{};
        files.forEach((k, v) {
          final f = (v as Map).cast<String, Object?>();
          tokens[k] = 'token-$k';
          expectedSha[k] = (f['sha256'] as String?) ?? '';
          fileNames[k] = f['fileName'] as String;
        });
        sessions[sid] = tokens;
        preparedSessionId = sid;
        req.response.headers.contentType = ContentType.json;
        req.response.write(jsonEncode(
            LocalSendPrepareResponse(sessionId: sid, files: tokens).toJson()));
        await req.response.close();
        return;
      }
      if (req.method == 'POST' && p == '$kLocalSendApiPrefix/upload') {
        final q = req.uri.queryParameters;
        final token = sessions[q['sessionId']]?[q['fileId']];
        if (token != q['token']) {
          req.response.statusCode = LocalSendStatus.rejected;
          await req.response.close();
          return;
        }
        final bytes =
            await req.fold<List<int>>(<int>[], (a, b) => a..addAll(b));
        final digest = hashBytes(bytes);
        if (expectedSha[q['fileId']]!.isNotEmpty &&
            digest != expectedSha[q['fileId']]) {
          req.response.statusCode = LocalSendStatus.checksumMismatch;
          await req.response.close();
          return;
        }
        await File('${dir.path}/${fileNames[q['fileId']]}').writeAsBytes(bytes);
        req.response.statusCode = HttpStatus.ok;
        await req.response.close();
        return;
      }
      req.response.statusCode = HttpStatus.notFound;
      await req.response.close();
    });
  }

  Future<void> stop() async => _server?.close(force: true);
}

Future<DeviceInfo> _deviceFor(int port) async => DeviceInfo(
      deviceId: 'peer',
      displayName: 'Peer',
      fingerprint: 'peer-fp',
      port: port,
      addresses: const ['127.0.0.1'],
      discoveredVia: DiscoveryChannel.mdns,
    );

void main() {
  late Directory dir;

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('localsend_test');
  });

  tearDown(() async {
    if (dir.existsSync()) await dir.delete(recursive: true);
  });

  test('LocalShare receiver accepts a full v2 upload and verifies sha256',
      () async {
    final host = _Host(dir);
    final server = LocalSendServer(
        receiver: LocalSendReceiver(host: host, downloadDirectory: dir));
    await server.start();

    final payload = utf8.encode('hello localsend');
    final digest = hashBytes(payload);
    final src = File('${dir.path}/src_greeting.txt')..writeAsBytesSync(payload);
    final files = [
      LocalSendOutgoing(
        path: src.path,
        fileName: 'greeting.txt',
        size: payload.length,
        sha256: digest,
      ),
    ];
    final client = LocalSendClient(
      localInfo: const LocalSendInfo(
        alias: 'Spec Sender',
        version: '2.2',
        fingerprint: 'sender-fp',
        port: 9,
        protocol: 'http',
      ),
    );
    final peer = await _deviceFor(server.boundPort);
    final tokens = await client.prepare(peer: peer, files: files);
    await client.sendAll(
        peer: peer, files: files, tokens: tokens, observer: _NoopObserver());
    await client.close();

    expect(host.received, hasLength(1));
    expect(File(host.received.single).readAsStringSync(), 'hello localsend');
    await server.stop();
  });

  test('receiver rejects a checksum mismatch with 422 and writes nothing',
      () async {
    final host = _Host(dir);
    final server = LocalSendServer(
        receiver: LocalSendReceiver(host: host, downloadDirectory: dir));
    await server.start();

    final payload = utf8.encode('tampered');
    final src = File('${dir.path}/src.txt')..writeAsBytesSync(payload);
    final client = LocalSendClient(
      localInfo: const LocalSendInfo(
        alias: 'Spec',
        version: '2.2',
        fingerprint: 'fp',
        port: 9,
        protocol: 'http',
      ),
    );
    final peer = await _deviceFor(server.boundPort);
    final tokens = await client.prepare(peer: peer, files: [
      LocalSendOutgoing(
          path: src.path,
          fileName: 'x.txt',
          size: payload.length,
          sha256: 'deadbeef'),
    ]);
    final observer = _CaptureObserver();
    await client.sendAll(
        peer: peer,
        files: [
          LocalSendOutgoing(
              path: src.path,
              fileName: 'x.txt',
              size: payload.length,
              sha256: 'deadbeef'),
        ],
        tokens: tokens,
        observer: observer);
    await client.close();

    expect(observer.errors, hasLength(1));
    expect(host.received, isEmpty);
    expect(File('${dir.path}/x.txt').existsSync(), isFalse);
    await server.stop();
  });

  test(
      'receiver challenges an unknown peer and prepares again with the right PIN',
      () async {
    final host = _Host(dir, pin: '123456');
    final server = LocalSendServer(
        receiver: LocalSendReceiver(host: host, downloadDirectory: dir));
    await server.start();
    final payload = utf8.encode('pin ok');
    final src = File('${dir.path}/pin.txt')..writeAsBytesSync(payload);
    final client = LocalSendClient(
      localInfo: const LocalSendInfo(
        alias: 'Spec',
        version: '2.2',
        fingerprint: 'fp',
        port: 9,
        protocol: 'http',
      ),
    );
    final peer = await _deviceFor(server.boundPort);
    final files = [
      LocalSendOutgoing(
          path: src.path,
          fileName: 'pin.txt',
          size: payload.length,
          sha256: hashBytes(payload))
    ];

    await expectLater(
        client.prepare(peer: peer, files: files), throwsA(isA<Exception>()));
    final tokens =
        await client.prepare(peer: peer, files: files, pin: '123456');
    await client.sendAll(
        peer: peer, files: files, tokens: tokens, observer: _NoopObserver());
    await client.close();

    expect(File(host.received.single).readAsStringSync(), 'pin ok');
    expect(host.lastSessionFingerprint, 'fp');
    await server.stop();
  });

  test('LocalShare sender drives a spec-written receiver and lands bytes',
      () async {
    final spec = _SpecReceiver(dir);
    await spec.start();
    final payload = utf8.encode('from localshare');
    final src = File('${dir.path}/out.bin')..writeAsBytesSync(payload);
    final observer = _CaptureObserver();

    final client = LocalSendClient(
      localInfo: const LocalSendInfo(
        alias: 'LocalShare',
        version: '2.2',
        fingerprint: 'ls-fp',
        port: 53317,
        protocol: 'http',
      ),
    );
    final peer = await _deviceFor(spec.port);
    final files = [
      LocalSendOutgoing(
          path: src.path,
          fileName: 'out.bin',
          size: payload.length,
          sha256: hashBytes(payload))
    ];
    final tokens = await client.prepare(peer: peer, files: files);
    await client.sendAll(
        peer: peer, files: files, tokens: tokens, observer: observer);
    await client.close();

    expect(spec.prepareCount, 1);
    expect(spec.preparedSessionId, 'spec-session');
    expect(observer.errors, isEmpty);
    expect(File('${dir.path}/out.bin').readAsStringSync(), 'from localshare');
    await spec.stop();
  });

  test('sender surfaces the peer PIN requirement as a rejection', () async {
    final spec = _SpecReceiver(dir)..requirePin = 999;
    await spec.start();
    final payload = utf8.encode('nope');
    final src = File('${dir.path}/n.bin')..writeAsBytesSync(payload);
    final client = LocalSendClient(
      localInfo: const LocalSendInfo(
        alias: 'LocalShare',
        version: '2.2',
        fingerprint: 'ls-fp',
        port: 53317,
        protocol: 'http',
      ),
    );
    final peer = await _deviceFor(spec.port);
    final files = [
      LocalSendOutgoing(
          path: src.path,
          fileName: 'n.bin',
          size: payload.length,
          sha256: hashBytes(payload))
    ];

    await expectLater(
        client.prepare(peer: peer, files: files), throwsA(isA<Exception>()));
    await client.close();
    await spec.stop();
  });

  test('models round-trip the documented JSON shape', () {
    final json = LocalSendInfo.fromJson({
      'alias': 'Nice Orange',
      'version': '2.0',
      'deviceModel': 'Samsung',
      'deviceType': 'mobile',
      'fingerprint': 'abc',
      'port': 53317,
      'protocol': 'https',
      'download': true,
    });
    expect(json.deviceType, LocalSendDeviceType.mobile);
    expect(json.protocol, 'https');
    expect(json.download, isTrue);
    expect(LocalSendInfo.fromJson({'alias': 'x'}).deviceType,
        LocalSendDeviceType.desktop);
  });
}

class _NoopObserver extends LocalSendObserver {}

class _CaptureObserver extends LocalSendObserver {
  final errors = <Object>[];
  @override
  void onError(String fileId, Object error) => errors.add(error);
}
