/**
 * PC side of "Connect without Wi-Fi": runs the BLE handshake crypto for the renderer,
 * joins the phone's hotspot and opens the normal live link to the phone.
 *
 * The renderer does the Bluetooth I/O (Web Bluetooth) and hands the raw INFO / CREDS
 * bytes to this session through the control API, so every crypto and network step runs
 * in tested Node code.
 *
 * States (broadcast as `offline_state`):
 *   idle → confirm {code, phone} → joining → waiting → connecting → connected {peer}
 *   failed {error, code, settingsUri?}
 */
const { createPcSession, validateCredentials, BootstrapError } = require('./offline-bootstrap');

class OfflinePcSession {
  /**
   * @param {object} options
   * @param {{ deviceId: string, displayName: string, fingerprint?: string }} options.selfDevice
   * @param {{ join: Function, restore: Function }} options.joiner
   * @param {(peer: object) => Promise<object|null>} options.connect - Opens the live link.
   * @param {(state: object) => void} [options.onState]
   * @param {object} [options.testing] - Fixed key material for test vectors.
   */
  constructor({ selfDevice, joiner, connect, onState, testing }) {
    this.selfDevice = selfDevice;
    this.joiner = joiner;
    this.connect = connect;
    this.onState = onState || (() => {});
    this.testing = testing || {};
    this.handshake = null;
    this.busy = false;
    this.peer = null;
    this.state = { step: 'idle' };
  }

  getState() {
    return { ...this.state };
  }

  /**
   * Step 1: the renderer read the phone's INFO characteristic.
   * @param {string} infoBase64
   * @returns {{ hello: string, code: string, phone: object }}
   */
  begin(infoBase64) {
    if (this.busy) {
      throw new BootstrapError('A connection without Wi-Fi is already in progress', 'ERR_OFFLINE_BUSY');
    }
    const info = Buffer.from(String(infoBase64 || ''), 'base64');
    const handshake = createPcSession({
      deviceId: this.selfDevice.deviceId,
      displayName: this.selfDevice.displayName,
      fingerprint: this.selfDevice.fingerprint || ''
    }, this.testing);
    const result = handshake.acceptInfo(info);
    this.handshake = handshake;
    this._set({ step: 'confirm', code: result.code, phone: result.phone });
    return { hello: result.hello.toString('base64'), code: result.code, phone: result.phone };
  }

  /**
   * Step 2: the renderer read CREDS after the phone user approved. Resolves when connected.
   * @param {string} blobBase64
   */
  async acceptCredentials(blobBase64) {
    if (!this.handshake) {
      throw new BootstrapError('Read the phone over Bluetooth first', 'ERR_OFFLINE_STATE');
    }
    const creds = this.handshake.openCredentials(Buffer.from(String(blobBase64 || ''), 'base64'));
    const phone = this.handshake.phone;
    this.handshake = null;
    return this._joinAndConnect(creds, phone);
  }

  /**
   * Fallback without Bluetooth: details typed from the phone's screen.
   * @param {{ ssid: string, password: string, ip: string, port: number|string, security?: string }} input
   */
  async joinManual(input) {
    const creds = validateCredentials({
      ssid: String((input && input.ssid) || '').trim(),
      pass: String((input && input.password) || ''),
      ip: String((input && input.ip) || '').trim(),
      port: Number((input && input.port) || 53318),
      sec: input && input.password ? (input.security || 'wpa2') : 'open'
    });
    return this._joinAndConnect(creds, null);
  }

  /** User declined on the phone, the PC cancelled, or Bluetooth failed before joining. */
  cancel(reason) {
    if (this.busy) return;
    this.handshake = null;
    this._set(reason ? { step: 'failed', error: String(reason).slice(0, 300), code: 'ERR_OFFLINE_CANCELLED' } : { step: 'idle' });
  }

  /** Leave the hotspot and reconnect the previous Wi-Fi. */
  async end() {
    this.handshake = null;
    this.peer = null;
    let error = null;
    try {
      await this.joiner.restore();
    } catch (err) {
      error = err;
    }
    if (!this.busy) {
      this._set(error
        ? { step: 'failed', error: `Disconnected, but restoring your Wi-Fi failed: ${error.message}`, code: error.code || 'ERR_WIFI_RESTORE' }
        : { step: 'idle' });
    }
    if (error) throw error;
  }

  /** True when the given live peer is the phone joined through its hotspot. */
  isHotspotPeer(peer) {
    return Boolean(peer && this.peer && peer.deviceId === this.peer.deviceId && peer.address === this.peer.address);
  }

  async _joinAndConnect(creds, phone) {
    if (this.busy) {
      throw new BootstrapError('A connection without Wi-Fi is already in progress', 'ERR_OFFLINE_BUSY');
    }
    this.busy = true;
    const phoneInfo = phone || { deviceId: `hotspot-${creds.ip.replace(/\./g, '-')}`, displayName: 'Phone (hotspot)', platform: 'android' };
    try {
      this._set({ step: 'joining', phone: phoneInfo, ssid: creds.ssid });
      await this.joiner.join(
        { ssid: creds.ssid, password: creds.pass, security: creds.sec, ip: creds.ip, port: creds.port },
        { onStep: (step) => this._set({ step, phone: phoneInfo, ssid: creds.ssid }) }
      );
      this._set({ step: 'connecting', phone: phoneInfo, ssid: creds.ssid });
      const peer = {
        deviceId: phoneInfo.deviceId,
        displayName: phoneInfo.displayName,
        address: creds.ip,
        port: creds.port,
        platform: phoneInfo.platform || 'android',
        fingerprint: phoneInfo.fingerprint || '',
        viaHotspot: true
      };
      const result = await this.connect(peer);
      if (!result) {
        throw new BootstrapError(`Joined the hotspot, but the phone refused the connection at ${creds.ip}:${creds.port}`, 'ERR_OFFLINE_CONNECT');
      }
      this.peer = peer;
      this._set({ step: 'connected', phone: phoneInfo, ssid: creds.ssid, peer });
      return peer;
    } catch (err) {
      try {
        await this.joiner.restore();
      } catch (restoreErr) {
        err.message = `${err.message}. Restoring your Wi-Fi also failed: ${restoreErr.message}`;
      }
      this._set({
        step: 'failed',
        phone: phoneInfo,
        error: err.message,
        code: err.code || 'ERR_OFFLINE',
        settingsUri: err.details && err.details.settingsUri ? err.details.settingsUri : undefined
      });
      throw err;
    } finally {
      this.busy = false;
    }
  }

  _set(state) {
    this.state = state;
    this.onState(this.getState());
  }
}

module.exports = { OfflinePcSession };
