/**
 * Offline phone-to-phone transfers over Google Nearby Connections.
 *
 * The native NearbyModule only moves bytes. This controller owns the session model,
 * so a Nearby transfer raises the same engine events as a LAN one:
 *   TRANSFER_QUEUED / TRANSFER_PROGRESS / TRANSFER_COMPLETED / TRANSFER_FAILED /
 *   TRANSFER_CANCELLED and PIN_CHALLENGE_REQUESTED { mode: 'approve' } for approval.
 *
 * Security model:
 *  - Connections are accepted at the transport level on both sides; nothing is written
 *    until the receiver approves the offer. FILE payloads not bound to an approved
 *    session (via fileStart) are cancelled and their temp copy deleted.
 *  - The approval prompt shows Nearby's UKEY2 4-digit code; the sender sees the same
 *    code, so a man-in-the-middle shows up as a mismatch.
 *  - The identity in hello is a claim (no TLS certificate on this path), so Nearby
 *    transfers are never auto-accepted as "trusted"; only autoAcceptAll skips the prompt.
 *  - Every file is SHA-256 verified on the receiver before it is acknowledged.
 *
 * The transport is injected (see src/native/NearbyTransport.js) so the same state
 * machine runs against the real native module and against an in-process loopback.
 */
import { EngineEventType } from './EngineEvents';
import { FileDescriptor } from './models';
import {
  NearbyMessageType,
  encodeControl,
  decodeControl,
  encodeOfferParts,
  encodeEndpointInfo,
  decodeEndpointInfo
} from './nearbyProtocol';
import {
  PairingRejectedError,
  TransferCancelledError,
  IntegrityCheckFailedError,
  NetworkTimeoutError,
  TrustMismatchError
} from '../utils/errors';
import {
  kNearbyOfferTimeoutMs,
  kNearbyConnectTimeoutMs,
  kNearbyAckTimeoutMs
} from '../utils/protocol';
import { defaultLogger } from '../utils/logger';

const logger = defaultLogger;

/** How long a FILE payload may wait for its fileStart before it is rejected. */
const ORPHAN_PAYLOAD_GRACE_MS = 10000;
/** Idle connections are dropped so the P2P link is free for the next peer. */
const IDLE_DISCONNECT_MS = 4000;
/** Throughput is classified after this much of a file has streamed. */
const BANDWIDTH_SAMPLE_MS = 3000;
const SLOW_BYTES_PER_SEC = 512 * 1024;
const FAST_BYTES_PER_SEC = 2 * 1024 * 1024;

/**
 * Engine-facing name of the event that carries the 4-digit Nearby verification code.
 */
export const NEARBY_AUTH_EVENT = 'NEARBY_AUTH';

/**
 * A promise that can be settled from outside, with an optional timeout.
 * @param {string} label
 * @param {number} timeoutMs
 */
function createWaiter(label, timeoutMs) {
  /** @type {(value: any) => void} */
  let resolveFn = () => {};
  /** @type {(err: Error) => void} */
  let rejectFn = () => {};
  const promise = new Promise((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });
  // A waiter can be rejected (disconnect, cancel) a tick before its owner awaits it;
  // this keeps that from surfacing as an unhandled rejection. The owner still gets it.
  promise.catch((err) => logger.debug(`Nearby wait "${label}" ended:`, err && err.message));
  /** @type {any} */
  let timer = null;
  let settled = false;
  const waiter = {
    promise,
    isSettled: () => settled,
    /** @param {any} [value] */
    resolve(value) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolveFn(value);
    },
    /** @param {Error} err */
    reject(err) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      rejectFn(err);
    }
  };
  if (timeoutMs > 0) {
    timer = setTimeout(() => waiter.reject(new NetworkTimeoutError(label, timeoutMs)), timeoutMs);
  }
  return waiter;
}

/**
 * @param {Array<object>} files
 * @returns {number}
 */
function sumBytes(files) {
  return files.reduce((acc, f) => acc + (Number(f.fileSize || f.size) || 0), 0);
}

export class NearbyController {
  /**
   * @param {object} options
   * @param {import('./EngineEvents').EngineEventEmitter} options.events
   * @param {import('./pairing').PairingEngine} options.pairing
   * @param {import('./trustStore').TrustStore} options.trustStore
   * @param {object} options.selfDevice - Live DeviceInfo of this phone.
   * @param {any} options.transport - Native (or loopback) Nearby transport.
   * @param {(peer: object) => void} [options.onPeerSeen]
   * @param {(endpointId: string, deviceId: string) => void} [options.onPeerGone]
   * @param {(endpointId: string, quality: string) => void} [options.onPeerBandwidth]
   */
  constructor({ events, pairing, trustStore, selfDevice, transport, onPeerSeen, onPeerGone, onPeerBandwidth }) {
    this.events = events;
    this.pairing = pairing;
    this.trustStore = trustStore;
    this.selfDevice = selfDevice;
    this.transport = transport;
    this.onPeerSeen = onPeerSeen || (() => {});
    this.onPeerGone = onPeerGone || (() => {});
    this.onPeerBandwidth = onPeerBandwidth || (() => {});

    this.supported = false;
    this.unsupportedReason = '';
    this.active = false;
    /** @type {null | (() => void)} */
    this.unsubscribe = null;

    /** @type {Map<string, any>} endpointId -> endpoint state */
    this.endpoints = new Map();
    /** @type {Map<string, any>} sessionId -> outgoing session */
    this.outgoing = new Map();
    /** @type {Map<string, any>} payloadId -> outgoing file record */
    this.outgoingPayloads = new Map();
    /** @type {Map<string, any>} sessionId -> incoming session */
    this.incoming = new Map();
    /** @type {Map<string, any>} payloadId -> incoming file record */
    this.incomingPayloads = new Map();
    /** @type {Set<any>} */
    this.timers = new Set();
  }

