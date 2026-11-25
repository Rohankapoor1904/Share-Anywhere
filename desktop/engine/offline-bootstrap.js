/**
 * LocalShare offline PC bootstrap: BLE handshake that hands a PC the phone's
 * Local-Only Hotspot credentials, end-to-end encrypted.
 *
 * Wire spec (v1). The Android side (BootstrapCrypto.kt / OfflinePcModule.kt) implements
 * the same bytes; test vectors in test/unit/offlineBootstrap.test.js and
 * android/app/src/test/.../BootstrapCryptoTest.kt keep both in lockstep.
 *
 *   GATT service SERVICE_UUID on the phone:
 *     INFO   (read)          UTF-8 JSON {v,d,n,p,fp,pk,nonce}  pk = base64 P-256 uncompressed (65 B), nonce = base64 16 B
 *     HELLO  (write)         UTF-8 JSON {v,d,n,fp,pk,nonce}     written by the PC
 *     STATUS (read, notify)  1 byte: 0 idle, 1 waiting for the phone user, 2 credentials ready, 3 declined, 4 error
 *     CREDS  (read)          iv(12) || AES-256-GCM(ciphertext || tag(16)), readable only by the HELLO writer once STATUS = 2
 *
 *   transcript = SHA-256("LocalShare-Bootstrap-v1" || pkPhone || pkPc || noncePhone || noncePc)
 *   shared     = ECDH-P256(x coordinate, 32 B)
 *   key        = HKDF-SHA256(ikm=shared, salt=transcript, info="LocalShare creds key", 32)
 *   code       = uint32_be(HKDF-SHA256(shared, transcript, "LocalShare pairing code", 4)) mod 1e6, 6 digits
 *   CREDS plaintext = UTF-8 JSON {ssid, pass, ip, port, sec}, AAD = transcript
 *
 * Both screens show `code`; a man-in-the-middle holding two key pairs yields two different
 * codes. The phone user approves on the phone, which is the side that grants network access.
 */
const crypto = require('crypto');

const PROTOCOL_VERSION = 1;
const SERVICE_UUID = '6c4c6f63-616c-7368-6172-650000000010';
const INFO_UUID = '6c4c6f63-616c-7368-6172-650000000011';
const HELLO_UUID = '6c4c6f63-616c-7368-6172-650000000012';
const STATUS_UUID = '6c4c6f63-616c-7368-6172-650000000013';
const CREDS_UUID = '6c4c6f63-616c-7368-6172-650000000014';

const Status = {
  IDLE: 0,
  WAITING_APPROVAL: 1,
  READY: 2,
  DECLINED: 3,
  ERROR: 4
};

const TRANSCRIPT_LABEL = Buffer.from('LocalShare-Bootstrap-v1', 'utf8');
const KEY_INFO = Buffer.from('LocalShare creds key', 'utf8');
const CODE_INFO = Buffer.from('LocalShare pairing code', 'utf8');
const PUBLIC_KEY_BYTES = 65;
const NONCE_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_MESSAGE_BYTES = 1024;
const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/;

class BootstrapError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   */
  constructor(message, code) {
    super(message);
    this.name = 'BootstrapError';
    this.code = code;
  }
}

/**
 * @param {unknown} value
 * @param {number} length
 * @param {string} field
 * @returns {Buffer}
 */
function decodeFixedBase64(value, length, field) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new BootstrapError(`Bootstrap field "${field}" is not base64`, 'ERR_BOOTSTRAP_FORMAT');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length !== length) {
    throw new BootstrapError(`Bootstrap field "${field}" must be ${length} bytes`, 'ERR_BOOTSTRAP_FORMAT');
  }
  return bytes;
}

/**
 * Parse INFO or HELLO JSON bytes.
 * @param {Buffer|Uint8Array|string} raw
 * @param {'info'|'hello'} kind
 */
