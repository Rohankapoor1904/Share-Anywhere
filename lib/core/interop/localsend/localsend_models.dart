/// LocalSend Protocol v2.2 wire models and constants.
///
/// A faithful, dependency-free transcription of the public protocol
/// (https://github.com/localsend/protocol) so LocalShare can exchange files
/// with the official LocalSend app. Field names match the spec exactly.
library;

/// Default TCP/UDP port every LocalSend member listens on.
const int kLocalSendPort = 53317;

/// Multicast group and port LocalSend announces on.
const String kLocalSendMulticastAddress = '224.0.0.167';

/// Service types LocalSend advertises over mDNS (it also uses multicast UDP).
const String kLocalSendMdnsService = '_localsend._tcp';

/// API prefix for every v2 route.
const String kLocalSendApiPrefix = '/api/localsend/v2';

/// Upper bound on a v2 protocol minor version we understand.
const String kLocalSendVersion = '2.2';

/// LocalSend `deviceType` values (UI hint only; no protocol difference).
enum LocalSendDeviceType {
  mobile,
  desktop,
  web,
  headless,
  server;

  String get wire => name;

  static LocalSendDeviceType fromWire(String? value) => switch (value) {
        'mobile' => LocalSendDeviceType.mobile,
        'web' => LocalSendDeviceType.web,
        'headless' => LocalSendDeviceType.headless,
        'server' => LocalSendDeviceType.server,
        _ => LocalSendDeviceType.desktop,
      };
}

/// The `info` object sent in `register` and `prepare-upload`.
class LocalSendInfo {
  const LocalSendInfo({
    required this.alias,
    required this.version,
    required this.fingerprint,
    required this.port,
    required this.protocol,
    this.deviceModel,
    this.deviceType = LocalSendDeviceType.desktop,
    this.download = false,
  });

  final String alias;
  final String version;
  final String fingerprint;
  final int port;

  /// `http` or `https`.
  final String protocol;
  final String? deviceModel;
  final LocalSendDeviceType deviceType;
  final bool download;

  Map<String, Object?> toJson() => {
        'alias': alias,
        'version': version,
        'deviceModel': deviceModel,
        'deviceType': deviceType.wire,
        'fingerprint': fingerprint,
        'port': port,
        'protocol': protocol,
        'download': download,
      };

  factory LocalSendInfo.fromJson(Map<String, Object?> json) => LocalSendInfo(
        alias: (json['alias'] as String?) ?? 'Unknown',
        version: (json['version'] as String?) ?? '2.0',
        fingerprint: (json['fingerprint'] as String?) ?? '',
        port: (json['port'] as num?)?.toInt() ?? kLocalSendPort,
        protocol: (json['protocol'] as String?) ?? 'http',
        deviceModel: json['deviceModel'] as String?,
        deviceType: LocalSendDeviceType.fromWire(json['deviceType'] as String?),
        download: (json['download'] as bool?) ?? false,
      );
}

/// One entry in the `files` map of `prepare-upload`.
class LocalSendFile {
  const LocalSendFile({
    required this.id,
    required this.fileName,
    required this.size,
    this.fileType,
    this.sha256,
    this.preview,
    this.metadata,
  });

  final String id;
  final String fileName;
  final int size;
  final String? fileType;
  final String? sha256;
  final String? preview;
  final LocalSendFileMetadata? metadata;

  Map<String, Object?> toJson() => {
        'id': id,
        'fileName': fileName,
        'size': size,
        'fileType': fileType ?? 'application/octet-stream',
        'sha256': sha256,
        'preview': preview,
        if (metadata != null) 'metadata': metadata!.toJson(),
      };

  factory LocalSendFile.fromJson(Map<String, Object?> json) => LocalSendFile(
        id: (json['id'] as String?) ?? (json['fileName'] as String?) ?? '',
        fileName: (json['fileName'] as String?) ?? 'file',
        size: (json['size'] as num?)?.toInt() ?? 0,
        fileType: json['fileType'] as String?,
        sha256: json['sha256'] as String?,
        preview: json['preview'] as String?,
        metadata: json['metadata'] is Map
            ? LocalSendFileMetadata.fromJson((json['metadata'] as Map).cast<String, Object?>())
            : null,
      );
}

class LocalSendFileMetadata {
  const LocalSendFileMetadata({this.modified, this.accessed});
  final String? modified;
  final String? accessed;

  Map<String, Object?> toJson() => {
        'modified': modified,
        'accessed': accessed,
      };

  factory LocalSendFileMetadata.fromJson(Map<String, Object?> json) => LocalSendFileMetadata(
        modified: json['modified'] as String?,
        accessed: json['accessed'] as String?,
      );
}

/// Body of `POST /prepare-upload`.
class LocalSendPrepareRequest {
  const LocalSendPrepareRequest({required this.info, required this.files});

  final LocalSendInfo info;

  /// Keyed by file id.
  final Map<String, LocalSendFile> files;

  Map<String, Object?> toJson() => {
        'info': info.toJson(),
        'files': files.map((k, v) => MapEntry(k, v.toJson())),
      };

  factory LocalSendPrepareRequest.fromJson(Map<String, Object?> json) => LocalSendPrepareRequest(
        info: LocalSendInfo.fromJson((json['info'] as Map).cast<String, Object?>()),
        files: ((json['files'] as Map?) ?? const {}).map(
          (k, v) => MapEntry(k as String, LocalSendFile.fromJson((v as Map).cast<String, Object?>())),
        ),
      );
}

/// Body of the `POST /prepare-upload` 200 response.
class LocalSendPrepareResponse {
  const LocalSendPrepareResponse({required this.sessionId, required this.files});

  final String sessionId;

  /// fileId -> token.
  final Map<String, String> files;

  Map<String, Object?> toJson() => {'sessionId': sessionId, 'files': files};

  factory LocalSendPrepareResponse.fromJson(Map<String, Object?> json) => LocalSendPrepareResponse(
        sessionId: (json['sessionId'] as String?) ?? '',
        files: ((json['files'] as Map?) ?? const {})
            .map((k, v) => MapEntry(k as String, v as String)),
      );
}

/// LocalSend's documented HTTP status codes.
class LocalSendStatus {
  const LocalSendStatus._();

  static const int ok = 200;
  static const int noContent = 204;
  static const int badRequest = 400;
  static const int pinRequired = 401;
  static const int rejected = 403;
  static const int blockedBySession = 409;
  static const int tooManyRequests = 429;
  static const int checksumMismatch = 422;
  static const int unknownError = 500;
}

/// Map an internal rejection reason to a LocalSend HTTP status.
int localSendStatusForReason(String? reason) => switch (reason) {
      'pin_required' => LocalSendStatus.pinRequired,
      'pin_expired' => LocalSendStatus.pinRequired,
      'too_many_attempts' => LocalSendStatus.tooManyRequests,
      'busy' => LocalSendStatus.blockedBySession,
      _ => LocalSendStatus.rejected,
    };
