/// The engine facade the app talks to.
///
/// Owns the identity, the HTTPS server, discovery, trust and pairing, and
/// exposes high-level operations (`send`, incoming events) so the UI never
/// touches sockets or certificates directly.
library;

import 'dart:async';
import 'dart:io';

import 'crypto/ephemeral_cert.dart';
import 'crypto/hashing.dart';
import 'crypto/pin.dart';
import 'discovery/discovery_orchestrator.dart';
import 'interop/localsend/localsend_discovery.dart';
import 'interop/localsend/localsend_models.dart';
import 'interop/localsend/localsend_receiver.dart';
import 'interop/localsend/localsend_sender.dart' as ls;
import 'interop/localsend/localsend_server.dart';
import 'platform/radio_adapter.dart';
import 'protocol/models.dart';
import 'protocol/protocol.dart';
import 'session/pairing_manager.dart';
import 'session/trust_store.dart';
import 'transport/progress.dart';
import 'transport/transfer_client.dart';
import 'transport/transfer_server.dart';
import 'util/errors.dart';

/// An incoming transfer surfaced to the UI.
class IncomingTransfer {
  IncomingTransfer({
    required this.sessionId,
    required this.request,
    required this.files,
  });

  final String sessionId;
  final SessionRequest request;
  final List<FileDescriptor> files;
}

/// High-level events emitted by the engine.
sealed class EngineEvent {}

class EngineReady extends EngineEvent {
  EngineReady(
      {required this.deviceId, required this.fingerprint, required this.port});
  final String deviceId;
  final String fingerprint;
  final int port;
}

class IncomingSessionRequested extends EngineEvent {
  IncomingSessionRequested(this.transfer);
  final IncomingTransfer transfer;
}

class ReceiveProgress extends EngineEvent {
  ReceiveProgress(this.progress);
  final TransferProgress progress;
}

class FileReceived extends EngineEvent {
  FileReceived(this.file, this.path);
  final FileDescriptor file;
  final String path;
}

class SendProgress extends EngineEvent {
  SendProgress(this.fileId, this.progress);
  final String fileId;
  final TransferProgress progress;
}

class SendFinished extends EngineEvent {
  SendFinished(this.fileId);
  final String fileId;
}

class SendFailed extends EngineEvent {
  SendFailed(this.fileId, this.error);
  final String fileId;
  final Object error;
}

/// Configuration for a node.
class NodeConfig {
  NodeConfig({
    required this.displayName,
    required this.downloadDirectory,
    this.port = kDefaultPort,
  });

  final String displayName;
  final Directory downloadDirectory;
  final int port;
}

class LocalShareNode implements TransferTarget, LocalSendHost {
  LocalShareNode({
    required this.config,
    required this.adapter,
    required this.trustPersistence,
    PairingSettings? pairingSettings,
    this.localSendCompat = true,
  })  : pairingManager = PairingManager(
          trustStore: TrustStore(trustPersistence),
          settings: pairingSettings,
        ),
        _events = StreamController.broadcast();

  final NodeConfig config;
  final RadioAdapter adapter;
  final TrustPersistence trustPersistence;
  final PairingManager pairingManager;

  /// Serve the LocalSend v2 upload API and join its multicast group.
  final bool localSendCompat;

  final StreamController<EngineEvent> _events;
  late final EphemeralCertificate certificate;
  TransferServer? _server;
  DiscoveryOrchestrator? _discovery;
  LocalSendServer? _localSendServer;
  LocalSendDiscovery? _localSendDiscovery;
  String _deviceId = '';
  final Map<String, IncomingTransfer> _activeSessions = {};

  Stream<EngineEvent> get events => _events.stream;
  String get deviceId => _deviceId;
  String get fingerprint => certificate.fingerprint;
  int get port => _server?.boundPort ?? config.port;
  Iterable<DeviceInfo> get peers => _discovery?.peers ?? const [];

  /// Our identity as advertised to LocalSend peers, or null when compat is off.
  LocalSendInfo? get localSendInfo => localSendCompat
      ? LocalSendInfo(
          alias: config.displayName,
          version: kLocalSendVersion,
          fingerprint: fingerprint,
          port: _localSendServer?.boundPort ?? kLocalSendPort,
          protocol: 'http',
          deviceType: LocalSendDeviceType.desktop,
          download: false,
        )
      : null;