function parseIdentityMessage(raw, kind) {
  const bytes = typeof raw === 'string' ? Buffer.from(raw, 'utf8') : Buffer.from(raw);
  if (bytes.length === 0 || bytes.length > MAX_MESSAGE_BYTES) {
    throw new BootstrapError(`Bootstrap ${kind} has an invalid size (${bytes.length} bytes)`, 'ERR_BOOTSTRAP_FORMAT');
  }
  let msg;
  try {
    msg = JSON.parse(bytes.toString('utf8'));
  } catch (err) {
    throw new BootstrapError(`Bootstrap ${kind} is not valid JSON: ${err.message}`, 'ERR_BOOTSTRAP_FORMAT');
  }
  if (!msg || typeof msg !== 'object' || msg.v !== PROTOCOL_VERSION) {
    throw new BootstrapError(`Unsupported bootstrap ${kind} version`, 'ERR_BOOTSTRAP_VERSION');
  }
  if (typeof msg.d !== 'string' || !SAFE_ID.test(msg.d)) {
    throw new BootstrapError(`Bootstrap ${kind} has an invalid device id`, 'ERR_BOOTSTRAP_FORMAT');
  }
  return {
    deviceId: msg.d,
    displayName: typeof msg.n === 'string' && msg.n ? msg.n.slice(0, 128) : (kind === 'info' ? 'Phone' : 'PC'),
    platform: typeof msg.p === 'string' ? msg.p.slice(0, 16) : '',
    fingerprint: typeof msg.fp === 'string' ? msg.fp.slice(0, 256) : '',
    publicKey: decodeFixedBase64(msg.pk, PUBLIC_KEY_BYTES, 'pk'),
    nonce: decodeFixedBase64(msg.nonce, NONCE_BYTES, 'nonce')
  };
}

/**
 * @param {{ deviceId: string, displayName: string, platform?: string, fingerprint?: string }} self
 * @param {Buffer} publicKey
 * @param {Buffer} nonce
 * @returns {Buffer}
 */
function encodeIdentityMessage(self, publicKey, nonce) {
  if (!SAFE_ID.test(String(self.deviceId || ''))) {
    throw new BootstrapError('Invalid local device id for bootstrap', 'ERR_BOOTSTRAP_FORMAT');
  }
  /** @type {Record<string, any>} */
  const msg = {
    v: PROTOCOL_VERSION,
    d: self.deviceId,
    n: String(self.displayName || '').slice(0, 64),
    fp: String(self.fingerprint || ''),
    pk: publicKey.toString('base64'),
    nonce: nonce.toString('base64')
  };
  if (self.platform) msg.p = String(self.platform).slice(0, 16);
  return Buffer.from(JSON.stringify(msg), 'utf8');
}

/**
 * @param {Buffer} pkPhone
 * @param {Buffer} pkPc
 * @param {Buffer} noncePhone
 * @param {Buffer} noncePc
 * @returns {Buffer}
 */
function transcriptHash(pkPhone, pkPc, noncePhone, noncePc) {
  return crypto.createHash('sha256')
    .update(TRANSCRIPT_LABEL)
    .update(pkPhone)
    .update(pkPc)
    .update(noncePhone)
    .update(noncePc)
    .digest();
}

/**
 * @param {Buffer} shared
 * @param {Buffer} transcript
 * @returns {{ key: Buffer, code: string }}
 */
function deriveSessionSecrets(shared, transcript) {
  const key = Buffer.from(crypto.hkdfSync('sha256', shared, transcript, KEY_INFO, 32));
  const codeBytes = Buffer.from(crypto.hkdfSync('sha256', shared, transcript, CODE_INFO, 4));
  const code = String(codeBytes.readUInt32BE(0) % 1000000).padStart(6, '0');
  return { key, code };
}

/**
 * @param {crypto.ECDH} ecdh
 * @param {Buffer} remotePublicKey
 * @returns {Buffer}
 */
