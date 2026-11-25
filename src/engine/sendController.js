import { EngineEventType } from './EngineEvents';
import { kDefaultChunkSize, kHeaderSessionId } from '../utils/protocol';
import {
  SessionRequest,
  FileDescriptor,
  CommitRequest
} from './models';
import {
  TrustMismatchError,
  PairingRejectedError,
  TransferCancelledError,
  IntegrityCheckFailedError
} from '../utils/errors';
import { NativeBridge } from '../native/NativeBridge';
import { peerAuthHeaders } from './remoteFs';
import { defaultLogger } from '../utils/logger';

const logger = defaultLogger;

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Decode a base64 string into raw bytes without relying on Buffer/atob (Hermes-safe).
 * @param {string} base64
 * @returns {Uint8Array}
 */
function decodeBase64(base64) {
  const clean = String(base64).replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let p = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    const idx = BASE64_CHARS.indexOf(clean[i]);
    if (idx === -1) continue;
    buffer = (buffer << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[p++] = (buffer >> bits) & 0xff;
    }
  }
  return bytes.slice(0, p);
}

/**
 * Normalize a content:// or file:// URI into a filesystem path usable by react-native-fs.
 * @param {object} file
 * @returns {string}
 */
function resolveLocalPath(file) {
  const raw = file.path || file.uri || file.id || '';
  return raw.startsWith('file://') ? raw.slice('file://'.length) : raw;
}

/**
 * Build the plain header object for the native chunk uploader.
 * @param {string} sessionId
 * @param {object} desc
 * @param {number} offset
 * @returns {{ [k: string]: string }}
 */
function chunkHeaders(sessionId, desc, offset) {
  return {
    [kHeaderSessionId]: sessionId,
    'x-file-id': desc.fileId,
    'x-offset': String(offset)
  };
}

/**
 * Read a byte range from a local file via react-native-fs (real OS filesystem access).
 * @param {object} file
 * @param {number} offset
 * @param {number} length
 * @returns {Promise<Uint8Array>}
 */
async function readFileChunk(file, offset, length) {
  const absPath = resolveLocalPath(file);
  if (!absPath) {
    throw new Error(`Missing local file path for ${file.name}`);
  }
  // eslint-disable-next-line global-require
  const RNFS = require('react-native-fs');
  const base64 = await RNFS.read(absPath, length, offset);
  return decodeBase64(base64);
}

/**
 * Compute the streaming SHA-256 of a local file using the native hashing module.
 * @param {object} file
 * @returns {Promise<string>}
 */
async function computeFileSha256(file) {
  if (file.sha256) return file.sha256;
  const target = file.path || file.uri || file.id || '';
  if (!target) return '';
  const result = await NativeBridge.computeFileHash(target);
  return result && result.sha256 ? result.sha256 : '';
}

export class SendController {
  /**
   * @param {object} options
   * @param {import('./EngineEvents').EngineEventEmitter} options.events
   * @param {import('./trustStore').TrustStore} options.trustStore
   * @param {import('./pairing').PairingEngine} options.pairing
   * @param {object} options.selfDevice
   * @param {import('./nearbyController').NearbyController} [options.nearby] - Offline transport.
   */
  constructor({ events, trustStore, pairing, selfDevice, nearby }) {
    this.events = events;
    this.trustStore = trustStore;
    this.pairing = pairing;
    this.selfDevice = selfDevice;
    this.nearby = nearby || null;

    /** @type {Map<string, { abortController: AbortController, isCancelled: boolean }>} */
    this.activeTransfers = new Map();
  }

  /**
   * Cancel an ongoing transfer session.
   * @param {string} sessionId
   */
  cancelTransfer(sessionId) {
    if (NativeBridge.isAvailable() && typeof NativeBridge.cancelSession === 'function') {
      try {
        NativeBridge.cancelSession(sessionId);
      } catch (err) {
        logger.warn('Failed to invoke native cancelSession:', err.message);
      }
    }
    const active = this.activeTransfers.get(sessionId);
    if (active) {
      active.isCancelled = true;
      active.abortController.abort();
      this.activeTransfers.delete(sessionId);
      this.events.emit(EngineEventType.TRANSFER_CANCELLED, { sessionId });
      logger.info(`Transfer session ${sessionId} cancelled by user`);
    }
  }

