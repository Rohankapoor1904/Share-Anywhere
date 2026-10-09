/// Immutable wire models. Kept dependency-free so they can be serialized by
/// tests without a full app bootstrap.
library;

import 'dart:convert';

/// A peer as advertised over mDNS or BLE.
class DeviceInfo {
  const DeviceInfo({
    required this.deviceId,
    required this.displayName,
    required this.fingerprint,
    required this.port,
    this.platform,
    this.addresses = const [],
    this.discoveredVia = DiscoveryChannel.unknown,
  });

  final String deviceId;
  final String displayName;

  /// Certificate fingerprint (device identity).
  final String fingerprint;
  final int port;
  final String? platform;
  final List<String> addresses;
  final DiscoveryChannel discoveredVia;

  DeviceInfo copyWith({
    String? displayName,
    String? fingerprint,
    String? platform,
    List<String>? addresses,
    DiscoveryChannel? discoveredVia,
    int? port,
  }) =>
      DeviceInfo(
        deviceId: deviceId,
        displayName: displayName ?? this.displayName,
        fingerprint: fingerprint ?? this.fingerprint,
        port: port ?? this.port,
        platform: platform ?? this.platform,
        addresses: addresses ?? this.addresses,
        discoveredVia: discoveredVia ?? this.discoveredVia,
      );

  /// Preferred dial address: first IPv4 if present, else first address.
  String? get bestAddress {
    if (addresses.isEmpty) return null;
    for (final a in addresses) {
      if (a.contains('.') && !a.contains(':')) return a;
    }

    return addresses.first;
  }

  Map<String, Object?> toJson() => {
        'deviceId': deviceId,
        'displayName': displayName,
        'fingerprint': fingerprint,
        'port': port,
        if (platform != null) 'platform': platform,
        'addresses': addresses,
      };

  factory DeviceInfo.fromJson(Map<String, Object?> json) => DeviceInfo(
        deviceId: json['deviceId']! as String,
        displayName: (json['displayName'] as String?) ?? 'Unknown device',
        fingerprint: (json['fingerprint'] as String?) ?? '',
        port: (json['port'] as num?)?.toInt() ?? 0,
        platform: json['platform'] as String?,
        addresses: (json['addresses'] as List?)?.cast<String>() ?? const [],
      );

  @override
  bool operator ==(Object other) =>
      other is DeviceInfo && other.deviceId == deviceId;

  @override
  int get hashCode => deviceId.hashCode;
}

/// A path exposed by a paired peer's file browser.
class RemoteFileEntry {
  const RemoteFileEntry({
    required this.name,
    required this.relativePath,
    required this.size,
    required this.modified,
    required this.isDirectory,
  });

  final String name;
  final String relativePath;
  final int size;
  final DateTime modified;
  final bool isDirectory;

  Map<String, Object?> toJson() => {
        'name': name,
        'relativePath': relativePath,
        'size': size,
        'modified': modified.toUtc().toIso8601String(),
        'isDirectory': isDirectory,
      };

  factory RemoteFileEntry.fromJson(Map<String, Object?> json) =>
      RemoteFileEntry(
        name: json['name']! as String,
        relativePath: json['relativePath']! as String,
        size: (json['size'] as num?)?.toInt() ?? 0,
        modified: DateTime.parse(json['modified']! as String),
        isDirectory: json['isDirectory'] as bool? ?? false,
      );
}

/// How a peer was found.
enum DiscoveryChannel { mdns, ble, manual, unknown }

/// A single file proposed for transfer.
class FileDescriptor {
  const FileDescriptor({
    required this.id,
    required this.fileName,
    required this.size,
    required this.sha256,
    this.mime,
    this.relativePath,
  });

  /// Stable id within a session.
  final String id;
  final String fileName;
  final int size;

  /// Pre-computed SHA-256 of the whole file (sender side).
  final String sha256;
  final String? mime;

  /// Path within a folder transfer, e.g. `album/photo.jpg`.
  final String? relativePath;

  Map<String, Object?> toJson() => {
        'id': id,
        'fileName': fileName,
        'size': size,
        'sha256': sha256,
        if (mime != null) 'mime': mime,
        if (relativePath != null) 'relativePath': relativePath,
      };

