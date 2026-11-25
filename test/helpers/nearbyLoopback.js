/**
 * In-process stand-in for two phones running NearbyModule, joined by a loopback "air".
 *
 * justified: Google Nearby Connections is an OS/Play Services boundary that cannot run
 * under Jest. This loopback reproduces the module's contract (endpoint discovery, the
 * two-sided accept handshake, BYTES delivery, FILE payloads with progress, cancel,
 * disconnect) over REAL files on disk with REAL SHA-256 hashing, so NearbyController's
 * state machine is exercised end to end. Nothing in app code depends on this file.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

function randomPayloadId() {
  // Nearby payload ids are signed 64-bit values; they cross the bridge as decimal strings.
  return crypto.randomBytes(8).readBigInt64BE().toString();
}

function authDigitsFor(a, b) {
  const digest = crypto.createHash('sha256').update([a, b].sort().join('|')).digest();
  return String(digest.readUInt32BE(0) % 10000).padStart(4, '0');
}

async function uniqueTarget(dir, name) {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let candidate = path.join(dir, name);
  let index = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base} (${index})${ext}`);
    index += 1;
  }
  return candidate;
}

class LoopbackSide {
  constructor(name, link, dir) {
    this.name = name;
    this.endpointId = `EP-${name}`;
    this.link = link;
    this.dir = dir;
    this.handlers = null;
    this.advertising = false;
    this.discovering = false;
    this.advertisedInfo = '';
    this.accepted = false;
    this.connected = false;
    this.prepared = new Map();
    this.inflight = new Map();
    this.received = new Map();
    /** Every transport call, for assertions. */
    this.calls = [];
  }

  get peer() {
    return this.link.other(this);
  }

  _emit(event, payload, delayMs = 0) {
    const deliver = () => {
      if (this.handlers && this.handlers[event]) this.handlers[event](payload);
    };
    if (delayMs > 0) setTimeout(deliver, delayMs);
    else setImmediate(deliver);
  }

  _requireConnected(endpointId) {
    if (endpointId !== this.peer.endpointId || !this.connected) {
      throw new Error(`STATUS_ENDPOINT_UNKNOWN: not connected to ${endpointId}`);
    }
  }

  async isSupported() {
    return { supported: true, reason: '' };
  }

  subscribe(handlers) {
    this.handlers = handlers;
    return () => {
      this.handlers = null;
    };
  }

  async startAdvertising(endpointInfo) {
    this.calls.push('startAdvertising');
    this.advertising = true;
    this.advertisedInfo = endpointInfo;
    if (this.peer.discovering) {
      this.peer._emit('onEndpointFound', { endpointId: this.endpointId, endpointName: '', endpointInfo });
    }
    return true;
  }

  async startDiscovery() {
    this.calls.push('startDiscovery');
    this.discovering = true;
    if (this.peer.advertising) {
      this._emit('onEndpointFound', {
        endpointId: this.peer.endpointId,
        endpointName: '',
        endpointInfo: this.peer.advertisedInfo
      });
    }
    return true;
  }

  async stopAdvertising() {
    this.calls.push('stopAdvertising');
    this.advertising = false;
    return true;
  }

  async stopDiscovery() {
    this.calls.push('stopDiscovery');
    this.discovering = false;
    return true;
  }

  async stopAll() {
    this.calls.push('stopAll');
    this.advertising = false;
    this.discovering = false;
    if (this.connected) await this.disconnect(this.peer.endpointId);
    return true;
  }

  async requestConnection(endpointId, endpointInfo) {
    this.calls.push('requestConnection');
    if (endpointId !== this.peer.endpointId || !this.peer.advertising) {
      throw new Error(`STATUS_ENDPOINT_UNKNOWN: ${endpointId}`);
    }
    const authDigits = authDigitsFor(this.endpointId, this.peer.endpointId);
    this._emit('onConnectionInitiated', {
      endpointId: this.peer.endpointId,
      endpointName: '',
      endpointInfo: this.peer.advertisedInfo,
      authDigits,
      isIncoming: false
    });
    this.peer._emit('onConnectionInitiated', {
      endpointId: this.endpointId,
      endpointName: '',
      endpointInfo,
      authDigits,
      isIncoming: true
    });
    return true;
  }

  async acceptConnection(endpointId) {
    this.calls.push('acceptConnection');
    if (endpointId !== this.peer.endpointId) throw new Error(`Unknown endpoint ${endpointId}`);
    this.accepted = true;
    if (this.peer.accepted) {
      this.accepted = false;
      this.peer.accepted = false;
      this.connected = true;
      this.peer.connected = true;
      const ok = { connected: true, statusCode: 0, statusMessage: 'SUCCESS' };
      this._emit('onConnectionResult', { endpointId: this.peer.endpointId, ...ok });
      this.peer._emit('onConnectionResult', { endpointId: this.endpointId, ...ok });
    }
    return true;
  }

  async disconnect(endpointId) {
    this.calls.push('disconnect');
    if (endpointId !== this.peer.endpointId || !this.connected) return true;
    this.connected = false;
    this.peer.connected = false;
    // Like Nearby: only the remote side is told.
    this.peer._emit('onDisconnected', { endpointId: this.endpointId });
    return true;
  }

  async sendControl(endpointId, json) {
    this.calls.push('sendControl');
    this._requireConnected(endpointId);
    if (Buffer.byteLength(json, 'utf8') > 32768) throw new Error('Control message too large');
    this.peer._emit('onControl', { endpointId: this.endpointId, json }, this.link.controlDelayMs);
    return true;
  }

  async prepareFile(filePath) {
    this.calls.push('prepareFile');
    const stat = await fs.promises.stat(filePath);
    const payloadId = randomPayloadId();
    this.prepared.set(payloadId, { filePath, size: stat.size });
    return { payloadId, totalBytes: stat.size };
  }

  async sendPreparedFile(endpointId, payloadId) {
    this.calls.push('sendPreparedFile');
    this._requireConnected(endpointId);
    const prep = this.prepared.get(payloadId);
    if (!prep) throw new Error(`No prepared file for payload ${payloadId}`);
    this.prepared.delete(payloadId);
    const peer = this.peer;
    const tempPath = path.join(peer.dir, `.nearby-${payloadId.replace('-', 'm')}`);
    const flight = { cancelled: false };
    this.inflight.set(payloadId, flight);
    peer.received.set(payloadId, { tempPath, complete: false });
    peer._emit('onIncomingFile', { endpointId: this.endpointId, payloadId, totalBytes: prep.size });
    this._pump(payloadId, prep, flight, tempPath).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Loopback pump failed:', err);
    });
    return true;
  }

  async _pump(payloadId, prep, flight, tempPath) {
    const peer = this.peer;
    const corrupt = this.link.corruptNext;
    this.link.corruptNext = false;
    const input = await fs.promises.open(prep.filePath, 'r');
    const output = await fs.promises.open(tempPath, 'w');
    const buffer = Buffer.alloc(this.link.chunkSize);
    let sent = 0;
    let terminal = 'success';
    const progress = (status) => {
      const base = { payloadId, bytesTransferred: sent, totalBytes: prep.size, speed: 0, status };
      this._emit('onPayloadProgress', { ...base, endpointId: peer.endpointId, direction: 'send' });
      peer._emit('onPayloadProgress', { ...base, endpointId: this.endpointId, direction: 'receive' });
    };
    try {
      for (;;) {
        if (flight.cancelled) {
          terminal = 'canceled';
          break;
        }
        if (!this.connected) {
          terminal = 'failure';
          break;
        }
        const { bytesRead } = await input.read(buffer, 0, buffer.length, sent);
        if (bytesRead === 0) break;
        const chunk = Buffer.from(buffer.subarray(0, bytesRead));
        if (corrupt && sent === 0) chunk[0] ^= 0xff;
        await output.write(chunk, 0, bytesRead, sent);
        sent += bytesRead;
        progress('in_progress');
        if (this.link.chunkDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, this.link.chunkDelayMs));
        }
      }
    } finally {
      await input.close();
      await output.close();
    }
    this.inflight.delete(payloadId);
    const record = peer.received.get(payloadId);
    if (terminal === 'success') {
      if (record) record.complete = true;
    } else {
      peer.received.delete(payloadId);
      await fs.promises.rm(tempPath, { force: true });
    }
    progress(terminal);
  }

  async cancelPayload(payloadId) {
    this.calls.push('cancelPayload');
    const flight = this.inflight.get(payloadId) || this.peer.inflight.get(payloadId);
    if (flight) {
      flight.cancelled = true;
      return true;
    }
    return this.discardReceivedFile(payloadId);
  }

  async discardReceivedFile(payloadId) {
    this.calls.push('discardReceivedFile');
    const record = this.received.get(payloadId);
    if (!record) return false;
    this.received.delete(payloadId);
    await fs.promises.rm(record.tempPath, { force: true });
    return true;
  }

  async saveReceivedFile(payloadId, fileName) {
    this.calls.push('saveReceivedFile');
    const record = this.received.get(payloadId);
    if (!record) throw new Error(`No received file for payload ${payloadId}`);
    if (!record.complete) throw new Error(`Payload ${payloadId} has not finished transferring`);
    const target = await uniqueTarget(this.dir, path.basename(fileName));
    await fs.promises.rename(record.tempPath, target);
    this.received.delete(payloadId);
    const stat = await fs.promises.stat(target);
    return {
      payloadId,
      savedPath: target,
      fileName: path.basename(target),
      fileSize: stat.size,
      sha256: await sha256File(target)
    };
  }

  async deleteSavedFile(filePath) {
    this.calls.push('deleteSavedFile');
    await fs.promises.rm(filePath, { force: true });
    return true;
  }

  async hashFile(filePath) {
    this.calls.push('hashFile');
    return { sha256: await sha256File(filePath), filePath };
  }
}

/**
 * @param {string} dirA - Receive folder of phone A (real directory).
 * @param {string} dirB - Receive folder of phone B (real directory).
 */
function createLoopbackLink(dirA, dirB) {
  const link = {
    chunkSize: 64 * 1024,
    chunkDelayMs: 0,
    controlDelayMs: 0,
    corruptNext: false,
    other: null
  };
  const a = new LoopbackSide('A', link, dirA);
  const b = new LoopbackSide('B', link, dirB);
  link.other = (side) => (side === a ? b : a);
  return { link, a, b };
}

module.exports = { createLoopbackLink, sha256File };
