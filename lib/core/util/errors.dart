/// Typed errors surfaced by the engine. Keeping them explicit lets the UI map
/// failures to friendly messages without string matching.
library;

sealed class LocalShareError implements Exception {
  const LocalShareError(this.message);
  final String message;

  @override
  String toString() => '$runtimeType: $message';
}

/// A protocol message was malformed or violated the schema.
class ProtocolError extends LocalShareError {
  const ProtocolError(super.message);
}

/// Peer rejected the session (user declined, PIN wrong, or blocked).
class SessionRejected extends LocalShareError {
  const SessionRejected(super.message);
}

/// PIN verification failed.
class PinMismatch extends LocalShareError {
  const PinMismatch(super.message);
}

/// A transferred file failed its checksum.
class ChecksumMismatch extends LocalShareError {
  const ChecksumMismatch(super.message);
}

/// The connection dropped mid-transfer; resume with the given offset.
class TransferInterrupted extends LocalShareError {
  TransferInterrupted(super.message, this.resumeOffset);
  final int resumeOffset;
}

/// A required platform capability is not available on this device.
class CapabilityUnavailable extends LocalShareError {
  const CapabilityUnavailable(super.message);
}
