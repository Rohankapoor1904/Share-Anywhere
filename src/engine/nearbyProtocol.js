/**
 * LocalShare control protocol carried over Google Nearby Connections BYTES payloads.
 *
 * Every message is one UTF-8 JSON object `{ t: <type>, v: <version>, ... }` that must
 * fit in a single BYTES payload (32 KiB). File contents travel separately as Nearby
 * FILE payloads; `fileStart` binds a payload id to a file announced in the `offer`.
 *
 *   sender                                   receiver
 *   hello  ───────────────────────────────►  (both directions, right after connecting)
 *   offer  (1..n parts) ──────────────────►  approval prompt
 *          ◄───────────────────────────────  answer {accepted}
 *   fileStart {fileId, payloadId} ────────►
 *   [FILE payload bytes] ═════════════════►
 *   fileDone {fileId, sha256} ────────────►  hash check
 *          ◄───────────────────────────────  ack {ok}
 *   cancel ◄──────────────────────────────►  (either side, any time)
 */
import { ProtocolError } from '../utils/errors';
import {
  kNearbyProtocolVersion,
  kNearbyMaxControlBytes,
  kNearbyEndpointInfoMaxBytes
} from '../utils/protocol';
import { FileDescriptor } from './models';

export const NearbyMessageType = {
  HELLO: 'hello',
  OFFER: 'offer',
  ANSWER: 'answer',
  FILE_START: 'fileStart',
  FILE_DONE: 'fileDone',
  ACK: 'ack',
  CANCEL: 'cancel'
};

const MESSAGE_TYPES = new Set(Object.values(NearbyMessageType));
const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/;
// Nearby payload ids are signed 64-bit integers, carried as decimal strings.
const PAYLOAD_ID = /^-?\d{1,20}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/i;
const MAX_OFFER_PARTS = 64;
const MAX_NAME_LENGTH = 255;
const MAX_TEXT_LENGTH = 256;

/**
 * UTF-8 encoded length of a string without Buffer/TextEncoder (Hermes-safe).
 * @param {string} str
 * @returns {number}
 */
