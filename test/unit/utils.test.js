const { formatBytes, formatSpeed, formatEta } = require('../../src/utils/byteFormat');
const { generateDeviceName, sanitizeDeviceName } = require('../../src/utils/deviceName');
const {
  LocalShareError,
  TrustMismatchError,
  PairingRejectedError,
  TransferCancelledError,
  NetworkTimeoutError,
  IntegrityCheckFailedError,
  ProtocolError
} = require('../../src/utils/errors');

describe('Utils Unit Tests (§12.1)', () => {
  describe('byteFormat', () => {
    test('formatBytes formats zero and boundary byte values', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(-50)).toBe('0 B');
      expect(formatBytes('invalid')).toBe('0 B');
      expect(formatBytes(500)).toBe('500 B');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(1073741824)).toBe('1 GB');
      expect(formatBytes(1099511627776)).toBe('1 TB');
    });

    test('formatSpeed formats transfer speed rates', () => {
      expect(formatSpeed(0)).toBe('0 B/s');
      expect(formatSpeed(-100)).toBe('0 B/s');
      expect(formatSpeed(1048576)).toBe('1 MB/s');
      expect(formatSpeed(5242880)).toBe('5 MB/s');
    });

    test('formatEta calculates remaining time accurately', () => {
      expect(formatEta(0, 1000)).toBe('--');
      expect(formatEta(1000, 0)).toBe('--');
      expect(formatEta(-100, 1000)).toBe('--');
      expect(formatEta(10000, 1000)).toBe('00:10');
      expect(formatEta(65000, 1000)).toBe('01:05');
      expect(formatEta(3665000, 1000)).toBe('1:01:05');
    });
  });

  describe('deviceName', () => {
    test('generateDeviceName creates valid deterministic names', () => {
      const name1 = generateDeviceName('device-abc');
      const name2 = generateDeviceName('device-abc');
      expect(name1).toBe(name2);
      expect(typeof name1).toBe('string');
      expect(name1.length).toBeGreaterThan(5);
    });

    test('sanitizeDeviceName strips illegal characters and caps length', () => {
      expect(sanitizeDeviceName('')).toBe('LocalShare-Device');
      expect(sanitizeDeviceName(null)).toBe('LocalShare-Device');
      expect(sanitizeDeviceName('  My Device!! @#123  ')).toBe('My Device 123');
      const veryLong = 'A'.repeat(50);
      expect(sanitizeDeviceName(veryLong).length).toBe(32);
    });
  });

  describe('errors', () => {
    test('TrustMismatchError sets properties and message correctly', () => {
      const err = new TrustMismatchError('peer-1', 'EXP_FP', 'ACT_FP');
      expect(err instanceof LocalShareError).toBe(true);
      expect(err.name).toBe('TrustMismatchError');
      expect(err.code).toBe('ERR_TRUST_MISMATCH');
      expect(err.details.expectedFingerprint).toBe('EXP_FP');
      expect(err.details.actualFingerprint).toBe('ACT_FP');
      expect(err.message).toContain('EXP_FP');
    });

    test('PairingRejectedError sets reason', () => {
      const err = new PairingRejectedError('too_many_attempts', 'peer-1');
      expect(err.name).toBe('PairingRejectedError');
      expect(err.code).toBe('ERR_PAIRING_REJECTED');
      expect(err.details.reason).toBe('too_many_attempts');
    });

    test('TransferCancelledError sets sessionId and initiator', () => {
      const err = new TransferCancelledError('sess-123', 'remote');
      expect(err.name).toBe('TransferCancelledError');
      expect(err.code).toBe('ERR_TRANSFER_CANCELLED');
      expect(err.details.sessionId).toBe('sess-123');
      expect(err.details.initiator).toBe('remote');
    });

    test('NetworkTimeoutError records timeout details', () => {
      const err = new NetworkTimeoutError('chunk_write', 5000);
      expect(err.name).toBe('NetworkTimeoutError');
      expect(err.code).toBe('ERR_NETWORK_TIMEOUT');
      expect(err.details.operation).toBe('chunk_write');
      expect(err.details.timeoutMs).toBe(5000);
    });

    test('IntegrityCheckFailedError records hashes', () => {
      const err = new IntegrityCheckFailedError('file-1', 'hashA', 'hashB');
      expect(err.name).toBe('IntegrityCheckFailedError');
      expect(err.code).toBe('ERR_INTEGRITY_MISMATCH');
      expect(err.details.expectedSha256).toBe('hashA');
      expect(err.details.actualSha256).toBe('hashB');
    });

    test('ProtocolError formats violation message', () => {
      const err = new ProtocolError('Invalid header', { header: 'x-session' });
      expect(err.name).toBe('ProtocolError');
      expect(err.code).toBe('ERR_PROTOCOL_VIOLATION');
      expect(err.details.header).toBe('x-session');
    });
  });
});