  /**
   * Send files to a peer (Native LocalShare TLS, LocalSend v2.2, or Nearby when there is no shared Wi-Fi).
   * @param {object} peer - Target peer.
   * @param {Array<object>} files - Staged file descriptors.
   */
  async send(peer, files) {
    // Nearby peers have no IP address, so they branch off before the address check.
    if (peer && peer.transport === 'nearby') {
      if (!this.nearby) {
        throw new Error('Offline sharing (Nearby) is not available on this device');
      }
      return this.nearby.send(peer, files);
    }
    if (!peer || !peer.address || !peer.port) {
      throw new Error('Invalid peer target: address and port required');
    }
    if (!files || files.length === 0) {
      throw new Error('No files provided for send operation');
    }

    if (peer.platform === 'localsend' || peer.platform === 'localsend-https') {
      return this._sendLocalSend(peer, files);
    }
    return this._sendNative(peer, files);
  }

  /**
   * Native LocalShare TLS Transfer
   */
  async _sendNative(peer, files) {
    const sessionId = `tx-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const abortController = new AbortController();
    this.activeTransfers.set(sessionId, { abortController, isCancelled: false });

    // Verify pinned certificate fingerprint if peer has advertised one
    if (peer.fingerprint) {
      try {
        const isVerified = await this.trustStore.verify(peer.deviceId, peer.fingerprint);
        if (!isVerified) {
          // Record or challenge if needed
        }
      } catch (err) {
        if (err instanceof TrustMismatchError) {
          this.activeTransfers.delete(sessionId);
          this.events.emit(EngineEventType.TRANSFER_FAILED, {
            sessionId,
            errorMessage: err.message
          });
          throw err;
        }
      }
    }

    const descriptors = [];
    for (let idx = 0; idx < files.length; idx++) {
      const f = files[idx];
      let sha256 = f.sha256 || '';
      // The native sender hashes while it sends, so only hash up front when it can't be used.
      const sendsNatively = NativeBridge.isAvailable() &&
        typeof NativeBridge.sendFileStream === 'function' &&
        Boolean(f.path || f.uri || f.id);
      if (!sha256 && NativeBridge.isAvailable() && !sendsNatively) {
        try {
          sha256 = await computeFileSha256(f);
        } catch (err) {
          logger.warn(`Could not compute SHA-256 for ${f.name}:`, err.message);
        }
      }
      f.sha256 = sha256;
      descriptors.push(new FileDescriptor({
        fileId: `f-${sessionId}-${idx}`,
        fileName: f.name,
        fileSize: f.size || 0,
        mimeType: f.type || 'application/octet-stream',
        sha256
      }));
    }

    const sessionReq = new SessionRequest({
      sessionId,
      sender: this.selfDevice,
      files: descriptors
    });

    // Both the LocalShare PC gateway and the Android native server speak plain
    // HTTP (Android serves cleartext on 53318). Only use HTTPS when a peer
    // explicitly advertises TLS, otherwise the handshake fails with a TLS error.
    const protocolScheme = peer.useTls === true ? 'https' : 'http';
    const baseUrl = `${protocolScheme}://${peer.address}:${peer.port}`;

    try {
      this.events.emit(EngineEventType.TRANSFER_QUEUED, {
        sessionId,
        fileName: files.length === 1 ? files[0].name : `${files.length} files`,
        totalBytes: files.reduce((acc, f) => acc + (f.size || 0), 0),
        transferredBytes: 0,
        direction: 'send',
        status: 'queued'
      });

      // 1. Handshake POST /v1/session
      // The token lets a PC that paired with this phone accept the files without a prompt.
      const handshakeRes = await fetch(`${baseUrl}/v1/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...peerAuthHeaders(peer) },
        body: JSON.stringify(sessionReq.toJSON()),
        signal: abortController.signal
      });

      if (!handshakeRes.ok) {
        throw new Error(`Session handshake rejected by peer: HTTP ${handshakeRes.status}`);
      }

      const sessionResp = await handshakeRes.json();
      if (!sessionResp.accepted) {
        throw new PairingRejectedError(sessionResp.reason || 'Peer rejected session', peer.deviceId);
      }

      const resumeOffsets = sessionResp.resume || {};
      // Receivers that advertise `stream` take each file as one continuous upload.
      const useStream = sessionResp.stream === true;

      // 2. Transfer each file
      for (let idx = 0; idx < descriptors.length; idx++) {
        const desc = descriptors[idx];
        const sourceFile = files[idx];
        const sourceUri = sourceFile.path || sourceFile.uri || sourceFile.id || '';
        if (NativeBridge.isAvailable() && sourceUri && typeof NativeBridge.sendFileStream === 'function') {
          // Native single-stream sender: 4MB buffer, sequential stream read, incremental SHA-256 & auto-commit
          await NativeBridge.sendFileStream(
            baseUrl,
            sessionId,
            desc.fileId,
            sourceUri,
            desc.fileName,
            desc.fileSize,
            resumeOffsets[desc.fileId] || 0,
            4 * 1024 * 1024,
            useStream
          );
        } else {
          await this._uploadFileChunks(
            baseUrl,
            sessionId,
            desc,
            sourceFile,
            resumeOffsets[desc.fileId] || 0,
            abortController
          );
        }
      }

      this.activeTransfers.delete(sessionId);
      this.events.emit(EngineEventType.TRANSFER_COMPLETED, {
        sessionId,
        direction: 'send'
      });
      logger.info(`Send session ${sessionId} completed successfully`);
    } catch (err) {
      this.activeTransfers.delete(sessionId);
      if (abortController.signal.aborted) {
        throw new TransferCancelledError(sessionId);
      }
      this.events.emit(EngineEventType.TRANSFER_FAILED, {
        sessionId,
        errorMessage: err.message
      });
      throw err;
    }
  }

  async _uploadFileChunks(baseUrl, sessionId, desc, sourceFile, startOffset, abortController) {
    const totalBytes = desc.fileSize;
    let offset = startOffset;
    const chunkSize = kDefaultChunkSize;
    let lastTime = Date.now();
    let bytesSinceLast = 0;

    while (offset < totalBytes) {
      if (abortController.signal.aborted) {
        throw new TransferCancelledError(sessionId);
      }

      const end = Math.min(offset + chunkSize, totalBytes);
      const chunkBytes = end - offset;
      const headers = chunkHeaders(sessionId, desc, offset);

      const sourceUri = sourceFile.path || sourceFile.uri || sourceFile.id || '';
      if (NativeBridge.isAvailable() && sourceUri) {
        // Stream the real file slice straight from the Android URI/path in native code.
        await NativeBridge.uploadChunkFromUri(`${baseUrl}/v1/chunk`, sourceUri, offset, chunkBytes, headers);
      } else {
        // Fallback (Jest unit/integration tests, non-Android): read bytes and fetch.
        const chunkPayload = /** @type {any} */ (await readFileChunk(sourceFile, offset, chunkBytes));
        const putRes = await fetch(`${baseUrl}/v1/chunk`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(chunkBytes),
            ...headers
          },
          body: chunkPayload,
          signal: abortController.signal
        });

        if (!putRes.ok) {
          throw new Error(`Chunk upload failed at offset ${offset}: HTTP ${putRes.status}`);
        }
      }

      offset += chunkBytes;
      bytesSinceLast += chunkBytes;

      const now = Date.now();
      const elapsed = (now - lastTime) / 1000;
      let currentSpeed = 0;
      if (elapsed >= 0.5) {
        currentSpeed = Math.round(bytesSinceLast / elapsed);
        lastTime = now;
        bytesSinceLast = 0;
      }

      this.events.emit(EngineEventType.TRANSFER_PROGRESS, {
        sessionId,
        fileId: desc.fileId,
        fileName: desc.fileName,
        totalBytes,
        transferredBytes: offset,
        speed: currentSpeed,
        direction: 'send',
        status: 'in_progress'
      });
    }

    // Commit file
    const commitReq = new CommitRequest({
      sessionId,
      fileId: desc.fileId,
      sha256: desc.sha256,
      lastChunk: true
    });

    const commitRes = await fetch(`${baseUrl}/v1/file/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(commitReq.toJSON()),
      signal: abortController.signal
    });

    if (!commitRes.ok) {
      throw new Error(`File commit failed: HTTP ${commitRes.status}`);
    }

    const commitData = await commitRes.json();
    if (!commitData.verified) {
      throw new IntegrityCheckFailedError(desc.fileId, desc.sha256, 'remote_mismatch');
    }
  }

