/// End-to-end transfer tests over a real loopback TLS connection.
///
/// No mocks: a [TransferServer] and [TransferClient] exchange actual bytes over
/// HTTPS, so checksum verification, resume and rejection are exercised for real.
library;

import 'dart:io';

import 'package:localshare/core/crypto/ephemeral_cert.dart';
import 'package:localshare/core/crypto/hashing.dart';
import 'package:localshare/core/crypto/pin.dart';
import 'package:localshare/core/node.dart';
import 'package:localshare/core/protocol/models.dart';
import 'package:localshare/core/protocol/protocol.dart';
import 'package:localshare/core/session/pairing_manager.dart';
import 'package:localshare/core/session/trust_store.dart';
import 'package:localshare/core/transport/transfer_client.dart';
import 'package:localshare/core/transport/transfer_server.dart';
import 'package:localshare/platform/create_adapter.dart';
import 'package:test/test.dart';

/// A receiver that accepts everything and records what it got.
class _RecordingTarget implements TransferTarget {
  final received = <String, String>{};
  final progress = <String, int>{};

  @override
  Future<SessionDecision> onSessionRequest(
          String sessionId, SessionRequest request) async =>
      const SessionDecision.accept();

  @override
  void onProgress(String fileId, int received, int total) =>
      progress[fileId] = received;

  @override
  void onFileReceived(FileDescriptor file, String path) =>
      received[file.id] = path;

  @override
  void onSessionEnd(String sessionId, {String? error}) {}
}

Future<
    ({
      TransferServer server,
      _RecordingTarget target,
      Directory dir,
      EphemeralCertificate cert
    })> _startReceiver() async {
  final dir = await Directory.systemTemp.createTemp('ls-recv');
  final cert = EphemeralCertificate.generate(
    subjectAltNames: ['localhost', '127.0.0.1'],
  );
  final target = _RecordingTarget();
  final server = TransferServer(
    securityContext: cert.toSecurityContext(),
    target: target,
    downloadDirectory: dir,
    port: 0,
  );
  await server.start();
  return (server: server, target: target, dir: dir, cert: cert);
}

Future<OutgoingFile> _makeOutgoing(
    String dir, String name, List<int> bytes) async {
  final path = '$dir/$name';
  await File(path).writeAsBytes(bytes);
  return OutgoingFile(
    path: path,
    descriptor: FileDescriptor(
      id: generateToken(byteLength: 8),
      fileName: name,
      size: bytes.length,
      sha256: hashBytes(bytes),
    ),
  );
}

