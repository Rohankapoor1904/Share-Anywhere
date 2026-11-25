/**
 * Phone side of "Connect a PC without Wi-Fi": BLE bootstrap + Local-Only Hotspot.
 *
 * Phases (emitted as OFFLINE_PC_STATE with getState()):
 *   idle → advertising → confirm (6-digit code, PC name) → starting_hotspot → ready
 *        → connected (the PC joined the hotspot and opened the live link) → idle
 *   manual: hotspot details shown on screen for a PC without Bluetooth
 *   failed: { error }
 *
 * Every PC must be confirmed on the phone with the code. The PC identity in its hello is
 * self-declared (device id and fingerprint are public), so a "trusted" PC is never
 * auto-approved here: approving hands out network access.
 *
 * The native transport is injected (src/native/PcBootstrapTransport.js on Android).
 */
import { defaultLogger } from '../utils/logger';

const logger = defaultLogger;

export const OFFLINE_PC_STATE_EVENT = 'OFFLINE_PC_STATE';

const DEFAULT_CONFIRM_TIMEOUT_MS = 120000;
const DEFAULT_IDLE_TIMEOUT_MS = 300000;

export class PcBootstrapController {
  /**
   * @param {object} options
   * @param {import('./EngineEvents').EngineEventEmitter} options.events
   * @param {import('./trustStore').TrustStore} options.trustStore
   * @param {object} options.selfDevice
   * @param {any} options.transport
   * @param {number} [options.confirmTimeoutMs]
   * @param {number} [options.idleTimeoutMs] - Hotspot is released if no PC connects in time.
   */
  constructor({ events, trustStore, selfDevice, transport, confirmTimeoutMs, idleTimeoutMs }) {
    this.events = events;
    this.trustStore = trustStore;
    this.selfDevice = selfDevice;
    this.transport = transport;
    this.confirmTimeoutMs = confirmTimeoutMs || DEFAULT_CONFIRM_TIMEOUT_MS;
    this.idleTimeoutMs = idleTimeoutMs || DEFAULT_IDLE_TIMEOUT_MS;
    /** @type {null | (() => void)} */
    this.unsubscribe = null;
    /** @type {any} */
    this.timer = null;
    this.support = { ble: false, hotspot: false, bluetoothOn: false, reason: '' };
    this.state = { phase: 'idle' };
  }

  /** @returns {Promise<{ ble: boolean, hotspot: boolean, bluetoothOn: boolean, reason: string }>} */
  async checkSupport() {
    const result = await this.transport.isSupported();
    this.support = {
      ble: Boolean(result && result.ble),
      hotspot: Boolean(result && result.hotspot),
      bluetoothOn: Boolean(result && result.bluetoothOn),
      reason: String((result && result.reason) || '')
    };
    return this.support;
  }

  getState() {
    return { ...this.state, support: this.support };
  }

  /** Start advertising so the PC can find this phone over Bluetooth. */
  async start() {
    await this.checkSupport();
    if (!this.support.hotspot) {
      this._set({ phase: 'failed', error: this.support.reason || 'This phone cannot start a hotspot' });
      return this.getState();
    }
    this._attach();
    this._clearTimer();
    try {
      await this.transport.startSession(JSON.stringify({
        deviceId: this.selfDevice.deviceId,
        displayName: this.selfDevice.displayName,
        fingerprint: this.selfDevice.fingerprint || ''
      }));
      this._set({ phase: 'advertising' });
    } catch (err) {
      this._set({ phase: 'failed', error: err && err.message ? err.message : String(err) });
    }
    return this.getState();
  }

  /** Fallback for a PC without Bluetooth: start the hotspot and show its details. */
  async startManual() {
    this._attach();
    this._clearTimer();
    this._set({ phase: 'starting_hotspot', manual: true });
    try {
      // A BLE session may be running; the hotspot is shared, advertising is not needed.
      await this.transport.stopAdvertising();
      const creds = await this.transport.startHotspotOnly(this.selfDevice.port);
      this._set({ phase: 'manual', creds: this._publicCreds(creds, true) });
      this._armIdleTimeout();
    } catch (err) {
      this._set({ phase: 'failed', error: err && err.message ? err.message : String(err) });
    }
    return this.getState();
  }

  /**
   * The phone user's answer to the code prompt.
   * @param {boolean} accepted
   */
  async respond(accepted) {
    if (this.state.phase !== 'confirm') return this.getState();
    this._clearTimer();
    const pc = this.state.pc;
    if (!accepted) {
      await this._respondDeclined('You declined the PC');
      return this.getState();
    }
    this._set({ phase: 'starting_hotspot', pc, code: this.state.code });
    try {
      const creds = await this.transport.respond(true, this.selfDevice.port);
      if (pc && pc.deviceId && pc.fingerprint) {
        try {
          await this.trustStore.trust(pc.deviceId, pc.fingerprint, { via: 'offline-pc' });
        } catch (err) {
          logger.warn('Could not remember the PC:', err.message);
        }
      }
      this._set({ phase: 'ready', pc, creds: this._publicCreds(creds, false) });
      this._armIdleTimeout();
    } catch (err) {
      this._set({ phase: 'failed', pc, error: err && err.message ? err.message : String(err) });
    }
    return this.getState();
  }

