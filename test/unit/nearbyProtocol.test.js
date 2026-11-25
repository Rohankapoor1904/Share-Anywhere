const {
  NearbyMessageType,
  encodeControl,
  decodeControl,
  encodeOfferParts,
  encodeEndpointInfo,
  decodeEndpointInfo,
  utf8ByteLength
} = require('../../src/engine/nearbyProtocol');
const { ProtocolError } = require('../../src/utils/errors');
const { kNearbyEndpointInfoMaxBytes, kNearbyMaxControlBytes } = require('../../src/utils/protocol');

const SHA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function file(idx, extra = {}) {
  return {
    fileId: `f-sess-1-${idx}`,
    fileName: `IMG_${String(idx).padStart(5, '0')}.jpg`,
    fileSize: 1000 + idx,
    mimeType: 'image/jpeg',
    sha256: SHA,
    ...extra
  };
}

describe('Nearby control protocol codec', () => {
  test('every message type round-trips through encode/decode', () => {
    const messages = [
      { t: NearbyMessageType.HELLO, deviceId: 'ls-android-1', displayName: 'Rohan Phone', fingerprint: 'FP', platform: 'android' },
      { t: NearbyMessageType.ANSWER, sessionId: 'nb-tx-1', accepted: true, reason: '' },
      { t: NearbyMessageType.FILE_START, sessionId: 'nb-tx-1', fileId: 'f-1', payloadId: '-9223372036854775807' },
      { t: NearbyMessageType.FILE_DONE, sessionId: 'nb-tx-1', fileId: 'f-1', sha256: SHA },
      { t: NearbyMessageType.ACK, sessionId: 'nb-tx-1', fileId: 'f-1', ok: false, reason: 'hash_mismatch' },
      { t: NearbyMessageType.CANCEL, sessionId: 'nb-tx-1', reason: 'cancelled' }
    ];
    for (const msg of messages) {
      expect(decodeControl(encodeControl(msg))).toEqual(msg);
    }
  });

  test('payload ids keep full 64-bit precision as strings', () => {
    const decoded = decodeControl(encodeControl({
      t: NearbyMessageType.FILE_START,
      sessionId: 's-1',
      fileId: 'f-1',
      payloadId: '9007199254740993'
    }));
    expect(decoded.payloadId).toBe('9007199254740993');
  });

  test('rejects unknown types, wrong versions and malformed JSON', () => {
    expect(() => decodeControl('{not json')).toThrow(ProtocolError);
    expect(() => decodeControl(JSON.stringify({ t: 'hello', v: 99, deviceId: 'a1', displayName: 'x' }))).toThrow(ProtocolError);
    expect(() => decodeControl(JSON.stringify({ t: 'exec', v: 1 }))).toThrow(ProtocolError);
    expect(() => encodeControl({ t: 'bogus' })).toThrow(ProtocolError);
  });

  test('rejects unsafe ids, bad hashes and non-boolean flags', () => {
    expect(() => encodeControl({ t: 'answer', sessionId: '../../etc', accepted: true })).toThrow(ProtocolError);
    expect(() => encodeControl({ t: 'fileDone', sessionId: 's1', fileId: 'f1', sha256: 'abc' })).toThrow(ProtocolError);
    expect(() => encodeControl({ t: 'ack', sessionId: 's1', fileId: 'f1', ok: 'yes' })).toThrow(ProtocolError);
    expect(() => encodeControl({ t: 'fileStart', sessionId: 's1', fileId: 'f1', payloadId: 12 })).toThrow(ProtocolError);
  });

  test('drops unknown fields from decoded messages', () => {
    const json = JSON.stringify({ t: 'cancel', v: 1, sessionId: 's1', reason: 'x', injected: { a: 1 } });
    expect(decodeControl(json)).toEqual({ t: 'cancel', sessionId: 's1', reason: 'x' });
  });

  test('a small offer fits in one part', () => {
    const parts = encodeOfferParts('sess-1', [file(0), file(1)]);
    expect(parts).toHaveLength(1);
    const decoded = decodeControl(parts[0]);
    expect(decoded.part).toBe(0);
    expect(decoded.parts).toBe(1);
    expect(decoded.files.map((f) => f.fileName)).toEqual(['IMG_00000.jpg', 'IMG_00001.jpg']);
  });

  test('a large offer is split into parts that each fit one BYTES payload', () => {
    const files = Array.from({ length: 600 }, (_, i) => file(i));
    const parts = encodeOfferParts('sess-1', files);
    expect(parts.length).toBeGreaterThan(1);
    const reassembled = [];
    parts.forEach((json, index) => {
      expect(utf8ByteLength(json)).toBeLessThanOrEqual(kNearbyMaxControlBytes);
      const msg = decodeControl(json);
      expect(msg.part).toBe(index);
      expect(msg.parts).toBe(parts.length);
      reassembled.push(...msg.files);
    });
    expect(reassembled.map((f) => f.fileId)).toEqual(files.map((f) => f.fileId));
  });

  test('rejects offers with invalid files', () => {
    expect(() => encodeOfferParts('sess-1', [])).toThrow(ProtocolError);
    expect(() => encodeOfferParts('sess-1', [file(0, { fileName: '' })])).toThrow(ProtocolError);
    expect(() => encodeOfferParts('sess-1', [file(0, { fileSize: -5 })])).toThrow(ProtocolError);
  });

  test('utf8ByteLength matches Node for multi-byte and astral text', () => {
    for (const text of ['abc', 'नमस्ते', 'Rohan 📱 फ़ोन', '\u00e9\u00e8']) {
      expect(utf8ByteLength(text)).toBe(Buffer.byteLength(text, 'utf8'));
    }
  });
});

describe('Nearby endpoint info', () => {
  test('round-trips the advertised identity', () => {
    const raw = encodeEndpointInfo({ deviceId: 'ls-android-42', displayName: 'Rohan ka Phone', platform: 'android' });
    expect(decodeEndpointInfo(raw, '', 'EP1')).toEqual({
      deviceId: 'ls-android-42',
      displayName: 'Rohan ka Phone',
      platform: 'android',
      protocolVersion: 1,
      recognized: true
    });
  });

  test('long multi-byte names are trimmed to fit the advertisement', () => {
    const raw = encodeEndpointInfo({
      deviceId: 'ls-android-42',
      displayName: 'बहुत लंबा नाम वाला फ़ोन 📱 '.repeat(6),
      platform: 'android'
    });
    expect(Buffer.byteLength(raw, 'utf8')).toBeLessThanOrEqual(kNearbyEndpointInfoMaxBytes);
    const decoded = decodeEndpointInfo(raw, '', 'EP1');
    expect(decoded.deviceId).toBe('ls-android-42');
    expect(decoded.displayName.length).toBeGreaterThan(0);
  });

  test('foreign or corrupt endpoint info falls back to a stable non-LocalShare id', () => {
    expect(decodeEndpointInfo('garbage', 'Pixel', 'A1B2')).toEqual({
      deviceId: 'nearby-A1B2',
      displayName: 'Pixel',
      platform: 'android',
      protocolVersion: 1,
      recognized: false
    });
    expect(decodeEndpointInfo(JSON.stringify({ d: '../x' }), '', 'Z9').deviceId).toBe('nearby-Z9');
  });
});