  factory FileDescriptor.fromJson(Map<String, Object?> json) => FileDescriptor(
        id: json['id']! as String,
        fileName: json['fileName']! as String,
        size: (json['size']! as num).toInt(),
        sha256: json['sha256']! as String,
        mime: json['mime'] as String?,
        relativePath: json['relativePath'] as String?,
      );
}

/// Sender's opening request. [pin] is present only for unknown peers.
class SessionRequest {
  const SessionRequest({
    required this.protocolVersion,
    required this.deviceId,
    required this.displayName,
    required this.fingerprint,
    required this.files,
    this.pin,
  });

  final int protocolVersion;
  final String deviceId;
  final String displayName;
  final String fingerprint;
  final List<FileDescriptor> files;
  final String? pin;

  Map<String, Object?> toJson() => {
        'protocolVersion': protocolVersion,
        'deviceId': deviceId,
        'displayName': displayName,
        'fingerprint': fingerprint,
        'files': files.map((f) => f.toJson()).toList(),
        if (pin != null) 'pin': pin,
      };

  factory SessionRequest.fromJson(Map<String, Object?> json) => SessionRequest(
        protocolVersion: (json['protocolVersion'] as num).toInt(),
        deviceId: json['deviceId']! as String,
        displayName: (json['displayName'] as String?) ?? 'Unknown',
        fingerprint: (json['fingerprint'] as String?) ?? '',
        files: (json['files'] as List)
            .map((e) =>
                FileDescriptor.fromJson((e as Map).cast<String, Object?>()))
            .toList(),
        pin: json['pin'] as String?,
      );
}

/// Receiver's answer to a [SessionRequest].
class SessionResponse {
  const SessionResponse({
    required this.sessionId,
    required this.accepted,
    this.resume = const {},
    this.reason,
  });

  final String sessionId;
  final bool accepted;

  /// fileId -> already-present byte count, enabling resume.
  final Map<String, int> resume;
  final String? reason;

  Map<String, Object?> toJson() => {
        'sessionId': sessionId,
        'accepted': accepted,
        'resume': resume,
        if (reason != null) 'reason': reason,
      };

  factory SessionResponse.fromJson(Map<String, Object?> json) =>
      SessionResponse(
        sessionId: json['sessionId']! as String,
        accepted: json['accepted']! as bool,
        resume: (json['resume'] as Map?)
                ?.map((k, v) => MapEntry(k as String, (v as num).toInt())) ??
            const {},
        reason: json['reason'] as String?,
      );
}

/// Receiver's acknowledgement after a chunk.
class ChunkAck {
  const ChunkAck({required this.received});
  final int received;

  Map<String, Object?> toJson() => {'received': received};
  factory ChunkAck.fromJson(Map<String, Object?> json) =>
      ChunkAck(received: (json['received']! as num).toInt());
}

/// Sender's request to finalize a file.
class CommitRequest {
  const CommitRequest({required this.sha256, this.lastChunk = true});
  final String sha256;
  final bool lastChunk;

  Map<String, Object?> toJson() => {'sha256': sha256, 'lastChunk': lastChunk};
  factory CommitRequest.fromJson(Map<String, Object?> json) => CommitRequest(
        sha256: json['sha256']! as String,
        lastChunk: (json['lastChunk'] as bool?) ?? true,
      );
}

/// Result of verifying a committed file.
class CommitResponse {
  const CommitResponse({required this.verified, this.reason});
  final bool verified;
  final String? reason;

  Map<String, Object?> toJson() => {
        'verified': verified,
        if (reason != null) 'reason': reason,
      };
  factory CommitResponse.fromJson(Map<String, Object?> json) => CommitResponse(
        verified: json['verified']! as bool,
        reason: json['reason'] as String?,
      );
}

/// Encode/decode helper used by both transport peers.
String encodeJson(Map<String, Object?> value) => jsonEncode(value);

Map<String, Object?> decodeJson(String source) =>
    (jsonDecode(source) as Map).cast<String, Object?>();