function computeShared(ecdh, remotePublicKey) {
  if (remotePublicKey.length !== PUBLIC_KEY_BYTES || remotePublicKey[0] !== 0x04) {
    throw new BootstrapError('Peer public key must be an uncompressed P-256 point', 'ERR_BOOTSTRAP_KEY');
  }
  try {
    // Node validates that the point is on the curve.
    return ecdh.computeSecret(remotePublicKey);
  } catch (err) {
    throw new BootstrapError(`Peer public key was rejected: ${err.message}`, 'ERR_BOOTSTRAP_KEY');
  }
}

/**
 * @param {Buffer} key
 * @param {Buffer} transcript
 * @param {object} creds
 * @param {Buffer} [iv]
 * @returns {Buffer}
 */
function sealCredentials(key, transcript, creds, iv = crypto.randomBytes(IV_BYTES)) {
  const plaintext = Buffer.from(JSON.stringify({
    ssid: creds.ssid,
    pass: creds.pass,
    ip: creds.ip,
    port: creds.port,
    sec: creds.sec
  }), 'utf8');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(transcript);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]);
}

/**
 * Validate decrypted hotspot credentials.
 * @param {any} parsed
 * @returns {{ ssid: string, pass: string, ip: string, port: number, sec: string }}
 */
function validateCredentials(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    throw new BootstrapError('Hotspot details are missing', 'ERR_BOOTSTRAP_CREDS');
  }
  const ssid = typeof parsed.ssid === 'string' ? parsed.ssid : '';
  const pass = typeof parsed.pass === 'string' ? parsed.pass : '';
  const ip = typeof parsed.ip === 'string' ? parsed.ip : '';
  const port = Number(parsed.port);
  const sec = typeof parsed.sec === 'string' ? parsed.sec : 'wpa2';
  if (!ssid || Buffer.byteLength(ssid, 'utf8') > 32) {
    throw new BootstrapError('Hotspot name is invalid', 'ERR_BOOTSTRAP_CREDS');
  }
  if (sec !== 'open' && (pass.length < 8 || pass.length > 63)) {
    throw new BootstrapError('Hotspot password is invalid', 'ERR_BOOTSTRAP_CREDS');
  }
  if (!/^(\d{1,3})(\.\d{1,3}){3}$/.test(ip) || ip.split('.').some((o) => Number(o) > 255)) {
    throw new BootstrapError('Phone address is invalid', 'ERR_BOOTSTRAP_CREDS');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new BootstrapError('Phone port is invalid', 'ERR_BOOTSTRAP_CREDS');
  }
  return { ssid, pass, ip, port, sec };
}

/**
 * @param {Buffer} key
 * @param {Buffer} transcript
 * @param {Buffer} blob
 */
function openCredentials(key, transcript, blob) {
  if (!Buffer.isBuffer(blob) || blob.length < IV_BYTES + TAG_BYTES + 2) {
    throw new BootstrapError('Encrypted hotspot details are truncated', 'ERR_BOOTSTRAP_CREDS');
  }
  const iv = blob.subarray(0, IV_BYTES);
  const tag = blob.subarray(blob.length - TAG_BYTES);
  const body = blob.subarray(IV_BYTES, blob.length - TAG_BYTES);
  let plaintext;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(transcript);
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(body), decipher.final()]);
  } catch (err) {
    throw new BootstrapError('Hotspot details failed authentication (wrong phone or tampered data)', 'ERR_BOOTSTRAP_AUTH');
  }
  let parsed;
  try {
    parsed = JSON.parse(plaintext.toString('utf8'));
  } catch (err) {
    throw new BootstrapError('Hotspot details are not valid JSON', 'ERR_BOOTSTRAP_CREDS');
  }
  return validateCredentials(parsed);
}

/**
 * PC side of the handshake.
 * @param {{ deviceId: string, displayName: string, fingerprint?: string }} self
 * @param {object} [testing] - Fixed key material, for test vectors only.
 * @param {Buffer} [testing.privateKey]
 * @param {Buffer} [testing.nonce]
 */