export function utf8ByteLength(str) {
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @param {number} [max]
 * @returns {string}
 */
function requireText(value, field, max = MAX_TEXT_LENGTH) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ProtocolError(`Nearby message field "${field}" must be a non-empty string`, { field });
  }
  if (value.length > max) {
    throw new ProtocolError(`Nearby message field "${field}" is too long`, { field, length: value.length });
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {string}
 */
function optionalText(value, field) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > MAX_TEXT_LENGTH) {
    throw new ProtocolError(`Nearby message field "${field}" must be a short string`, { field });
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {string}
 */
function requireId(value, field) {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    throw new ProtocolError(`Nearby message field "${field}" is not a valid id`, { field });
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {boolean}
 */
function requireBoolean(value, field) {
  if (typeof value !== 'boolean') {
    throw new ProtocolError(`Nearby message field "${field}" must be a boolean`, { field });
  }
  return value;
}

/**
 * Validate one offered file and return its normalized wire form.
 * @param {any} raw
 * @returns {{ fileId: string, fileName: string, fileSize: number, mimeType: string, sha256: string }}
 */
function normalizeFile(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new ProtocolError('Nearby offer contains a file entry that is not an object');
  }
  const desc = new FileDescriptor(raw);
  requireId(desc.fileId, 'files[].fileId');
  requireText(desc.fileName, 'files[].fileName', MAX_NAME_LENGTH);
  if (!Number.isFinite(desc.fileSize) || desc.fileSize < 0) {
    throw new ProtocolError('Nearby offer contains an invalid file size', { fileId: desc.fileId });
  }
  if (desc.sha256 && !SHA256_HEX.test(desc.sha256)) {
    throw new ProtocolError('Nearby offer contains an invalid SHA-256', { fileId: desc.fileId });
  }
  return desc.toJSON();
}

/**
 * Validate a message object (outgoing or decoded) and return its normalized form.
 * Unknown fields are dropped so nothing unexpected reaches the engine.
 * @param {any} msg
 * @returns {Record<string, any>}
 */
export function validateControl(msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
    throw new ProtocolError('Nearby control message must be a JSON object');
  }
  const type = msg.t;
  if (!MESSAGE_TYPES.has(type)) {
    throw new ProtocolError(`Unknown Nearby control message type: ${String(type)}`, { type });
  }

  switch (type) {
    case NearbyMessageType.HELLO:
      return {
        t: type,
        deviceId: requireId(msg.deviceId, 'deviceId'),
        displayName: requireText(msg.displayName, 'displayName', 128),
        fingerprint: optionalText(msg.fingerprint, 'fingerprint'),
        platform: optionalText(msg.platform, 'platform') || 'unknown'
      };
    case NearbyMessageType.OFFER: {
      const part = msg.part;
      const parts = msg.parts;
      if (!Number.isInteger(parts) || parts < 1 || parts > MAX_OFFER_PARTS) {
        throw new ProtocolError('Nearby offer has an invalid part count', { parts });
      }
      if (!Number.isInteger(part) || part < 0 || part >= parts) {
        throw new ProtocolError('Nearby offer has an invalid part index', { part, parts });
      }
      if (!Array.isArray(msg.files) || msg.files.length === 0) {
        throw new ProtocolError('Nearby offer part must list at least one file');
      }
      return {
        t: type,
        sessionId: requireId(msg.sessionId, 'sessionId'),
        part,
        parts,
        files: msg.files.map(normalizeFile)
      };
    }
    case NearbyMessageType.ANSWER:
      return {
        t: type,
        sessionId: requireId(msg.sessionId, 'sessionId'),
        accepted: requireBoolean(msg.accepted, 'accepted'),
        reason: optionalText(msg.reason, 'reason')
      };
    case NearbyMessageType.FILE_START:
      if (typeof msg.payloadId !== 'string' || !PAYLOAD_ID.test(msg.payloadId)) {
        throw new ProtocolError('Nearby fileStart has an invalid payload id');
      }
      return {
        t: type,
        sessionId: requireId(msg.sessionId, 'sessionId'),
        fileId: requireId(msg.fileId, 'fileId'),
        payloadId: msg.payloadId
      };
    case NearbyMessageType.FILE_DONE:
      if (typeof msg.sha256 !== 'string' || !SHA256_HEX.test(msg.sha256)) {
        throw new ProtocolError('Nearby fileDone must carry the file SHA-256');
      }
      return {
        t: type,
        sessionId: requireId(msg.sessionId, 'sessionId'),
        fileId: requireId(msg.fileId, 'fileId'),
        sha256: msg.sha256.toLowerCase()
      };
    case NearbyMessageType.ACK:
      return {
        t: type,
        sessionId: requireId(msg.sessionId, 'sessionId'),
        fileId: requireId(msg.fileId, 'fileId'),
        ok: requireBoolean(msg.ok, 'ok'),
        reason: optionalText(msg.reason, 'reason')
      };
    case NearbyMessageType.CANCEL:
      return {
        t: type,
        sessionId: requireId(msg.sessionId, 'sessionId'),
        reason: optionalText(msg.reason, 'reason')
      };
    default:
      throw new ProtocolError(`Unhandled Nearby control message type: ${String(type)}`);
  }
}

/**
 * Serialize a control message, enforcing the single-payload size limit.
 * @param {Record<string, any>} msg
 * @returns {string}
 */
export function encodeControl(msg) {
  const normalized = validateControl(msg);
  const json = JSON.stringify({ ...normalized, v: kNearbyProtocolVersion });
  const size = utf8ByteLength(json);
  if (size > kNearbyMaxControlBytes) {
    throw new ProtocolError(`Nearby control message is ${size} bytes (limit ${kNearbyMaxControlBytes})`, { size });
  }
  return json;
}

/**
 * Parse and validate a received control message.
 * @param {string} json
 * @returns {Record<string, any>}
 */
