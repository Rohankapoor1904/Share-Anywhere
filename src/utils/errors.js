/**
 * Typed domain errors for LocalShare operations.
 */

export class LocalShareError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   * @param {Record<string, unknown>} [details]
   */
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'LocalShareError';
    this.code = code;
    this.details = details;
  }
}

export class TrustMismatchError extends LocalShareError {
  /**
   * @param {string} deviceId
   * @param {string} expectedFingerprint
   * @param {string} actualFingerprint
   */
  constructor(deviceId, expectedFingerprint, actualFingerprint) {
    super(
      `Certificate fingerprint mismatch for peer ${deviceId}. Expected: ${expectedFingerprint}, Actual: ${actualFingerprint}`,
      'ERR_TRUST_MISMATCH',
      { deviceId, expectedFingerprint, actualFingerprint }
    );
    this.name = 'TrustMismatchError';
  }
}

export class PairingRejectedError extends LocalShareError {
  /**
   * @param {string} reason
   * @param {string} [deviceId]
   */
  constructor(reason, deviceId) {
    super(
      `Pairing was rejected: ${reason}`,
      'ERR_PAIRING_REJECTED',
      { reason, deviceId }
    );
    this.name = 'PairingRejectedError';
  }
}

export class TransferCancelledError extends LocalShareError {
  /**
   * @param {string} sessionId
   * @param {string} [initiator='local']
   */
  constructor(sessionId, initiator = 'local') {
    super(
      `Transfer session ${sessionId} was cancelled by ${initiator}.`,
      'ERR_TRANSFER_CANCELLED',
      { sessionId, initiator }
    );
    this.name = 'TransferCancelledError';
  }
}

export class NetworkTimeoutError extends LocalShareError {
  /**
   * @param {string} operation
   * @param {number} timeoutMs
   */
  constructor(operation, timeoutMs) {
    super(
      `Operation '${operation}' timed out after ${timeoutMs}ms.`,
      'ERR_NETWORK_TIMEOUT',
      { operation, timeoutMs }
    );
    this.name = 'NetworkTimeoutError';
  }
}

export class IntegrityCheckFailedError extends LocalShareError {
  /**
   * @param {string} fileId
   * @param {string} expectedSha256
   * @param {string} actualSha256
   */
  constructor(fileId, expectedSha256, actualSha256) {
    super(
      `Integrity check failed for file ${fileId}. Expected SHA-256: ${expectedSha256}, Actual: ${actualSha256}`,
      'ERR_INTEGRITY_MISMATCH',
      { fileId, expectedSha256, actualSha256 }
    );
    this.name = 'IntegrityCheckFailedError';
  }
}

export class ProtocolError extends LocalShareError {
  /**
   * @param {string} message
   * @param {Record<string, unknown>} [details]
   */
  constructor(message, details = {}) {
    super(message, 'ERR_PROTOCOL_VIOLATION', details);
    this.name = 'ProtocolError';
  }
}
