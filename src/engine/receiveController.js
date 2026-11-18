import { EngineEventType } from './EngineEvents';
import { defaultLogger } from '../utils/logger';

const logger = defaultLogger;

export class ReceiveController {
  /**
   * @param {object} options
   * @param {import('./EngineEvents').EngineEventEmitter} options.events
   * @param {import('./trustStore').TrustStore} options.trustStore
   * @param {import('./pairing').PairingEngine} options.pairing
   */
  constructor({ events, trustStore, pairing }) {
    this.events = events;
    this.trustStore = trustStore;
    this.pairing = pairing;

    /** @type {Map<string, object>} */
    this.incomingSessions = new Map();
  }

  /**
   * Evaluate incoming session request from remote peer.
   * @param {object} sessionReq - SessionRequest
   * @returns {Promise<{ accepted: boolean, reason?: string }>}
   */
  async handleIncomingSession(sessionReq) {
    const sender = sessionReq.sender;
    const result = await this.pairing.evaluate(
      sender.deviceId,
      sender.fingerprint,
      sessionReq.pin
    );

    if (result.action === 'accept') {
      this.incomingSessions.set(sessionReq.sessionId, sessionReq);
      this.events.emit(EngineEventType.TRANSFER_QUEUED, {
        sessionId: sessionReq.sessionId,
        fileName: sessionReq.files && sessionReq.files.length === 1
          ? sessionReq.files[0].fileName
          : `${sessionReq.files ? sessionReq.files.length : 0} files`,
        totalBytes: (sessionReq.files || []).reduce((acc, f) => acc + (f.fileSize || 0), 0),
        transferredBytes: 0,
        direction: 'receive',
        status: 'in_progress'
      });
      return { accepted: true };
    }

    if (result.action === 'challenge') {
      // PIN challenge initiated
      return { accepted: false, reason: 'pin_required' };
    }

    return { accepted: false, reason: result.reason || 'rejected' };
  }

  /**
   * Called by NativeBridge or Node Gateway when chunk progress occurs.
   */
  handleChunkProgress(payload) {
    const { sessionId, fileId, transferredBytes, totalBytes, speed } = payload;
    this.events.emit(EngineEventType.TRANSFER_PROGRESS, {
      sessionId,
      fileId,
      transferredBytes,
      totalBytes,
      speed,
      direction: 'receive',
      status: 'in_progress'
    });
  }

  /**
   * Called when a file finishes receiving and passes hash verification.
   */
  handleFileReceived(payload) {
    const { sessionId, fileId, fileName, savedPath, fileSize } = payload;
    logger.info(`File ${fileName} successfully received and verified at ${savedPath}`);
    this.events.emit(EngineEventType.TRANSFER_COMPLETED, {
      sessionId,
      fileId,
      direction: 'receive',
      file: {
        id: fileId,
        name: fileName,
        path: savedPath,
        size: fileSize,
        receivedAt: Date.now()
      }
    });
  }

  /**
   * Called when an incoming transfer fails or is cancelled.
   */
  handleTransferFailed(sessionId, errorMessage) {
    this.incomingSessions.delete(sessionId);
    this.events.emit(EngineEventType.TRANSFER_FAILED, {
      sessionId,
      errorMessage,
      direction: 'receive'
    });
  }
}