  Future<void> start() async {
    _deviceId = generateToken(byteLength: 16);
    certificate = EphemeralCertificate.generate(
      commonName: 'localshare-$_deviceId.local',
    );
    await pairingManager.trustStore.load();

    final server = TransferServer(
      securityContext: certificate.toSecurityContext(),
      target: this,
      downloadDirectory: config.downloadDirectory,
      port: config.port,
    );
    await server.start();
    _server = server;

    await adapter.startMdnsAdvertising(
      serviceName: 'LocalShare-$_deviceId',
      port: server.boundPort,
      txt: {
        'deviceId': _deviceId,
        'displayName': config.displayName,
        'fingerprint': fingerprint,
        'port': '${server.boundPort}',
        'protocolVersion': '$kProtocolVersion',
      },
    );

    _discovery = DiscoveryOrchestrator(
      adapter: adapter,
      localDeviceId: _deviceId,
      localFingerprint: fingerprint,
    )..start();

    if (localSendCompat) {
      await _startLocalSendCompat();
    }

    _events.add(EngineReady(
      deviceId: _deviceId,
      fingerprint: fingerprint,
      port: server.boundPort,
    ));
  }

  /// Bring up the LocalSend v2 surface: a plain-HTTP listener plus multicast
  /// discovery, both bridged into the normal peer list.
  Future<void> _startLocalSendCompat() async {
    final receiver = LocalSendReceiver(
      host: this,
      downloadDirectory: config.downloadDirectory,
    );
    final server = LocalSendServer(receiver: receiver);
    await server.start();
    _localSendServer = server;

    final info = localSendInfo!;
    receiver.onRegister = (json, address) {
      _localSendDiscovery?.ingestRegister(json, address);
    };

    final discovery = LocalSendDiscovery(port: server.boundPort)
      ..ownInfo = info;
    discovery.callbackPort = server.boundPort;
    await discovery.start();
    discovery.sightings.listen((s) => _discovery?.ingest(s.device));
    _localSendDiscovery = discovery;
    discovery.announce();
  }

  // ── LocalSendHost (compat receive side) ─────────────────────────
  @override
  LocalSendInfo get info => localSendInfo!;

  @override
  Future<SessionDecision> onLocalSendSession(SessionRequest request) async =>
      pairingManager.evaluate(request);

  @override
  void onLocalSendProgress(String fileId, int received, int total) {
    _events.add(ReceiveProgress(TransferProgress(
      fileId: fileId,
      fileName: fileId,
      transferred: received,
      total: total,
      bytesPerSecond: 0,
    )));
  }

  @override
  void onLocalSendFileReceived(FileDescriptor file, String path) {
    _events.add(FileReceived(file, path));
  }

  /// Send [files] to a discovered LocalSend peer using protocol v2.
  ///
  /// Throws [SessionRejected] with reason `pin_required` when the peer demands a
  /// PIN. Prefer [send], which routes LocalSend peers automatically and can
  /// prompt interactively.
  Future<void> sendToLocalSend({
    required DeviceInfo peer,
    required List<IncomingFile> files,
    String? pin,
  }) async {
    var provided = pin;
    await _sendLocalSend(
      peer: peer,
      files: files,
      requestPin: (_) async {
        final value = provided;
        provided = null;
        return value;
      },
    );
  }

  Future<void> _sendLocalSend({
    required DeviceInfo peer,
    required List<IncomingFile> files,
    Future<String?> Function(DeviceInfo peer)? requestPin,
  }) async {
    final outgoing = <ls.LocalSendOutgoing>[];
    for (final file in files) {
      outgoing.add(ls.LocalSendOutgoing(
        path: file.path,
        fileName: file.fileName,
        size: await File(file.path).length(),
        sha256: await hashFile(file.path),
      ));
    }

    final client = ls.LocalSendClient(localInfo: localSendInfo!);
    try {
      Map<String, String> tokens;
      String? pin;
      var attempt = 0;
      while (true) {
        try {
          tokens = await client.prepare(peer: peer, files: outgoing, pin: pin);
          break;
        } on SessionRejected catch (e) {
          if (e.message != 'pin_required' ||
              requestPin == null ||
              attempt >= 5) {
            rethrow;
          }
          attempt++;
          pin = await requestPin(peer);
          if (pin == null || pin.isEmpty) {
            throw const SessionRejected('cancelled at PIN prompt');
          }
        }
      }
      await client.sendAll(
        peer: peer,
        files: outgoing,
        tokens: tokens,
        observer: _LocalSendObserver(_events),
      );
    } finally {
      await client.close();
    }
  }

  /// Broadcast to peers who can see us, over both radios.
  Future<void> startBlePresence() async {
    await adapter.startBleAdvertising({
      'deviceId': _deviceId,
      'displayName': config.displayName,
      'fingerprint': fingerprint,
      'port': '$port',
    });
  }

  /// True when [peer] speaks the LocalSend v2 protocol rather than our native
  /// TLS protocol (LocalSend peers cannot satisfy our pinned-cert handshake).
  bool _isLocalSendPeer(DeviceInfo peer) =>
      peer.platform == 'localsend' || peer.platform == 'localsend-https';