  // -----------------------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------------------

  /**
   * Ask the platform whether Nearby can run (Google Play Services present).
   * @returns {Promise<{ supported: boolean, reason: string }>}
   */
  async checkSupport() {
    const result = await this.transport.isSupported();
    this.supported = Boolean(result && result.supported);
    this.unsupportedReason = this.supported ? '' : String((result && result.reason) || 'Nearby is not available');
    return { supported: this.supported, reason: this.unsupportedReason };
  }

  /** Bind native events (idempotent). */
  attach() {
    if (this.unsubscribe) return;
    // A malformed peer message must fail that message, never the app: native events are
    // delivered outside any caller, so an exception here would reach the global handler.
    const guard = (label, fn) => (payload) => {
      try {
        fn(payload);
      } catch (err) {
        logger.error(`Nearby ${label} handler failed:`, err);
      }
    };
    this.unsubscribe = this.transport.subscribe({
      onEndpointFound: guard('endpointFound', (e) => this._onEndpointFound(e)),
      onEndpointLost: guard('endpointLost', (e) => this._onEndpointLost(e)),
      onConnectionInitiated: guard('connectionInitiated', (e) => this._onConnectionInitiated(e)),
      onConnectionResult: guard('connectionResult', (e) => this._onConnectionResult(e)),
      onDisconnected: guard('disconnected', (e) => this._onDisconnected(e)),
      onControl: guard('control', (e) => this._onControl(e)),
      onIncomingFile: guard('incomingFile', (e) => this._onIncomingFile(e)),
      onPayloadProgress: guard('payloadProgress', (e) => this._onPayloadProgress(e))
    });
  }

  /** Advertise this phone and look for other LocalShare phones. */
  async startDiscovery() {
    if (!this.supported) return;
    this.attach();
    await this.transport.startAdvertising(this._endpointInfo());
    await this.transport.startDiscovery();
    this.active = true;
  }

  /** Stop advertising/discovery; live connections and transfers keep running. */
  async stopDiscovery() {
    if (!this.active) return;
    this.active = false;
    await this.transport.stopAdvertising();
    await this.transport.stopDiscovery();
  }

  /** Tear everything down: sessions fail, connections close, events unbind. */
  async stop() {
    const reason = new Error('Offline sharing was turned off');
    for (const session of Array.from(this.outgoing.values())) {
      this._rejectAll(session, reason);
    }
    for (const session of Array.from(this.incoming.values())) {
      this._failIncoming(session, reason.message);
    }
    for (const ep of this.endpoints.values()) {
      if (ep.connectWaiter) ep.connectWaiter.reject(reason);
    }
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.active = false;
    if (this.supported) {
      await this.transport.stopAll();
    }
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.endpoints.clear();
    this.outgoingPayloads.clear();
    this.incomingPayloads.clear();
  }

  /**
   * True when this controller owns the given transfer session.
   * @param {string} sessionId
   */
  ownsSession(sessionId) {
    return this.outgoing.has(sessionId) || this.incoming.has(sessionId);
  }

  /**
   * True while an endpoint is still known (discovered or connected).
   * @param {string} endpointId
   */
  hasEndpoint(endpointId) {
    return Boolean(endpointId) && this.endpoints.has(endpointId);
  }

  // -----------------------------------------------------------------------------------
  // Sending
  // -----------------------------------------------------------------------------------

