import { EngineEventType } from './EngineEvents';
import { SessionRequest } from './models';
import { NativeBridge } from '../native/NativeBridge';
import { defaultLogger } from '../utils/logger';

const logger = defaultLogger;

/**
 * Normalize an incoming session payload into a SessionRequest.
 * The Android native server emits `{ sessionId, rawJson }`, while the PC
 * gateway emits the already-parsed SessionRequest object. Both are accepted.
 * @param {object} raw
 * @returns {SessionRequest|null}
 */
function normalizeIncomingSession(raw) {
  if (!raw) return null;
  let payload = raw;
  if (raw.rawJson) {
    try {
      payload = JSON.parse(raw.rawJson);
    } catch (err) {
      logger.error('Failed to parse incoming session JSON:', err);
      return null;
    }
  }
  if (!payload || typeof payload !== 'object') return null;
  return SessionRequest.fromJSON(payload);
}

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
   * @param {object} rawSessionReq - Parsed SessionRequest (PC) or { sessionId, rawJson } (Android).
   * @returns {Promise<{ accepted: boolean, reason?: string }>}
   */
  async handleIncomingSession(rawSessionReq) {
    const sessionReq = normalizeIncomingSession(rawSessionReq);
    if (!sessionReq || !sessionReq.sender || !sessionReq.sender.deviceId) {
      logger.warn('Invalid incoming session payload (missing sender device id):', rawSessionReq);
      return { accepted: false, reason: 'invalid_payload' };
    }

    const sender = sessionReq.sender;
    const result = await this.pairing.evaluate(
      sender.deviceId,
      sender.fingerprint,
      sessionReq.pin
    );

    // User approval gate: the native server is blocking on respondToSession().
    // Auto-approve only for already-accepted/auto-accept; otherwise prompt the user.
    if (NativeBridge.isAvailable() && sessionReq.sessionId) {
      if (this.pairing.settings.autoAcceptAll || result.action === 'accept') {
        this._respondToNative(sessionReq.sessionId, true);
      } else {
        this.events.emit(EngineEventType.PIN_CHALLENGE_REQUESTED, {
          mode: 'approve',
          sessionId: sessionReq.sessionId,
          deviceId: sender.deviceId,
          displayName: sender.displayName,
          files: sessionReq.files || [],
          totalBytes: (sessionReq.files || []).reduce((acc, f) => acc + (f.fileSize || 0), 0)
        });
      }
    }

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
   * Resolve a pending native approval prompt (Android foreground HTTP handler).
   * @param {string} sessionId
   * @param {boolean} accepted
   */
  respondToSession(sessionId, accepted) {
    this._respondToNative(sessionId, accepted);
  }

  _respondToNative(sessionId, accepted) {
    try {
      NativeBridge.respondToSession(sessionId, accepted);
    } catch (err) {
      logger.warn(`Failed to respond to native session ${sessionId}:`, err.message);
    }
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