  /// Open a session with [peer] and send [files].
  ///
  /// If the receiver challenges us with a PIN (unknown peer), [requestPin] is
  /// awaited to collect the code the user reads off the receiving device, then
  /// the request is retried. Return null from [requestPin] to abort.
  Future<void> send({
    required DeviceInfo peer,
    required List<IncomingFile> files,
    Future<String?> Function(DeviceInfo peer)? requestPin,
  }) async {
    if (_isLocalSendPeer(peer)) {
      await _sendLocalSend(peer: peer, files: files, requestPin: requestPin);
      return;
    }

    final outgoing = <OutgoingFile>[];
    for (final file in files) {
      final sha = await hashFile(file.path);
      outgoing.add(OutgoingFile(
        path: file.path,
        descriptor: FileDescriptor(
          id: generateToken(byteLength: 12),
          fileName: file.fileName,
          size: await File(file.path).length(),
          sha256: sha,
          relativePath: file.relativePath,
        ),
        relativePath: file.relativePath,
      ));
    }

    final client = TransferClient(expectedFingerprint: peer.fingerprint);
    try {
      SessionResponse response;
      String? pin;
      var attempt = 0;
      while (true) {
        final request = SessionRequest(
          protocolVersion: kProtocolVersion,
          deviceId: _deviceId,
          displayName: config.displayName,
          fingerprint: fingerprint,
          files: outgoing.map((o) => o.descriptor).toList(),
          pin: pin,
        );
        response = await client.openSession(peer: peer, request: request);
        if (response.accepted) break;
        if (response.reason == 'pin_required' &&
            requestPin != null &&
            attempt < 5) {
          attempt++;
          pin = await requestPin(peer);
          if (pin == null || pin.isEmpty) {
            throw const SessionRejected('cancelled at PIN prompt');
          }
          continue;
        }
        throw SessionRejected(
            response.reason ?? 'receiver rejected the session');
      }
      await client.sendAll(
        peer: peer,
        files: outgoing,
        session: response,
        observer: _SendObserver(_events),
      );
    } finally {
      await client.close();
    }
  }

  // ── TransferTarget (receiver side) ──────────────────────────────
  @override
  Future<SessionDecision> onSessionRequest(SessionRequest request) async {
    final sessionId = generateToken(byteLength: 12);
    _activeSessions[sessionId] = IncomingTransfer(
      sessionId: sessionId,
      request: request,
      files: request.files,
    );
    final decision = pairingManager.evaluate(request);
    if (decision.accepted) {
      _events.add(IncomingSessionRequested(
        IncomingTransfer(
            sessionId: sessionId, request: request, files: request.files),
      ));
      pairingManager.clearChallenge(request.deviceId);
    }
    return decision;
  }

  @override
  void onProgress(String fileId, int received, int total) {
    _events.add(ReceiveProgress(TransferProgress(
      fileId: fileId,
      fileName: fileId,
      transferred: received,
      total: total,
      bytesPerSecond: 0,
    )));
  }

  @override
  void onFileReceived(FileDescriptor file, String path) {
    _events.add(FileReceived(file, path));
  }

  @override
  void onSessionEnd(String sessionId, {String? error}) {
    _activeSessions.remove(sessionId);
  }

  /// Approve a pending session on the receiver, delivering trust on success.
  Future<void> approve(IncomingTransfer transfer,
      {bool favorite = false}) async {
    await pairingManager.trustStore.remember(
      fingerprint: transfer.request.fingerprint,
      deviceId: transfer.request.deviceId,
      displayName: transfer.request.displayName,
    );
    if (favorite) {
      await pairingManager.trustStore
          .setFavorite(transfer.request.fingerprint, true);
    }
  }

  Future<void> stop() async {
    await adapter.stopMdnsAdvertising();
    await adapter.stopBleAdvertising();
    await _localSendDiscovery?.dispose();
    await _localSendServer?.stop();
    await _discovery?.dispose();
    await _server?.stop();
    await _events.close();
    await adapter.dispose();
  }
}

/// A file chosen by the user to send.
class IncomingFile {
  IncomingFile({required this.path, required this.fileName, this.relativePath});
  final String path;
  final String fileName;
  final String? relativePath;
}

class _SendObserver implements SendObserver {
  _SendObserver(this._events);
  final StreamController<EngineEvent> _events;

  @override
  void onSessionEstablished(String sessionId) {}

  @override
  void onProgress(TransferProgress progress) =>
      _events.add(SendProgress(progress.fileId, progress));

  @override
  void onFileDone(String fileId) => _events.add(SendFinished(fileId));

  @override
  void onError(String fileId, Object error) =>
      _events.add(SendFailed(fileId, error));
}

/// Bridges LocalSend upload progress onto the same engine event stream.
class _LocalSendObserver implements ls.LocalSendObserver {
  _LocalSendObserver(this._events);
  final StreamController<EngineEvent> _events;

  @override
  void onProgress(TransferProgress progress) =>
      _events.add(SendProgress(progress.fileId, progress));

  @override
  void onFileDone(String fileId) => _events.add(SendFinished(fileId));

  @override
  void onError(String fileId, Object error) =>
      _events.add(SendFailed(fileId, error));
}