  /**
   * Send files to a Nearby peer. Resolves when every file is verified by the receiver.
   * @param {object} peer - Peer with an endpointId.
   * @param {Array<object>} files - Staged files ({ name, size, type, path|uri|id, sha256? }).
   */
  async send(peer, files) {
    if (!peer || !peer.endpointId) {
      throw new Error('This device is not reachable over Nearby');
    }
    if (!files || files.length === 0) {
      throw new Error('No files provided for send operation');
    }
    const endpointId = peer.endpointId;
    const sessionId = `nb-tx-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const session = {
      sessionId,
      endpointId,
      direction: 'send',
      cancelledBy: '',
      waiters: new Set(),
      answerWaiter: null,
      /** @type {Map<string, any>} */
      ackWaiters: new Map(),
      currentPayloadId: ''
    };
    this.outgoing.set(sessionId, session);

    this.events.emit(EngineEventType.TRANSFER_QUEUED, {
      sessionId,
      fileName: files.length === 1 ? files[0].name : `${files.length} files`,
      totalBytes: files.reduce((acc, f) => acc + (f.size || 0), 0),
      transferredBytes: 0,
      direction: 'send',
      status: 'queued'
    });

    try {
      const ep = await this._ensureConnected(endpointId);
      this._throwIfCancelled(session);

      if (ep.remote.fingerprint) {
        try {
          await this.trustStore.verify(ep.remote.deviceId, ep.remote.fingerprint);
        } catch (err) {
          if (err instanceof TrustMismatchError) throw err;
          logger.warn('Nearby trust lookup failed:', err.message);
        }
      }

      const descriptors = [];
      for (let idx = 0; idx < files.length; idx++) {
        const f = files[idx];
        const source = f.path || f.uri || f.id || '';
        if (!source) throw new Error(`Missing local file reference for ${f.name}`);
        let sha256 = f.sha256 || '';
        if (!sha256) {
          const hashed = await this.transport.hashFile(source);
          sha256 = hashed && hashed.sha256 ? String(hashed.sha256) : '';
        }
        if (!sha256) throw new Error(`Could not compute SHA-256 for ${f.name}`);
        this._throwIfCancelled(session);
        descriptors.push(new FileDescriptor({
          fileId: `f-${sessionId}-${idx}`,
          fileName: f.name,
          fileSize: f.size || 0,
          mimeType: f.type || 'application/octet-stream',
          sha256
        }));
      }

      session.answerWaiter = this._wait(session, 'nearby_offer_answer', kNearbyOfferTimeoutMs);
      for (const part of encodeOfferParts(sessionId, descriptors)) {
        await this.transport.sendControl(endpointId, part);
      }
      const answer = await session.answerWaiter.promise;
      if (!answer.accepted) {
        throw new PairingRejectedError(answer.reason || 'Peer declined the transfer', ep.remote.deviceId);
      }

      for (let idx = 0; idx < descriptors.length; idx++) {
        this._throwIfCancelled(session);
        const desc = descriptors[idx];
        const source = files[idx].path || files[idx].uri || files[idx].id;
        await this._sendOneFile(session, desc, source);
      }

      this.events.emit(EngineEventType.TRANSFER_COMPLETED, { sessionId, direction: 'send' });
      logger.info(`Nearby send session ${sessionId} completed`);
    } catch (err) {
      if (session.cancelledBy) {
        throw new TransferCancelledError(sessionId, session.cancelledBy);
      }
      this._rejectAll(session, err);
      this.events.emit(EngineEventType.TRANSFER_FAILED, {
        sessionId,
        errorMessage: err.message,
        direction: 'send'
      });
      throw err;
    } finally {
      this.outgoing.delete(sessionId);
      for (const [payloadId, record] of this.outgoingPayloads.entries()) {
        if (record.sessionId === sessionId) this.outgoingPayloads.delete(payloadId);
      }
      this._scheduleIdleDisconnect(endpointId);
    }
  }

  /**
   * @param {any} session
   * @param {FileDescriptor} desc
   * @param {string} source
   */
  async _sendOneFile(session, desc, source) {
    const prepared = await this.transport.prepareFile(source);
    const payloadId = String(prepared.payloadId);
    const transferWaiter = this._wait(session, `nearby_file_${desc.fileId}`, 0);
    this.outgoingPayloads.set(payloadId, {
      sessionId: session.sessionId,
      endpointId: session.endpointId,
      fileId: desc.fileId,
      fileName: desc.fileName,
      totalBytes: desc.fileSize,
      startedAt: Date.now(),
      bandwidthReported: false,
      waiter: transferWaiter
    });
    session.currentPayloadId = payloadId;

    // Announce before the bytes flow; the receiver tolerates either arrival order.
    await this.transport.sendControl(session.endpointId, encodeControl({
      t: NearbyMessageType.FILE_START,
      sessionId: session.sessionId,
      fileId: desc.fileId,
      payloadId
    }));
    await this.transport.sendPreparedFile(session.endpointId, payloadId);
    await transferWaiter.promise;
    session.currentPayloadId = '';

    const ackWaiter = this._wait(session, `nearby_ack_${desc.fileId}`, kNearbyAckTimeoutMs);
    session.ackWaiters.set(desc.fileId, ackWaiter);
    await this.transport.sendControl(session.endpointId, encodeControl({
      t: NearbyMessageType.FILE_DONE,
      sessionId: session.sessionId,
      fileId: desc.fileId,
      sha256: desc.sha256
    }));
    const ack = await ackWaiter.promise;
    session.ackWaiters.delete(desc.fileId);
    if (!ack.ok) {
      throw new IntegrityCheckFailedError(desc.fileId, desc.sha256, ack.reason || 'remote_mismatch');
    }
  }

  /**
   * Connect (or reuse the connection) and wait for the peer's hello.
   * @param {string} endpointId
   */
  async _ensureConnected(endpointId) {
    const ep = this.endpoints.get(endpointId);
    if (!ep) throw new Error('That device is no longer in range');
    if (ep.state === 'connected' && ep.remote) return ep;
    if (ep.connectWaiter) return ep.connectWaiter.promise;

    const waiter = createWaiter('nearby_connect', kNearbyConnectTimeoutMs);
    ep.connectWaiter = waiter;
    waiter.promise.then(
      () => { if (ep.connectWaiter === waiter) ep.connectWaiter = null; },
      (err) => {
        if (ep.connectWaiter === waiter) ep.connectWaiter = null;
        if (err instanceof NetworkTimeoutError && ep.state !== 'connected') {
          ep.state = 'discovered';
          this._run(this.transport.disconnect(endpointId), 'disconnect after connect timeout');
        }
      }
    );
    if (ep.state !== 'connected') {
      ep.state = 'connecting';
      try {
        await this.transport.requestConnection(endpointId, this._endpointInfo());
      } catch (err) {
        ep.state = 'discovered';
        waiter.reject(err);
      }
    }
    return waiter.promise;
  }

  // -----------------------------------------------------------------------------------
  // Receiving (public)
  // -----------------------------------------------------------------------------------

  /**
   * Resolve the approval prompt of an incoming Nearby offer.
   * @param {string} sessionId
   * @param {boolean} accepted
   * @returns {boolean} true when the session belonged to Nearby.
   */
  respondToOffer(sessionId, accepted) {
    const session = this.incoming.get(sessionId);
    if (!session) return false;
    if (!session.decided) {
      this._decideOffer(session, Boolean(accepted), accepted ? '' : 'declined');
    }
    return true;
  }

  /**
   * Cancel a Nearby session from this side (sender or receiver).
   * @param {string} sessionId
   * @returns {boolean} true when the session belonged to Nearby.
   */
  cancelSession(sessionId) {
    const out = this.outgoing.get(sessionId);
    if (out) {
      if (out.cancelledBy) return true;
      out.cancelledBy = 'local';
      this._run(this._sendControl(out.endpointId, { t: NearbyMessageType.CANCEL, sessionId, reason: 'cancelled' }), 'cancel');
      if (out.currentPayloadId) {
        this._run(this.transport.cancelPayload(out.currentPayloadId), 'cancel payload');
      }
      this._rejectAll(out, new TransferCancelledError(sessionId, 'local'));
      this.events.emit(EngineEventType.TRANSFER_CANCELLED, { sessionId, direction: 'send' });
      return true;
    }
    const inc = this.incoming.get(sessionId);
    if (inc) {
      this._run(this._sendControl(inc.endpointId, { t: NearbyMessageType.CANCEL, sessionId, reason: 'cancelled' }), 'cancel');
      this._cancelIncoming(inc);
      return true;
    }
    return false;
  }

  // -----------------------------------------------------------------------------------
  // Native event handlers
  // -----------------------------------------------------------------------------------

  _onEndpointFound({ endpointId, endpointName, endpointInfo }) {
    if (!endpointId) return;
    const info = decodeEndpointInfo(endpointInfo, endpointName, endpointId);
    if (info.deviceId === this.selfDevice.deviceId) return;
    const ep = this._upsertEndpoint(endpointId, info);
    ep.discovered = true;
    this.onPeerSeen(this._peerFor(ep));
  }

  _onEndpointLost({ endpointId }) {
    const ep = this.endpoints.get(endpointId);
    if (!ep) return;
    ep.discovered = false;
    if (ep.state === 'discovered') {
      this.endpoints.delete(endpointId);
      this.onPeerGone(endpointId, ep.deviceId);
    }
  }

  _onConnectionInitiated({ endpointId, endpointName, endpointInfo, authDigits, isIncoming }) {
    const ep = this._upsertEndpoint(endpointId, decodeEndpointInfo(endpointInfo, endpointName, endpointId));
    ep.authDigits = String(authDigits || '');
    ep.isIncoming = Boolean(isIncoming);
    if (ep.state !== 'connected') ep.state = 'connecting';
    this.events.emit(NEARBY_AUTH_EVENT, {
      endpointId,
      deviceId: ep.deviceId,
      displayName: ep.displayName,
      authDigits: ep.authDigits,
      isIncoming: ep.isIncoming
    });
    // Accepting the link writes nothing; the offer approval is the user's gate.
    Promise.resolve(this.transport.acceptConnection(endpointId)).catch((err) => {
      logger.warn('Nearby acceptConnection failed:', err.message);
      if (ep.connectWaiter) ep.connectWaiter.reject(err);
    });
  }

  _onConnectionResult({ endpointId, connected, statusMessage }) {
    const ep = this.endpoints.get(endpointId);
    if (!ep) return;
    if (connected) {
      // Keep a hello that already arrived: payloads can be delivered as soon as the
      // link was accepted, slightly before this callback fires.
      ep.state = 'connected';
      this._run(this._sendControl(endpointId, this._hello()), 'hello');
      return;
    }
    ep.state = 'discovered';
    if (ep.connectWaiter) {
      ep.connectWaiter.reject(new Error(`Could not connect over Nearby: ${statusMessage || 'rejected'}`));
    }
  }

  _onDisconnected({ endpointId }) {
    const ep = this.endpoints.get(endpointId);
    const name = ep ? ep.displayName : 'the other device';
    const lost = new Error(`Nearby connection to ${name} was lost`);
    if (ep) {
      ep.state = 'discovered';
      ep.remote = null;
      if (ep.connectWaiter) ep.connectWaiter.reject(lost);
    }
    for (const session of Array.from(this.outgoing.values())) {
      if (session.endpointId === endpointId) this._rejectAll(session, lost);
    }
    for (const session of Array.from(this.incoming.values())) {
      if (session.endpointId === endpointId) this._failIncoming(session, lost.message);
    }
    for (const [payloadId, record] of this.incomingPayloads.entries()) {
      if (record.endpointId === endpointId) {
        this._clearOrphanTimer(record);
        this.incomingPayloads.delete(payloadId);
      }
    }
    if (ep && !ep.discovered) {
      this.endpoints.delete(endpointId);
      this.onPeerGone(endpointId, ep.deviceId);
    }
  }

  _onControl({ endpointId, json }) {
    let msg;
    try {
      msg = decodeControl(json);
    } catch (err) {
      logger.warn(`Dropping invalid Nearby control message from ${endpointId}:`, err.message);
      return;
    }
    const ep = this.endpoints.get(endpointId);
    // 'connecting' is allowed: the link is accepted (payload callback bound) before the result arrives.
    if (!ep || ep.state === 'discovered') {
      logger.warn(`Ignoring Nearby "${msg.t}" from unconnected endpoint ${endpointId}`);
      return;
    }
    switch (msg.t) {
      case NearbyMessageType.HELLO:
        this._handleHello(ep, msg);
        break;
      case NearbyMessageType.OFFER:
        this._handleOffer(ep, msg);
        break;
      case NearbyMessageType.ANSWER: {
        const session = this._outgoingFor(ep, msg.sessionId);
        if (session && session.answerWaiter) session.answerWaiter.resolve(msg);
        break;
      }
      case NearbyMessageType.FILE_START:
        this._handleFileStart(ep, msg);
        break;
      case NearbyMessageType.FILE_DONE:
        this._handleFileDone(ep, msg);
        break;
      case NearbyMessageType.ACK: {
        const session = this._outgoingFor(ep, msg.sessionId);
        const waiter = session ? session.ackWaiters.get(msg.fileId) : null;
        if (waiter) waiter.resolve(msg);
        break;
      }
      case NearbyMessageType.CANCEL:
        this._handleRemoteCancel(ep, msg);
        break;
      default:
        logger.warn(`Unhandled Nearby message type ${msg.t}`);
    }
  }

  _onIncomingFile({ endpointId, payloadId }) {
    const id = String(payloadId);
    const existing = this.incomingPayloads.get(id);
    if (existing) {
      if (existing.endpointId !== endpointId) {
        logger.warn(`Nearby payload ${id} arrived from an unexpected endpoint; cancelling`);
        this._run(this.transport.cancelPayload(id), 'cancel foreign payload');
      }
      return;
    }
    // Bytes before their fileStart: hold briefly, then reject if nothing claims them.
    const record = { payloadId: id, endpointId, orphan: true, complete: false };
    this.incomingPayloads.set(id, record);
    record.orphanTimer = this._later(() => {
      if (record.orphan && this.incomingPayloads.get(id) === record) {
        logger.warn(`Nearby payload ${id} was never announced; discarding it`);
        this.incomingPayloads.delete(id);
        this._run(this.transport.cancelPayload(id), 'cancel orphan payload');
      }
    }, ORPHAN_PAYLOAD_GRACE_MS);
  }

  _onPayloadProgress({ payloadId, bytesTransferred, totalBytes, speed, status, direction }) {
    const id = String(payloadId);
    if (direction === 'send') {
      const out = this.outgoingPayloads.get(id);
      if (!out) return;
      if (status === 'in_progress' || status === 'success') {
        this.events.emit(EngineEventType.TRANSFER_PROGRESS, {
          sessionId: out.sessionId,
          fileId: out.fileId,
          fileName: out.fileName,
          totalBytes: totalBytes || out.totalBytes,
          transferredBytes: bytesTransferred,
          speed: speed || 0,
          direction: 'send',
          status: 'in_progress'
        });
        this._sampleBandwidth(out, bytesTransferred);
      }
      if (status === 'success') {
        this.outgoingPayloads.delete(id);
        out.waiter.resolve();
      } else if (status === 'failure') {
        this.outgoingPayloads.delete(id);
        out.waiter.reject(new Error(`Nearby could not deliver ${out.fileName}`));
      } else if (status === 'canceled') {
        this.outgoingPayloads.delete(id);
        const session = this.outgoing.get(out.sessionId);
        out.waiter.reject(new TransferCancelledError(out.sessionId, (session && session.cancelledBy) || 'peer'));
      }
      return;
    }

    const record = this.incomingPayloads.get(id);
    if (!record) return;
    if (record.orphan) {
      if (status === 'success') record.complete = true;
      else if (status === 'failure' || status === 'canceled') {
        this._clearOrphanTimer(record);
        this.incomingPayloads.delete(id);
      }
      return;
    }
    const session = this.incoming.get(record.sessionId);
    if (status === 'in_progress' || status === 'success') {
      this.events.emit(EngineEventType.TRANSFER_PROGRESS, {
        sessionId: record.sessionId,
        fileId: record.fileId,
        fileName: record.fileName,
        totalBytes: totalBytes || record.fileSize,
        transferredBytes: bytesTransferred,
        speed: speed || 0,
        direction: 'receive',
        status: 'in_progress'
      });
    }
    if (status === 'success') {
      record.complete = true;
      this._run(this._maybeSave(record), 'save received file');
    } else if (status === 'failure' || status === 'canceled') {
      this.incomingPayloads.delete(id);
      if (session && !session.cancelled) {
        this._failIncoming(session, `Nearby transfer of ${record.fileName} ${status === 'canceled' ? 'was cancelled' : 'failed'}`);
      }
    }
  }

  // -----------------------------------------------------------------------------------
  // Protocol handlers
  // -----------------------------------------------------------------------------------

  _handleHello(ep, msg) {
    ep.remote = msg;
    ep.deviceId = msg.deviceId;
    ep.displayName = msg.displayName;
    ep.platform = msg.platform;
    this.onPeerSeen({ ...this._peerFor(ep), fingerprint: msg.fingerprint });
    if (ep.connectWaiter) ep.connectWaiter.resolve(ep);
  }

  _handleOffer(ep, msg) {
    if (!ep.remote) {
      this._run(this._sendControl(ep.endpointId, {
        t: NearbyMessageType.ANSWER,
        sessionId: msg.sessionId,
        accepted: false,
        reason: 'hello_required'
      }), 'answer');
      return;
    }
    let session = this.incoming.get(msg.sessionId);
    if (session && session.endpointId !== ep.endpointId) {
      logger.warn(`Nearby offer ${msg.sessionId} reused by another endpoint; ignoring`);
      return;
    }
    if (!session) {
      session = {
        sessionId: msg.sessionId,
        endpointId: ep.endpointId,
        direction: 'receive',
        sender: { deviceId: ep.remote.deviceId, displayName: ep.remote.displayName },
        files: [],
        parts: msg.parts,
        partsSeen: new Set(),
        decided: false,
        accepted: false,
        finished: false,
        cancelled: false,
        /** @type {Map<string, string>} */
        doneShas: new Map(),
        /** @type {Map<string, string>} */
        payloadByFile: new Map(),
        completed: new Set(),
        timer: null
      };
      this.incoming.set(msg.sessionId, session);
    }
    if (session.decided || session.partsSeen.has(msg.part) || msg.parts !== session.parts) return;
    session.partsSeen.add(msg.part);
    session.files.push(...msg.files);
    if (session.partsSeen.size < session.parts) return;

    const ids = new Set(session.files.map((f) => f.fileId));
    if (ids.size !== session.files.length) {
      this._decideOffer(session, false, 'invalid_offer');
      return;
    }
    if (this.pairing.settings.autoAcceptAll) {
      this._decideOffer(session, true, '');
      return;
    }
    session.timer = this._later(() => this._decideOffer(session, false, 'timeout'), kNearbyOfferTimeoutMs);
    this.events.emit(EngineEventType.PIN_CHALLENGE_REQUESTED, {
      mode: 'approve',
      transport: 'nearby',
      sessionId: session.sessionId,
      deviceId: session.sender.deviceId,
      displayName: session.sender.displayName,
      authDigits: ep.authDigits,
      files: session.files,
      totalBytes: sumBytes(session.files)
    });
  }

  _decideOffer(session, accepted, reason) {
    if (session.decided) return;
    session.decided = true;
    session.accepted = accepted;
    if (session.timer) {
      clearTimeout(session.timer);
      this.timers.delete(session.timer);
      session.timer = null;
    }
    this._run(this._sendControl(session.endpointId, {
      t: NearbyMessageType.ANSWER,
      sessionId: session.sessionId,
      accepted,
      reason
    }), 'answer');
    if (accepted) {
      this.events.emit(EngineEventType.TRANSFER_QUEUED, {
        sessionId: session.sessionId,
        fileName: session.files.length === 1 ? session.files[0].fileName : `${session.files.length} files`,
        totalBytes: sumBytes(session.files),
        transferredBytes: 0,
        direction: 'receive',
        status: 'in_progress'
      });
      return;
    }
    this.incoming.delete(session.sessionId);
    this._discardSessionPayloads(session);
  }

  _handleFileStart(ep, msg) {
    const session = this.incoming.get(msg.sessionId);
    const desc = session ? session.files.find((f) => f.fileId === msg.fileId) : null;
    const allowed = session && session.endpointId === ep.endpointId && session.accepted &&
      !session.finished && !session.cancelled && desc;
    let record = this.incomingPayloads.get(msg.payloadId);
    if (!allowed || (record && record.endpointId !== ep.endpointId)) {
      logger.warn(`Rejecting Nearby payload ${msg.payloadId}: not part of an approved transfer`);
      if (record && record.endpointId === ep.endpointId) {
        this._clearOrphanTimer(record);
        this.incomingPayloads.delete(msg.payloadId);
      }
      this._run(this.transport.cancelPayload(msg.payloadId), 'cancel unapproved payload');
      return;
    }
    if (!record) {
      record = { payloadId: msg.payloadId, endpointId: ep.endpointId, complete: false };
      this.incomingPayloads.set(msg.payloadId, record);
    }
    this._clearOrphanTimer(record);
    record.orphan = false;
    record.sessionId = session.sessionId;
    record.fileId = desc.fileId;
    record.fileName = desc.fileName;
    record.fileSize = desc.fileSize;
    record.expectedSha = desc.sha256;
    session.payloadByFile.set(desc.fileId, msg.payloadId);
    this._run(this._maybeSave(record), 'save received file');
  }

  _handleFileDone(ep, msg) {
    const session = this.incoming.get(msg.sessionId);
    if (!session || session.endpointId !== ep.endpointId || !session.accepted) return;
    session.doneShas.set(msg.fileId, msg.sha256);
    const payloadId = session.payloadByFile.get(msg.fileId);
    const record = payloadId ? this.incomingPayloads.get(payloadId) : null;
    if (record) this._run(this._maybeVerify(session, record), 'verify received file');
  }

  _handleRemoteCancel(ep, msg) {
    const inc = this.incoming.get(msg.sessionId);
    if (inc && inc.endpointId === ep.endpointId) {
      this._cancelIncoming(inc);
      return;
    }
    const out = this._outgoingFor(ep, msg.sessionId);
    if (out && !out.cancelledBy) {
      out.cancelledBy = 'peer';
      if (out.currentPayloadId) {
        this._run(this.transport.cancelPayload(out.currentPayloadId), 'cancel payload');
      }
      this._rejectAll(out, new TransferCancelledError(out.sessionId, 'peer'));
      this.events.emit(EngineEventType.TRANSFER_CANCELLED, { sessionId: out.sessionId, direction: 'send' });
    }
  }

  async _maybeSave(record) {
    if (!record.complete || record.orphan || record.saving || record.saved) return;
    record.saving = true;
    const session = this.incoming.get(record.sessionId);
    if (!session || session.cancelled || session.finished) {
      this.incomingPayloads.delete(record.payloadId);
      await this.transport.discardReceivedFile(record.payloadId);
      return;
    }
    try {
      record.saved = await this.transport.saveReceivedFile(record.payloadId, record.fileName);
    } catch (err) {
      this.incomingPayloads.delete(record.payloadId);
      await this._sendControl(session.endpointId, {
        t: NearbyMessageType.ACK,
        sessionId: session.sessionId,
        fileId: record.fileId,
        ok: false,
        reason: 'save_failed'
      });
      this._failIncoming(session, `Could not save ${record.fileName}: ${err.message}`);
      return;
    }
    await this._maybeVerify(session, record);
  }

  async _maybeVerify(session, record) {
    if (!record.saved || record.verified || !session.doneShas.has(record.fileId)) return;
    record.verified = true;
    this.incomingPayloads.delete(record.payloadId);
    const expected = String(session.doneShas.get(record.fileId) || record.expectedSha || '').toLowerCase();
    const actual = String(record.saved.sha256 || '').toLowerCase();
    const saved = record.saved;

    if (!expected || expected !== actual) {
      try {
        await this.transport.deleteSavedFile(saved.savedPath);
      } catch (err) {
        logger.warn(`Could not delete corrupt Nearby file ${saved.savedPath}:`, err.message);
      }
      await this._sendControl(session.endpointId, {
        t: NearbyMessageType.ACK,
        sessionId: session.sessionId,
        fileId: record.fileId,
        ok: false,
        reason: 'hash_mismatch'
      });
      this._failIncoming(session, `Integrity check failed for ${record.fileName}`);
      return;
    }

    session.completed.add(record.fileId);
    const isLast = session.completed.size === session.files.length;
    if (isLast) {
      session.finished = true;
      this.incoming.delete(session.sessionId);
    }
    this.events.emit(EngineEventType.TRANSFER_COMPLETED, {
      sessionId: session.sessionId,
      fileId: record.fileId,
      fileName: saved.fileName || record.fileName,
      totalBytes: saved.fileSize,
      transferredBytes: saved.fileSize,
      status: 'completed',
      direction: 'receive',
      file: {
        id: record.fileId,
        name: saved.fileName || record.fileName,
        path: saved.savedPath,
        size: saved.fileSize,
        receivedAt: Date.now()
      }
    });
    await this._sendControl(session.endpointId, {
      t: NearbyMessageType.ACK,
      sessionId: session.sessionId,
      fileId: record.fileId,
      ok: true,
      reason: ''
    });
  }

  // -----------------------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------------------

  _endpointInfo() {
    return encodeEndpointInfo({
      deviceId: this.selfDevice.deviceId,
      displayName: this.selfDevice.displayName,
      platform: this.selfDevice.platform
    });
  }

  _hello() {
    return {
      t: NearbyMessageType.HELLO,
      deviceId: this.selfDevice.deviceId,
      displayName: this.selfDevice.displayName,
      fingerprint: this.selfDevice.fingerprint || '',
      platform: this.selfDevice.platform || 'android'
    };
  }

  /**
   * @param {string} endpointId
   * @param {Record<string, any>} msg
   */
  async _sendControl(endpointId, msg) {
    await this.transport.sendControl(endpointId, encodeControl(msg));
  }

  _upsertEndpoint(endpointId, info) {
    let ep = this.endpoints.get(endpointId);
    if (!ep) {
      ep = {
        endpointId,
        deviceId: info.deviceId,
        displayName: info.displayName,
        platform: info.platform,
        state: 'discovered',
        discovered: false,
        authDigits: '',
        isIncoming: false,
        remote: null,
        connectWaiter: null
      };
      this.endpoints.set(endpointId, ep);
    } else if (!ep.remote) {
      ep.deviceId = info.deviceId;
      ep.displayName = info.displayName;
      ep.platform = info.platform;
    }
    return ep;
  }

  _peerFor(ep) {
    return {
      deviceId: ep.deviceId,
      displayName: ep.displayName,
      platform: ep.platform || 'android',
      endpointId: ep.endpointId,
      transport: 'nearby',
      discoveryChannel: 'nearby'
    };
  }

  _outgoingFor(ep, sessionId) {
    const session = this.outgoing.get(sessionId);
    return session && session.endpointId === ep.endpointId ? session : null;
  }

  _wait(session, label, timeoutMs) {
    const waiter = createWaiter(label, timeoutMs);
    session.waiters.add(waiter);
    const forget = () => session.waiters.delete(waiter);
    waiter.promise.then(forget, forget);
    return waiter;
  }

  _rejectAll(session, err) {
    for (const waiter of Array.from(session.waiters)) waiter.reject(err);
    session.waiters.clear();
  }

  _throwIfCancelled(session) {
    if (session.cancelledBy) throw new TransferCancelledError(session.sessionId, session.cancelledBy);
  }

  _cancelIncoming(session) {
    if (session.cancelled || session.finished) return;
    session.cancelled = true;
    if (session.timer) clearTimeout(session.timer);
    this.incoming.delete(session.sessionId);
    this._discardSessionPayloads(session);
    this.events.emit(EngineEventType.TRANSFER_CANCELLED, { sessionId: session.sessionId, direction: 'receive' });
  }

  _failIncoming(session, message) {
    if (session.finished || session.cancelled) return;
    session.finished = true;
    if (session.timer) clearTimeout(session.timer);
    this.incoming.delete(session.sessionId);
    this._discardSessionPayloads(session);
    if (session.accepted) {
      this.events.emit(EngineEventType.TRANSFER_FAILED, {
        sessionId: session.sessionId,
        errorMessage: message,
        direction: 'receive'
      });
    }
  }

  _discardSessionPayloads(session) {
    for (const [payloadId, record] of Array.from(this.incomingPayloads.entries())) {
      if (record.sessionId === session.sessionId) {
        this.incomingPayloads.delete(payloadId);
        this._run(this.transport.cancelPayload(payloadId), 'cancel session payload');
      }
    }
  }

  _clearOrphanTimer(record) {
    if (record.orphanTimer) {
      clearTimeout(record.orphanTimer);
      this.timers.delete(record.orphanTimer);
      record.orphanTimer = null;
    }
  }

  _sampleBandwidth(out, bytesTransferred) {
    if (out.bandwidthReported) return;
    const elapsed = Date.now() - out.startedAt;
    if (elapsed < BANDWIDTH_SAMPLE_MS) return;
    out.bandwidthReported = true;
    const rate = (bytesTransferred * 1000) / elapsed;
    if (rate < SLOW_BYTES_PER_SEC) this.onPeerBandwidth(out.endpointId, 'LOW');
    else if (rate >= FAST_BYTES_PER_SEC) this.onPeerBandwidth(out.endpointId, 'HIGH');
  }

  _scheduleIdleDisconnect(endpointId) {
    this._later(() => {
      const busy = Array.from(this.outgoing.values()).some((s) => s.endpointId === endpointId) ||
        Array.from(this.incoming.values()).some((s) => s.endpointId === endpointId);
      const ep = this.endpoints.get(endpointId);
      if (busy || !ep || ep.state !== 'connected') return;
      ep.state = 'discovered';
      ep.remote = null;
      this._run(this.transport.disconnect(endpointId), 'idle disconnect');
    }, IDLE_DISCONNECT_MS);
  }

  _later(fn, ms) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, ms);
    this.timers.add(timer);
    return timer;
  }

  _run(promise, label) {
    Promise.resolve(promise).catch((err) => {
      logger.warn(`Nearby ${label} failed:`, err && err.message ? err.message : err);
    });
  }
}
