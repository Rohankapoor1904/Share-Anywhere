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
import { defaultLogger } from '../utils/logger';

const logger = defaultLogger;

export class SendController {
  /**
   * @param {object} options
   * @param {import('./EngineEvents').EngineEventEmitter} options.events
   * @param {import('./trustStore').TrustStore} options.trustStore
   * @param {import('./pairing').PairingEngine} options.pairing
   * @param {object} options.selfDevice
   */
  constructor({ events, trustStore, pairing, selfDevice }) {
    this.events = events;
    this.trustStore = trustStore;
    this.pairing = pairing;
    this.selfDevice = selfDevice;

    /** @type {Map<string, { abortController: AbortController, isCancelled: boolean }>} */
    this.activeTransfers = new Map();
  }

  /**
   * Cancel an ongoing transfer session.
   * @param {string} sessionId
   */
  cancelTransfer(sessionId) {
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
   * Send files to a peer (Native LocalShare TLS or LocalSend v2.2).
   * @param {object} peer - Target peer.
   * @param {Array<object>} files - Staged file descriptors.
   */
  async send(peer, files) {
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

    const descriptors = files.map((f, idx) => new FileDescriptor({
      fileId: `f-${sessionId}-${idx}`,
      fileName: f.name,
      fileSize: f.size || 0,
      mimeType: f.type || 'application/octet-stream',
      sha256: f.sha256 || ''
    }));

    const sessionReq = new SessionRequest({
      sessionId,
      sender: this.selfDevice,
      files: descriptors
    });

    const protocolScheme = peer.useTls === false ? 'http' : 'https';
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
      const handshakeRes = await fetch(`${baseUrl}/v1/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

      // 2. Transfer each file
      for (const desc of descriptors) {
        const sourceFile = files.find((f) => f.name === desc.fileName) || files[0];
        await this._uploadFileChunks(
          baseUrl,
          sessionId,
          desc,
          sourceFile,
          resumeOffsets[desc.fileId] || 0,
          abortController
        );
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

      // In real native/RN runtime, react-native-fs reads binary slice
      const chunkPayload = new Uint8Array(chunkBytes);

      const putRes = await fetch(`${baseUrl}/v1/chunk`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(chunkBytes),
          [kHeaderSessionId]: sessionId,
          'x-file-id': desc.fileId,
          'x-offset': String(offset)
        },
        body: chunkPayload,
        signal: abortController.signal
      });

      if (!putRes.ok) {
        throw new Error(`Chunk upload failed at offset ${offset}: HTTP ${putRes.status}`);
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

        // In real RN runtime, streaming file read; in node test, empty buffer or data
        const bodyBytes = new Uint8Array(fileMeta.size);

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