  /**
   * Called by the engine when a PC opens the live link (POST /v1/live/connect).
   * @param {{ deviceId?: string, displayName?: string, address?: string }} peer
   */
  handleLiveConnected(peer) {
    const { phase, pc } = this.state;
    if (phase !== 'ready' && phase !== 'manual') return;
    if (phase === 'ready' && pc && pc.deviceId && peer && peer.deviceId && peer.deviceId !== pc.deviceId) {
      logger.warn(`A different PC (${peer.deviceId}) connected during the offline session`);
      return;
    }
    this._clearTimer();
    // The PC has the details; Bluetooth is no longer needed, the hotspot stays up.
    Promise.resolve(this.transport.stopAdvertising()).catch((err) => {
      logger.warn('Could not stop Bluetooth advertising:', err && err.message);
    });
    this._set({
      phase: 'connected',
      pc: pc || { deviceId: (peer && peer.deviceId) || '', displayName: (peer && peer.displayName) || 'PC' },
      creds: this.state.creds
    });
  }

  /** Called by the engine when the live link drops: the hotspot is released. */
  handleLiveDisconnected() {
    if (this.state.phase !== 'connected') return;
    this.stop().catch((err) => logger.warn('Failed ending the offline session:', err && err.message));
  }

  /** End the session: stop Bluetooth and release the hotspot. */
  async stop() {
    this._clearTimer();
    const wasActive = this.state.phase !== 'idle';
    try {
      await this.transport.stopSession();
    } finally {
      if (wasActive) this._set({ phase: 'idle' });
    }
  }

  /** Release native listeners (engine shutdown). */
  async dispose() {
    await this.stop();
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  // -----------------------------------------------------------------------------------

  _attach() {
    if (this.unsubscribe) return;
    this.unsubscribe = this.transport.subscribe({
      onHello: (e) => this._guard('hello', () => this._onHello(e)),
      onState: (e) => this._guard('state', () => this._onNativeState(e))
    });
  }

  _onHello(e) {
    if (this.state.phase !== 'advertising') {
      logger.warn('Ignoring a PC hello outside the advertising phase');
      return;
    }
    const code = String((e && e.code) || '');
    if (!/^\d{6}$/.test(code)) {
      this._set({ phase: 'failed', error: 'The PC sent an invalid handshake' });
      return;
    }
    const pc = {
      deviceId: String((e && e.pcDeviceId) || ''),
      displayName: String((e && e.pcName) || 'PC'),
      fingerprint: String((e && e.pcFingerprint) || '')
    };
    this._set({ phase: 'confirm', code, pc });
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.state.phase === 'confirm') {
        this._respondDeclined('No answer in time').catch((err) => logger.warn('Auto-decline failed:', err && err.message));
      }
    }, this.confirmTimeoutMs);
  }

  _onNativeState(e) {
    const state = e && e.state;
    const message = String((e && e.message) || '');
    if (state === 'hotspot_stopped' && this.state.phase !== 'idle') {
      this._clearTimer();
      this._set({ phase: 'failed', pc: this.state.pc, error: message || 'The hotspot stopped' });
    } else if (state === 'pc_disconnected' && this.state.phase === 'confirm') {
      this._clearTimer();
      this.transport.stopSession().catch((err) => logger.warn('Stop after PC left failed:', err && err.message));
      this._set({ phase: 'failed', pc: this.state.pc, error: message || 'The PC disconnected' });
    }
  }

  async _respondDeclined(reason) {
    const pc = this.state.pc;
    try {
      await this.transport.respond(false, this.selfDevice.port);
    } catch (err) {
      logger.warn('Declining the PC failed:', err && err.message);
    }
    // Leave the "declined" status readable for a moment so the PC can show it, then close.
    this._set({ phase: 'failed', pc, error: reason });
    this._clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.state.phase === 'failed') {
        this.transport.stopSession().catch((err) => logger.warn('Stop after decline failed:', err && err.message));
      }
    }, 3000);
  }

  _armIdleTimeout() {
    this._clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.state.phase === 'ready' || this.state.phase === 'manual') {
        this.transport.stopSession()
          .catch((err) => logger.warn('Stopping the idle hotspot failed:', err && err.message))
          .then(() => this._set({ phase: 'failed', error: 'No PC connected, so the hotspot was turned off' }));
      }
    }, this.idleTimeoutMs);
  }

  _clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Shown in the UI. The password is only kept for the manual fallback, where the user types it on the PC.
   * @param {any} creds
   * @param {boolean} includePassword
   */
  _publicCreds(creds, includePassword) {
    const out = {
      ssid: String((creds && creds.ssid) || ''),
      ip: String((creds && creds.ip) || ''),
      port: Number((creds && creds.port) || this.selfDevice.port),
      security: String((creds && creds.security) || 'wpa2')
    };
    if (includePassword) out.password = String((creds && creds.password) || '');
    return out;
  }

  _set(next) {
    this.state = next;
    this.events.emit(OFFLINE_PC_STATE_EVENT, this.getState());
  }

  _guard(label, fn) {
    try {
      fn();
    } catch (err) {
      logger.error(`Offline PC ${label} handler failed:`, err);
    }
  }
}
