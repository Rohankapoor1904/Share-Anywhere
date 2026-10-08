/// Trust-on-first-use store.
///
/// A peer becomes "known" only after a *verified* transfer completes. Known
/// fingerprints can be auto-accepted (and favourited); unknown ones must pass
/// the PIN gate. Persistence is injected so the core stays filesystem-agnostic.
library;

import 'dart:convert';
import 'dart:io';

/// A trusted peer record.
class TrustedPeer {
  TrustedPeer({
    required this.fingerprint,
    required this.deviceId,
    required this.displayName,
    required this.lastSeen,
    this.favorite = false,
  });

  final String fingerprint;
  String deviceId;
  String displayName;
  DateTime lastSeen;
  bool favorite;

  Map<String, Object?> toJson() => {
        'fingerprint': fingerprint,
        'deviceId': deviceId,
        'displayName': displayName,
        'lastSeen': lastSeen.toIso8601String(),
        'favorite': favorite,
      };

  factory TrustedPeer.fromJson(Map<String, Object?> json) => TrustedPeer(
        fingerprint: json['fingerprint']! as String,
        deviceId: (json['deviceId'] as String?) ?? '',
        displayName: (json['displayName'] as String?) ?? '',
        lastSeen: DateTime.tryParse((json['lastSeen'] as String?) ?? '') ??
            DateTime.now(),
        favorite: (json['favorite'] as bool?) ?? false,
      );
}

abstract class TrustPersistence {
  Future<String?> read();
  Future<void> write(String contents);
}

/// In-memory persistence (used by tests).
class MemoryTrustPersistence implements TrustPersistence {
  String? _value;
  @override
  Future<String?> read() async => _value;
  @override
  Future<void> write(String contents) async => _value = contents;
}

/// JSON-file persistence.
class FileTrustPersistence implements TrustPersistence {
  FileTrustPersistence(this.file);
  final File file;
  @override
  Future<String?> read() async =>
      file.existsSync() ? file.readAsString() : null;
  @override
  Future<void> write(String contents) async {
    await file.parent.create(recursive: true);
    await file.writeAsString(contents);
  }
}

class TrustStore {
  TrustStore(this._persistence);
  final TrustPersistence _persistence;

  final Map<String, TrustedPeer> _peers = {};
  bool _loaded = false;

  Iterable<TrustedPeer> get peers => _peers.values;
  Iterable<TrustedPeer> get favorites => _peers.values.where((p) => p.favorite);

  bool isTrusted(String fingerprint) => _peers.containsKey(fingerprint);

  Future<void> load() async {
    if (_loaded) return;
    final raw = await _persistence.read();
    if (raw != null && raw.isNotEmpty) {
      final list = (jsonDecode(raw) as List).cast<Map<String, Object?>>();
      for (final item in list) {
        final peer = TrustedPeer.fromJson(item);
        _peers[peer.fingerprint] = peer;
      }
    }
    _loaded = true;
  }

  /// Record a successful transfer, promoting the peer to trusted.
  Future<TrustedPeer> remember({
    required String fingerprint,
    required String deviceId,
    required String displayName,
  }) async {
    final existing = _peers[fingerprint];
    final peer = TrustedPeer(
      fingerprint: fingerprint,
      deviceId: deviceId,
      displayName: displayName,
      lastSeen: DateTime.now(),
      favorite: existing?.favorite ?? false,
    );
    _peers[fingerprint] = peer;
    await _flush();
    return peer;
  }

  Future<void> setFavorite(String fingerprint, bool favorite) async {
    final peer = _peers[fingerprint];
    if (peer == null) return;
    peer.favorite = favorite;
    await _flush();
  }

  Future<void> forget(String fingerprint) async {
    _peers.remove(fingerprint);
    await _flush();
  }

  Future<void> _flush() async {
    await _persistence.write(
      jsonEncode(_peers.values.map((p) => p.toJson()).toList()),
    );
  }
}