export function decodeControl(json) {
  if (typeof json !== 'string' || json.length === 0) {
    throw new ProtocolError('Empty Nearby control payload');
  }
  if (utf8ByteLength(json) > kNearbyMaxControlBytes) {
    throw new ProtocolError('Nearby control payload exceeds the size limit');
  }
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new ProtocolError(`Nearby control payload is not valid JSON: ${err.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || parsed.v !== kNearbyProtocolVersion) {
    throw new ProtocolError('Unsupported Nearby control protocol version', {
      version: parsed && typeof parsed === 'object' ? parsed.v : undefined
    });
  }
  return validateControl(parsed);
}

/**
 * Split an offer across as many BYTES payloads as needed (each under the size limit).
 * @param {string} sessionId
 * @param {Array<object>} files - FileDescriptor instances or plain descriptor objects.
 * @param {number} [maxBytes]
 * @returns {string[]} Encoded offer messages, in part order.
 */
export function encodeOfferParts(sessionId, files, maxBytes = kNearbyMaxControlBytes) {
  requireId(sessionId, 'sessionId');
  if (!Array.isArray(files) || files.length === 0) {
    throw new ProtocolError('A Nearby offer needs at least one file');
  }
  const normalized = files.map(normalizeFile);
  // Size each group against the widest part fields so the final numbering always fits.
  const probe = (group) => utf8ByteLength(JSON.stringify({
    t: NearbyMessageType.OFFER,
    sessionId,
    part: MAX_OFFER_PARTS,
    parts: MAX_OFFER_PARTS,
    files: group,
    v: kNearbyProtocolVersion
  }));

  /** @type {Array<Array<object>>} */
  const groups = [];
  let current = [];
  for (const file of normalized) {
    if (probe([file]) > maxBytes) {
      throw new ProtocolError(`File "${file.fileName}" cannot be described in one Nearby control message`);
    }
    if (current.length > 0 && probe([...current, file]) > maxBytes) {
      groups.push(current);
      current = [];
    }
    current.push(file);
  }
  if (current.length > 0) groups.push(current);

  if (groups.length > MAX_OFFER_PARTS) {
    throw new ProtocolError(`Too many files for one Nearby transfer (${normalized.length})`);
  }
  return groups.map((group, index) => encodeControl({
    t: NearbyMessageType.OFFER,
    sessionId,
    part: index,
    parts: groups.length,
    files: group
  }));
}

/**
 * Compact identity advertised with the Nearby endpoint (seen before any connection).
 * The name is trimmed so the whole JSON stays within kNearbyEndpointInfoMaxBytes.
 * @param {{ deviceId: string, displayName: string, platform?: string }} device
 * @returns {string}
 */
export function encodeEndpointInfo(device) {
  const deviceId = requireId(device && device.deviceId, 'deviceId');
  const platform = String((device && device.platform) || 'android').slice(0, 16);
  const chars = Array.from(String((device && device.displayName) || 'LocalShare'));
  const build = (name) => JSON.stringify({ d: deviceId, n: name, p: platform, v: kNearbyProtocolVersion });

  let json = build(chars.join(''));
  while (utf8ByteLength(json) > kNearbyEndpointInfoMaxBytes && chars.length > 0) {
    chars.pop();
    json = build(chars.join('').trimEnd());
  }
  if (utf8ByteLength(json) > kNearbyEndpointInfoMaxBytes) {
    throw new ProtocolError('Device id is too long for a Nearby advertisement');
  }
  return json;
}

/**
 * Decode an advertised identity. Endpoints from other apps or older builds still get a
 * stable, clearly non-LocalShare id instead of being dropped.
 * @param {string} raw
 * @param {string} fallbackName
 * @param {string} endpointId
 * @returns {{ deviceId: string, displayName: string, platform: string, protocolVersion: number, recognized: boolean }}
 */
export function decodeEndpointInfo(raw, fallbackName, endpointId) {
  const fallback = {
    deviceId: `nearby-${String(endpointId || 'unknown').replace(/[^A-Za-z0-9._-]/g, '')}`,
    displayName: fallbackName || 'Nearby device',
    platform: 'android',
    protocolVersion: kNearbyProtocolVersion,
    recognized: false
  };
  if (typeof raw !== 'string' || raw.length === 0) return fallback;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.d !== 'string' || !SAFE_ID.test(parsed.d)) {
    return fallback;
  }
  return {
    deviceId: parsed.d,
    displayName: typeof parsed.n === 'string' && parsed.n ? parsed.n : fallback.displayName,
    platform: typeof parsed.p === 'string' && parsed.p ? parsed.p : 'android',
    protocolVersion: typeof parsed.v === 'number' ? parsed.v : kNearbyProtocolVersion,
    recognized: true
  };
}