void main() {
  late Directory work;

  setUp(() async {
    work = await Directory.systemTemp.createTemp('ls-send');
  });

  tearDown(() async {
    if (work.existsSync()) await work.delete(recursive: true);
  });

  test('transfers multiple files and verifies checksums', () async {
    final r = await _startReceiver();
    try {
      final files = <OutgoingFile>[
        await _makeOutgoing(work.path, 'a.bin',
            List<int>.generate(2 * 1024 * 1024, (i) => i % 256)),
        await _makeOutgoing(work.path, 'b.txt', 'hello localshare'.codeUnits),
      ];

      final client = TransferClient(expectedFingerprint: r.cert.fingerprint);
      final response = await client.openSession(
        peer: DeviceInfo(
          deviceId: 'receiver',
          displayName: 'Receiver',
          fingerprint: r.cert.fingerprint,
          port: r.server.boundPort,
          addresses: const ['127.0.0.1'],
        ),
        request: SessionRequest(
          protocolVersion: kProtocolVersion,
          deviceId: 'sender',
          displayName: 'Sender',
          fingerprint: 'sender-fp',
          files: files.map((f) => f.descriptor).toList(),
        ),
      );
      expect(response.accepted, isTrue);

      final done = <String>[];
      await client.sendAll(
        peer: DeviceInfo(
          deviceId: 'receiver',
          displayName: 'Receiver',
          fingerprint: r.cert.fingerprint,
          port: r.server.boundPort,
          addresses: const ['127.0.0.1'],
        ),
        files: files,
        session: response,
        observer: _Collect(done),
      );
      await client.close();

      expect(done, hasLength(2));
      expect(r.target.received, hasLength(2));
      for (final file in files) {
        expect(r.target.received.containsKey(file.descriptor.id), isTrue);
      }
    } finally {
      await r.server.stop();
      await r.dir.delete(recursive: true);
    }
  });

  test('rejects a client that fails the fingerprint pin', () async {
    final r = await _startReceiver();
    try {
      final client =
          TransferClient(expectedFingerprint: 'not-the-right-fingerprint');
      final file =
          await _makeOutgoing(work.path, 'x.bin', List<int>.filled(1024, 1));
      await expectLater(
        client.openSession(
          peer: DeviceInfo(
            deviceId: 'receiver',
            displayName: 'Receiver',
            fingerprint: r.cert.fingerprint,
            port: r.server.boundPort,
            addresses: const ['127.0.0.1'],
          ),
          request: SessionRequest(
            protocolVersion: kProtocolVersion,
            deviceId: 'sender',
            displayName: 'Sender',
            fingerprint: 'sender-fp',
            files: [file.descriptor],
          ),
        ),
        throwsA(anything),
      );
      await client.close();
    } finally {
      await r.server.stop();
      await r.dir.delete(recursive: true);
    }
  });

  test('resumes an interrupted file from the receiver offset', () async {
    final r = await _startReceiver();
    try {
      final bytes = List<int>.generate(3 * 1024 * 1024, (i) => (i * 7) % 256);
      final file = await _makeOutgoing(work.path, 'big.bin', bytes);
      final peer = DeviceInfo(
        deviceId: 'receiver',
        displayName: 'Receiver',
        fingerprint: r.cert.fingerprint,
        port: r.server.boundPort,
        addresses: const ['127.0.0.1'],
      );

      // Simulate a prior partial transfer by pre-writing a content-addressed
      // .part file (the naming the server uses for resumable uploads).
      final finalPath = '${r.dir.path}/big.bin';
      final partial =
          File('${r.dir.path}/${hashBytes(bytes)}$kPartialSuffix.big.bin');
      final half = bytes.length ~/ 2;
      await partial.writeAsBytes(bytes.sublist(0, half));

      final client = TransferClient(expectedFingerprint: r.cert.fingerprint);
      final response = await client.openSession(
        peer: peer,
        request: SessionRequest(
          protocolVersion: kProtocolVersion,
          deviceId: 'sender',
          displayName: 'Sender',
          fingerprint: 'sender-fp',
          files: [file.descriptor],
        ),
      );
      expect(response.resume[file.descriptor.id], isNotNull);

      final offset = client.startOffsetFor(file, response);
      expect(offset, greaterThan(0));
      expect(offset, lessThanOrEqualTo(bytes.length));

      final done = <String>[];
      await client.sendAll(
          peer: peer,
          files: [file],
          session: response,
          observer: _Collect(done));
      await client.close();

      expect(done, [file.descriptor.id]);
      // Final file exists and matches the original bytes exactly.
      final resultBytes = await File(finalPath).readAsBytes();
      expect(resultBytes, bytes);
    } finally {
      await r.server.stop();
      await r.dir.delete(recursive: true);
    }
  });

  test(
      'cancelSession causes in-flight chunk upload on sender to fail with Receiver declined',
      () async {
    final r = await _startReceiver();
    try {
      final bytes = List<int>.generate(1024 * 1024, (i) => i % 256);
      final file = await _makeOutgoing(work.path, 'data.bin', bytes);
      final peer = DeviceInfo(
        deviceId: 'receiver',
        displayName: 'Receiver',
        fingerprint: r.cert.fingerprint,
        port: r.server.boundPort,
        addresses: const ['127.0.0.1'],
      );

      final client = TransferClient(expectedFingerprint: r.cert.fingerprint);
      final response = await client.openSession(
        peer: peer,
        request: SessionRequest(
          protocolVersion: kProtocolVersion,
          deviceId: 'sender',
          displayName: 'Sender',
          fingerprint: 'sender-fp',
          files: [file.descriptor],
        ),
      );
      expect(response.accepted, isTrue);

      // Cancel session on receiver (simulates user clicking Decline)
      await r.server.cancelSession(response.sessionId, reason: 'declined');

      final errors = <Object>[];
      final done = <String>[];
      await client.sendAll(
        peer: peer,
        files: [file],
        session: response,
        observer: _CollectWithErrors(done, errors),
      );
      await client.close();

      expect(errors, hasLength(1));
      expect(errors.first.toString(), contains('Receiver declined'));
    } finally {
      await r.server.stop();
      await r.dir.delete(recursive: true);
    }
  });

  test('invokes onProgress callback on receiver during transfer', () async {
    final r = await _startReceiver();
    try {
      final bytes = List<int>.generate(100 * 1024, (i) => i % 256);
      final file = await _makeOutgoing(work.path, 'sample.bin', bytes);
      final peer = DeviceInfo(
        deviceId: 'receiver',
        displayName: 'Receiver',
        fingerprint: r.cert.fingerprint,
        port: r.server.boundPort,
        addresses: const ['127.0.0.1'],
      );

      final client = TransferClient(expectedFingerprint: r.cert.fingerprint);
      final response = await client.openSession(
        peer: peer,
        request: SessionRequest(
          protocolVersion: kProtocolVersion,
          deviceId: 'sender',
          displayName: 'Sender',
          fingerprint: 'sender-fp',
          files: [file.descriptor],
        ),
      );
      expect(response.accepted, isTrue);

      final done = <String>[];
      await client.sendAll(
        peer: peer,
        files: [file],
        session: response,
        observer: _Collect(done),
      );
      await client.close();

      expect(done, [file.descriptor.id]);
      expect(r.target.progress[file.descriptor.id], equals(bytes.length));
    } finally {
      await r.server.stop();
      await r.dir.delete(recursive: true);
    }
  });

  test(
      'send propagates FileSystemException when file does not exist without retrying',
      () async {
    final dir = await Directory.systemTemp.createTemp('ls-node-test');
    try {
      final node = LocalShareNode(
        config: NodeConfig(
          displayName: 'TestNode',
          downloadDirectory: dir,
        ),
        adapter: createRadioAdapter(),
        trustPersistence: MemoryTrustPersistence(),
        localSendCompat: false,
      );

      final peer = DeviceInfo(
        deviceId: 'peer1',
        displayName: 'Peer 1',
        fingerprint: 'some-fp',
        port: 50000,
        addresses: const ['127.0.0.1'],
      );

      final nonExistentFile = IncomingFile(
        path: '${dir.path}/non_existent_file_xyz_123.bin',
        fileName: 'non_existent_file_xyz_123.bin',
      );

      await expectLater(
        node.send(peer: peer, files: [nonExistentFile]),
        throwsA(isA<FileSystemException>()),
      );
    } finally {
      await dir.delete(recursive: true);
    }
  });

  group('PairingManager PIN challenge policy', () {
    test(
        'unknown peer requires PIN challenge, accepts correct PIN, rejects after 3 wrong attempts',
        () async {
      final trustPersistence = MemoryTrustPersistence();
      final trustStore = TrustStore(trustPersistence);
      final pairingManager = PairingManager(
        trustStore: trustStore,
        settings:
            PairingSettings(autoAcceptAll: false, autoAcceptTrusted: true),
      );

      String? challengedPin;
      pairingManager.onChallenge = (id, name, pin) {
        challengedPin = pin;
      };

      final reqNoPin = SessionRequest(
        protocolVersion: kProtocolVersion,
        deviceId: 'unknown-1',
        displayName: 'Unknown Device',
        fingerprint: 'fp-unknown-1',
        files: const [],
      );

      // 1. First evaluation with no PIN: triggers challenge and calls onChallenge
      final decision1 = pairingManager.evaluate(reqNoPin);
      expect(decision1.accepted, isFalse);
      expect(decision1.challengePin, isTrue);
      expect(decision1.reason, 'pin_required');
      expect(challengedPin, isNotNull);
      expect(challengedPin, hasLength(6));

      // 2. Wrong PIN attempt 1
      final reqWrong = SessionRequest(
        protocolVersion: kProtocolVersion,
        deviceId: 'unknown-1',
        displayName: 'Unknown Device',
        fingerprint: 'fp-unknown-1',
        files: const [],
        pin: '000000',
      );
      final decisionWrong1 = pairingManager.evaluate(reqWrong);
      expect(decisionWrong1.accepted, isFalse);
      expect(decisionWrong1.challengePin, isTrue);

      // 3. Wrong PIN attempt 2
      final decisionWrong2 = pairingManager.evaluate(reqWrong);
      expect(decisionWrong2.accepted, isFalse);
      expect(decisionWrong2.challengePin, isTrue);

      // 4. Wrong PIN attempt 3 -> rejected with too_many_attempts
      final decisionWrong3 = pairingManager.evaluate(reqWrong);
      expect(decisionWrong3.accepted, isFalse);
      expect(decisionWrong3.reason, 'too_many_attempts');

      // Test correct PIN
      final reqNoPin2 = SessionRequest(
        protocolVersion: kProtocolVersion,
        deviceId: 'unknown-2',
        displayName: 'Unknown Device 2',
        fingerprint: 'fp-unknown-2',
        files: const [],
      );
      pairingManager.evaluate(reqNoPin2);
      final pin2 = challengedPin!;

      final reqCorrect = SessionRequest(
        protocolVersion: kProtocolVersion,
        deviceId: 'unknown-2',
        displayName: 'Unknown Device 2',
        fingerprint: 'fp-unknown-2',
        files: const [],
        pin: pin2,
      );
      final decisionCorrect = pairingManager.evaluate(reqCorrect);
      expect(decisionCorrect.accepted, isTrue);
    });
  });
}

class _CollectWithErrors implements SendObserver {
  _CollectWithErrors(this.done, this.errors);
  final List<String> done;
  final List<Object> errors;
  @override
  void onSessionEstablished(String sessionId) {}
  @override
  void onProgress(_) {}
  @override
  void onFileDone(String fileId) => done.add(fileId);
  @override
  void onError(String fileId, Object error) => errors.add(error);
}

class _Collect implements SendObserver {
  _Collect(this.done);
  final List<String> done;
  @override
  void onSessionEstablished(String sessionId) {}
  @override
  void onProgress(_) {}
  @override
  void onFileDone(String fileId) => done.add(fileId);
  @override
  void onError(String fileId, Object error) =>
      fail('send error for $fileId: $error');
}