function createPcSession(self, testing = {}) {
  const ecdh = crypto.createECDH('prime256v1');
  if (testing.privateKey) ecdh.setPrivateKey(testing.privateKey);
  else ecdh.generateKeys();
  const publicKey = ecdh.getPublicKey();
  const nonce = testing.nonce || crypto.randomBytes(NONCE_BYTES);
  /** @type {null | { key: Buffer, transcript: Buffer, code: string, phone: object }} */
  let secrets = null;

  return {
    /**
     * Process the phone's INFO and produce this PC's HELLO plus the code to show.
     * @param {Buffer|Uint8Array|string} infoBytes
     */
    acceptInfo(infoBytes) {
      const phone = parseIdentityMessage(infoBytes, 'info');
      const shared = computeShared(ecdh, phone.publicKey);
      const transcript = transcriptHash(phone.publicKey, publicKey, phone.nonce, nonce);
      const { key, code } = deriveSessionSecrets(shared, transcript);
      secrets = {
        key,
        transcript,
        code,
        phone: {
          deviceId: phone.deviceId,
          displayName: phone.displayName,
          platform: phone.platform || 'android',
          fingerprint: phone.fingerprint
        }
      };
      return {
        hello: encodeIdentityMessage(self, publicKey, nonce),
        code,
        phone: secrets.phone
      };
    },

    /**
     * Decrypt the CREDS blob read from the phone.
     * @param {Buffer|Uint8Array} blob
     */
    openCredentials(blob) {
      if (!secrets) throw new BootstrapError('Read the phone info before its hotspot details', 'ERR_BOOTSTRAP_STATE');
      return openCredentials(secrets.key, secrets.transcript, Buffer.from(blob));
    },

    get code() {
      return secrets ? secrets.code : '';
    },

    get phone() {
      return secrets ? secrets.phone : null;
    }
  };
}

/**
 * Phone side of the handshake, the reference the Kotlin module mirrors (also used by tests).
 * @param {{ deviceId: string, displayName: string, platform?: string, fingerprint?: string }} self
 * @param {object} [testing]
 * @param {Buffer} [testing.privateKey]
 * @param {Buffer} [testing.nonce]
 */
function createPhoneSession(self, testing = {}) {
  const ecdh = crypto.createECDH('prime256v1');
  if (testing.privateKey) ecdh.setPrivateKey(testing.privateKey);
  else ecdh.generateKeys();
  const publicKey = ecdh.getPublicKey();
  const nonce = testing.nonce || crypto.randomBytes(NONCE_BYTES);
  const info = encodeIdentityMessage({ ...self, platform: self.platform || 'android' }, publicKey, nonce);
  /** @type {null | { key: Buffer, transcript: Buffer, code: string, pc: object }} */
  let secrets = null;

  return {
    info,

    /** @param {Buffer|Uint8Array|string} helloBytes */
    acceptHello(helloBytes) {
      const pc = parseIdentityMessage(helloBytes, 'hello');
      const shared = computeShared(ecdh, pc.publicKey);
      const transcript = transcriptHash(publicKey, pc.publicKey, nonce, pc.nonce);
      const { key, code } = deriveSessionSecrets(shared, transcript);
      secrets = {
        key,
        transcript,
        code,
        pc: { deviceId: pc.deviceId, displayName: pc.displayName, fingerprint: pc.fingerprint }
      };
      return { code, pc: secrets.pc };
    },

    /**
     * @param {{ ssid: string, pass: string, ip: string, port: number, sec: string }} creds
     * @param {Buffer} [iv]
     */
    sealCredentials(creds, iv) {
      if (!secrets) throw new BootstrapError('No PC has written its hello yet', 'ERR_BOOTSTRAP_STATE');
      return sealCredentials(secrets.key, secrets.transcript, validateCredentials(creds), iv);
    }
  };
}

module.exports = {
  PROTOCOL_VERSION,
  SERVICE_UUID,
  INFO_UUID,
  HELLO_UUID,
  STATUS_UUID,
  CREDS_UUID,
  Status,
  BootstrapError,
  createPcSession,
  createPhoneSession,
  validateCredentials,
  // exported for test vectors
  transcriptHash,
  deriveSessionSecrets,
  sealCredentials,
  openCredentials
};