  /**
   * LocalSend v2.2 Client Transfer Protocol
   */
  async _sendLocalSend(peer, files) {
    const sessionId = `ls-tx-${Date.now()}`;
    const abortController = new AbortController();
    this.activeTransfers.set(sessionId, { abortController, isCancelled: false });

    const baseUrl = `http://${peer.address}:${peer.port || 53317}`;
    const filesMap = {};

    files.forEach((f, idx) => {
      const fileId = `ls-f-${idx}`;
      filesMap[fileId] = {
        id: fileId,
        fileName: f.name,
        size: f.size || 0,
        fileType: f.type || 'application/octet-stream',
        sha256: f.sha256 || null
      };
    });

    try {
      this.events.emit(EngineEventType.TRANSFER_QUEUED, {
        sessionId,
        fileName: files.length === 1 ? files[0].name : `${files.length} files`,
        totalBytes: files.reduce((acc, f) => acc + (f.size || 0), 0),
        transferredBytes: 0,
        direction: 'send',
        status: 'queued'
      });

      // 1. Prepare upload
      const prepareRes = await fetch(`${baseUrl}/api/localsend/v2/prepare-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          info: {
            alias: this.selfDevice.displayName,
            deviceModel: 'LocalShare Client',
            deviceType: 'mobile',
            fingerprint: this.selfDevice.fingerprint,
            port: this.selfDevice.port,
            protocol: 'https',
            download: false
          },
          files: filesMap
        }),
        signal: abortController.signal
      });

      if (!prepareRes.ok) {
        throw new Error(`LocalSend prepare-upload rejected: HTTP ${prepareRes.status}`);
      }

      const prepData = await prepareRes.json();
      const remoteSessionId = prepData.sessionId;
      const fileTokens = prepData.files || {};

      // 2. Upload each file
      for (const [fileId, fileMeta] of Object.entries(filesMap)) {
        const token = fileTokens[fileId];
        const uploadUrl = `${baseUrl}/api/localsend/v2/upload?sessionId=${remoteSessionId}&fileId=${fileId}&token=${token}`;

        const sourceFile = files.find((f) => f.name === fileMeta.fileName) || files[0];
        const bodyBytes = /** @type {any} */ (await readFileChunk(sourceFile, 0, fileMeta.size));

        const uploadRes = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(fileMeta.size)
          },
          body: bodyBytes,
          signal: abortController.signal
        });

        if (!uploadRes.ok) {
          throw new Error(`LocalSend upload failed for ${fileMeta.fileName}: HTTP ${uploadRes.status}`);
        }
      }

      this.activeTransfers.delete(sessionId);
      this.events.emit(EngineEventType.TRANSFER_COMPLETED, {
        sessionId,
        direction: 'send'
      });
    } catch (err) {
      this.activeTransfers.delete(sessionId);
      if (abortController.signal.aborted) {
        throw new TransferCancelledError(sessionId);
      }
      this.events.emit(EngineEventType.TRANSFER_FAILED, {
        sessionId,
        errorMessage: err.message
      });
      throw err;
    }
  }
}

