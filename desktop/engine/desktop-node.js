const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile, execFileSync } = require('child_process');
const { generateQrSvg } = require('./qr-svg');
const { WifiJoiner } = require('./wifi-join');
const { OfflinePcSession } = require('./offline-session');

/**
 * Read the operating system clipboard as text.
 * @returns {string}
 */
function getSystemClipboard() {
  try {
    if (process.platform === 'win32') {
      return execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Get-Clipboard'], {
        encoding: 'utf8'
      }).replace(/\r\n$/, '');
    }
    if (process.platform === 'darwin') {
      return execFileSync('pbpaste', { encoding: 'utf8' });
    }
    return execFileSync('xclip', ['-selection', 'clipboard', '-o'], { encoding: 'utf8' });
  } catch (err) {
    return '';
  }
}

/**
 * Write text to the operating system clipboard.
 * @param {string} text
 * @returns {boolean}
 */
function setSystemClipboard(text) {
  try {
    if (process.platform === 'win32') {
      // clip.exe reads stdin; passing via stdin avoids shell-injection from clipboard content.
      execFileSync('clip.exe', [], { input: String(text), encoding: 'utf8' });
      return true;
    }
    if (process.platform === 'darwin') {
      execFileSync('pbcopy', [], { input: String(text), encoding: 'utf8' });
      return true;
    }
    execFileSync('xclip', ['-selection', 'clipboard'], { input: String(text), encoding: 'utf8' });
    return true;
  } catch (err) {
    return false;
  }
}

const { TransferGateway } = require('../../nodejs-assets/nodejs-project/transfer-gateway');
const { LocalSendGateway } = require('../../nodejs-assets/nodejs-project/localsend-gateway');
const protocol = require('../../nodejs-assets/nodejs-project/protocol');
const {
  DeviceInfo,
  SessionRequest,
  FileDescriptor,
  CommitRequest
} = require('../../nodejs-assets/nodejs-project/models');
const fsService = require('../../nodejs-assets/nodejs-project/fs-service');

const CONTROL_COOKIE = 'localshare_control';
const CONTROL_TOKEN_HEADER = 'x-localshare-control-token';
const MAX_JSON_BODY_BYTES = 4 * 1024 * 1024;

/**
 * Constant-time string comparison.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/**
 * Report an expected, non-fatal error (an unreachable host during a subnet sweep,
 * a best-effort registration). Printed only with LOCALSHARE_DEBUG.
 * @param {string} context
 * @param {any} err
 */
function logIgnored(context, err) {
  if (process.env.LOCALSHARE_DEBUG) {
    console.warn(`[DesktopEngine] ${context}:`, err && err.message ? err.message : err);
  }
}

const DESKTOP_HTTP_PORT = 53319;
const TRANSFER_PORT = 53318;
const LOCALSEND_PORT = 53317;

/**
 * Normalize an IP so IPv4-mapped IPv6 addresses (`::ffff:10.0.0.5`) compare equal
 * to their plain IPv4 form. Sockets report remote peers in the mapped form on
 * dual-stack listeners, which previously defeated every local-IP self check.
 * @param {string} ip
 * @returns {string}
 */
function normalizeIp(ip) {
  if (!ip || typeof ip !== 'string') return '';
  let value = ip.trim().toLowerCase();
  if (value.startsWith('[') && value.endsWith(']')) {
    value = value.slice(1, -1);
  }
  if (value.startsWith('::ffff:')) {
    value = value.slice(7);
  }
  return value;
}

function getAllLocalIps() {
  const ips = new Set(['127.0.0.1', '0.0.0.0', '::1', '::']);
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.address) {
        ips.add(normalizeIp(iface.address));
      }
    }
  }
  return ips;
}

function getPrimaryLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

class DesktopEngine {
  constructor(options = {}) {
    this.clipboardAdapter = options.clipboardAdapter || null;
    this.httpAgent = new http.Agent({ keepAlive: true, maxSockets: 8 });
    this.connectedPeer = null;
    this.liveClipboardEnabled = true;
    this.lastClipboardHash = null;
    this.clipboardPollInterval = null;
    this.clipboardHistory = [];
    // Saved state: this PC's identity, last peer, settings and remembered pairings.
    this.stateFile = options.stateFile || path.join(os.homedir(), '.localshare-state.json');
    this.state = this.loadState();
    this.autoReconnect = this.state.autoReconnect !== false;
    // Files from paired devices are accepted without a prompt unless turned off in Settings.
    this.autoAcceptPaired = this.state.autoAcceptPaired !== false;
    this.lastConnectedPeer = this.state.lastConnectedPeer || null;
    this.pairingCode = String(crypto.randomInt(100000, 1000000));
    // Per-launch secret for the local control API; only this app's own window holds it.
    this.controlToken = crypto.randomBytes(32).toString('hex');

    this.localIp = getPrimaryLocalIp();
    this.localIps = getAllLocalIps();
    this.hostname = os.hostname() || 'Windows-PC';
    // Stable across launches, so paired phones recognise this PC after a restart.
    if (typeof this.state.deviceId === 'string' && /^pc-[0-9a-f]{8,32}$/.test(this.state.deviceId)) {
      this.deviceId = this.state.deviceId;
    } else {
      this.deviceId = `pc-${crypto.randomBytes(8).toString('hex')}`;
      this.state.deviceId = this.deviceId;
      this.saveState();
    }
    this.fingerprint = crypto.createHash('sha256').update(this.deviceId + this.hostname).digest('hex').toUpperCase();

    // Default downloads folder
    this.storageDir = path.join(os.homedir(), 'Downloads', 'LocalShare');
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    this.selfDevice = new DeviceInfo({
      deviceId: this.deviceId,
      displayName: `${this.hostname} (PC)`,
      address: this.localIp,
      port: TRANSFER_PORT,
      fingerprint: this.fingerprint,
      platform: 'desktop'
    });

    this.peers = new Map();
    this.transfers = [];
    this.sseClients = new Set();
    this.isScanning = false;
    /** @type {Map<string, (accepted: boolean) => void>} */
    this.pendingRequests = new Map();
    /** @type {Map<string, { resolve: (accepted: boolean) => void, timer: NodeJS.Timeout }>} */
    this.pendingApprovals = new Map();
    this.requestSeq = 0;
    /** @type {Map<string, string>} Tokens this PC handed to peers it connected to. */
    this.issuedPeerTokens = new Map();

    /**
     * Optional hook invoked whenever a peer asks to send files. The Electron main
     * process uses it to raise an OS notification and focus the window, so the
     * approval prompt is discoverable when the app is not in the foreground.
     * @type {((payload: object) => void) | null}
     */
    this.onIncomingRequest = null;
    /** Optional hook when a paired device's transfer is accepted without a prompt. */
    this.onAutoAccepted = null;

    this.transferGateway = null;
    this.localsendGateway = null;
    this.controlServer = null;
    this.controlPort = DESKTOP_HTTP_PORT;
    this.discoveryInterval = null;

    // "Connect without Wi-Fi": BLE handshake (renderer) + joining the phone's hotspot.
    this.offlineSession = new OfflinePcSession({
      selfDevice: this.selfDevice,
      joiner: options.wifiJoiner || new WifiJoiner(),
      connect: async (peer) => {
        this.peers.set(peer.deviceId, peer);
        return this.connectToLivePeer(peer);
      },
      onState: (state) => this.broadcastEvent('offline_state', state)
    });
  }

  getClipboardText() {
    return this.clipboardAdapter ? this.clipboardAdapter.readText() : getSystemClipboard();
  }

  setClipboardText(text) {
    return this.clipboardAdapter ? this.clipboardAdapter.writeText(text) : setSystemClipboard(text);
  }

  addClipboardHistory(text, hash, sender = 'local') {
    if (!text || typeof text !== 'string') return;
    const finalHash = hash || crypto.createHash('sha256').update(text).digest('hex');
    const entry = {
      text,
      hash: finalHash,
      sender,
      timestamp: Date.now()
    };
    this.clipboardHistory = this.clipboardHistory.filter((item) => item.hash !== finalHash);
    this.clipboardHistory.unshift(entry);
    if (this.clipboardHistory.length > 15) {
      this.clipboardHistory.pop();
    }
  }

  /**
   * Read the saved state file; a missing or unreadable file starts fresh.
   * @returns {object}
   */
  loadState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        const data = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
        if (data && typeof data === 'object' && !Array.isArray(data)) return data;
      }
    } catch (err) {
      console.warn('Failed to read LocalShare state; starting fresh:', err.message);
    }
    return {};
  }

  /** Write the state file atomically (temp file + rename) so a crash can't corrupt it. */
  saveState() {
    try {
      const tmp = `${this.stateFile}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2));
      fs.renameSync(tmp, this.stateFile);
    } catch (err) {
      console.warn('Failed to save LocalShare state:', err.message);
    }
  }

  saveLastConnectedPeer(peer) {
    if (!peer) return;
    this.lastConnectedPeer = {
      deviceId: peer.deviceId,
      displayName: peer.displayName,
      fingerprint: peer.fingerprint || '',
      address: peer.address,
      port: peer.port
    };
    this.state.lastConnectedPeer = this.lastConnectedPeer;
    this.state.autoReconnect = this.autoReconnect;
    this.saveState();
  }

  async start() {
    // 1. Start Native Transfer Gateway (Port 53318 / fallback 53328)
    try {
      this.transferGateway = new TransferGateway({
        port: TRANSFER_PORT,
        storageDir: this.storageDir,
        selfDevice: this.selfDevice,
        clipboardAdapter: this.clipboardAdapter,
        onSessionRequest: async (req, ctx) => this.evaluateIncomingSession(req, ctx),
        pairedDevices: Array.isArray(this.state.pairedDevices) ? this.state.pairedDevices : [],
        onPairedDevicesChanged: (devices) => {
          this.state.pairedDevices = devices;
          this.saveState();
          this.broadcastEvent('paired_devices_changed', { count: devices.length });
        },
        // Phones pair with the code from the QR/PIN screen, or the user approves them.
        // Paired phones keep the existing "browse this PC's drives" feature.
        pairingCode: this.pairingCode,
        exposeDrives: true,
        onConnectRequest: async (peer) => this.requestIncomingApproval({ kind: 'connect', sender: peer, files: [] }),
        onProgress: (progress) => {
          let entry = this.transfers.find((t) => t.id === progress.sessionId);
          if (!entry) {
            entry = {
              id: progress.sessionId,
              peer: 'Remote Device',
              files: [progress.fileName],
              totalBytes: progress.totalBytes,
              bytesTransferred: progress.transferredBytes,
              progress: progress.totalBytes ? Math.min(99, Math.round((progress.transferredBytes / progress.totalBytes) * 100)) : 0,
              speed: progress.speed,
              status: 'transferring',
              direction: 'receive',
              startTime: Date.now()
            };
            this.transfers.unshift(entry);
          } else {
            entry.bytesTransferred = progress.transferredBytes;
            entry.totalBytes = progress.totalBytes || entry.totalBytes;
            entry.progress = entry.totalBytes ? Math.min(99, Math.round((entry.bytesTransferred / entry.totalBytes) * 100)) : entry.progress;
            entry.speed = progress.speed;
            entry.status = 'transferring';
          }
          this.broadcastEvent('transfer_update', entry);
        },
        onFileReceived: (file) => {
          let entry = this.transfers.find((t) => t.id === file.sessionId);
          if (entry) {
            entry.status = 'completed';
            entry.progress = 100;
            entry.bytesTransferred = entry.totalBytes;
            this.broadcastEvent('transfer_update', entry);
          }
          this.broadcastEvent('received_updated', {
            name: file.fileName,
            path: file.savedPath,
            size: file.fileSize,
            lastModified: Date.now()
          });
        },
        onClipboardReceived: (clip) => {
          this.lastClipboardHash = clip.hash;
          this.addClipboardHistory(clip.text, clip.hash, 'remote');
          this.broadcastEvent('clipboard_sync', {
            text: clip.text,
            hash: clip.hash,
            sender: 'remote',
            history: this.clipboardHistory
          });
        },
        onLiveConnected: (peer) => {
          this.connectedPeer = peer;
          this.peers.set(peer.deviceId, peer);
          const currentText = this.getClipboardText();
          if (currentText) {
            this.lastClipboardHash = crypto.createHash('sha256').update(currentText).digest('hex');
          }
          this.saveLastConnectedPeer(peer);
          this.broadcastEvent('live_connected', { peer: this.connectedPeer });
        },
        onLiveDisconnected: () => {
          const wasHotspot = this.offlineSession.isHotspotPeer(this.connectedPeer);
          this.connectedPeer = null;
          this.broadcastEvent('live_disconnected', {});
          if (wasHotspot) {
            this.offlineSession.end().catch((err) => logIgnored('restore Wi-Fi after phone disconnect', err));
          }
        }
      });
      const bound = await this.transferGateway.start();
      if (bound && bound.port) {
        this.selfDevice.port = bound.port;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('TransferGateway start warning:', err.message);
    }

    // 2. Start LocalSend Gateway & Multicast (Port 53317 / fallback 53327)
    try {
      this.localsendGateway = new LocalSendGateway({
        port: LOCALSEND_PORT,
        storageDir: this.storageDir,
        alias: `${this.hostname} (PC)`,
        deviceType: 'desktop',
        fingerprint: this.fingerprint,
        onPeerFound: (peer) => this.handlePeerFound(peer),
        onUploadRequest: async (req) => this.requestIncomingApproval(req),
        onFileReceived: (file) => {
          let entry = this.transfers.find((t) => t.id === file.sessionId);
          if (entry) {
            entry.status = 'completed';
            entry.progress = 100;
            entry.bytesTransferred = entry.totalBytes;
            this.broadcastEvent('transfer_update', entry);
          }
          this.broadcastEvent('received_updated', {
            name: file.fileName,
            path: file.savedPath,
            size: file.fileSize,
            lastModified: Date.now()
          });
        }
      });
      await this.localsendGateway.start();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('LocalSendGateway start warning:', err.message);
    }

    // 3. Start Desktop HTTP & Control Server (Port 53319 / fallback 53320)
    await this.startControlServer();

    // 4. Start background clipboard polling loop (every 500ms)
    this.clipboardPollInterval = setInterval(() => {
      if (!this.connectedPeer || !this.liveClipboardEnabled) return;
      try {
        const text = this.getClipboardText();
        if (!text) return;
        const hash = crypto.createHash('sha256').update(text).digest('hex');
        if (hash !== this.lastClipboardHash) {
          this.lastClipboardHash = hash;
          this.addClipboardHistory(text, hash, 'local');
          this.broadcastEvent('clipboard_sync', {
            text,
            hash,
            sender: 'local',
            history: this.clipboardHistory
          });
          this.remotePostJson(this.connectedPeer.address, this.connectedPeer.port, '/v1/clipboard', {
            text,
            hash,
            senderDeviceId: this.selfDevice.deviceId
          }).catch((err) => logIgnored('clipboard push', err));
        }
      } catch (err) {
        logIgnored('clipboard poll', err);
      }
    }, 500);

    // Scan immediately
    this.scanSubnet();

    // Start periodic discovery sweep every 12 seconds
    this.discoveryInterval = setInterval(() => {
      this.scanSubnet();
    }, 12000);

    // eslint-disable-next-line no-console
    console.info(`=======================================================`);
    // eslint-disable-next-line no-console
    console.info(` LocalShare PC Desktop Engine is Active`);
    // eslint-disable-next-line no-console
    console.info(` Web UI:        ${this.getControlUrl()}`);
    // eslint-disable-next-line no-console
    console.info(` LAN IP:        ${this.localIp}`);
    // eslint-disable-next-line no-console
    console.info(` Storage:       ${this.storageDir}`);
    // eslint-disable-next-line no-console
    console.info(` Transfer Port: ${TRANSFER_PORT} | LocalSend Port: ${LOCALSEND_PORT}`);
    // eslint-disable-next-line no-console
    console.info(`=======================================================`);
  }

  /**
   * True when an advertised peer is actually this machine.
   * @param {string} ip
   * @param {number} port
   * @param {string} fingerprint
   * @returns {boolean}
   */
  isSelfPeer(ip, port, fingerprint) {
    if (fingerprint && fingerprint === this.fingerprint) {
      return true;
    }
    this.localIps = getAllLocalIps();
    if (!this.localIps.has(normalizeIp(ip))) {
      return false;
    }
    return (
      port === LOCALSEND_PORT ||
      port === TRANSFER_PORT ||
      port === this.selfDevice.port ||
      port === undefined
    );
  }

  /**
   * Prompt the desktop UI for explicit approval before accepting an incoming
   * transfer. Broadcasts `incoming_request` and waits (up to 30s) for the user
   * to accept or decline via POST /api/respond-request.
   * @param {object} req - Session/upload request payload.
   * @returns {Promise<{ accepted: boolean, reason?: string }>}
   */
  requestIncomingApproval(req) {
    // LocalShare sessions carry `sessionId`; LocalSend prepare-upload does not,
    // so synthesize a stable key in that case.
    const sessionId = (req && req.sessionId) || `req-${Date.now()}-${this.requestSeq++}`;
    // LocalShare sessions carry `sender`; LocalSend prepare-upload carries `info`.
    const sender = (req && (req.sender || req.info)) || {};
    const files = (req && Array.isArray(req.files))
      ? req.files.map((f) => ({
        fileName: f.fileName || f.name || 'file',
        fileSize: f.fileSize || f.size || 0
      }))
      : Object.values((req && req.files) || {}).map((f) => ({
        fileName: f.fileName || f.name || 'file',
        fileSize: f.size || 0
      }));
    const totalBytes = files.reduce((acc, f) => acc + (f.fileSize || 0), 0);

    const payload = {
      requestId: sessionId,
      kind: (req && req.kind) || 'transfer',
      sessionId,
      senderName: sender.displayName || sender.alias || (req && req.alias) || 'Nearby Device',
      senderDeviceId: sender.deviceId || sender.fingerprint || (req && req.fingerprint) || '',
      files,
      fileCount: files.length,
      totalBytes,
      requestedAt: Date.now()
    };

    this.broadcastEvent('incoming_request', payload);

    if (this.onIncomingRequest) {
      try {
        this.onIncomingRequest(payload);
      } catch (err) {
        // A failing host hook must never block the approval gate.
        console.warn('Incoming-request hook failed:', err && err.message ? err.message : err);
      }
    }

    return new Promise((resolve) => {
      const settle = (accepted, reason) => {
        const entry = this.pendingApprovals.get(sessionId);
        if (entry) {
          clearTimeout(entry.timer);
          this.pendingApprovals.delete(sessionId);
        }
        this.broadcastEvent('incoming_request_closed', { requestId: sessionId, sessionId, accepted });
        resolve(accepted ? { accepted: true } : { accepted: false, reason });
      };

      const timer = setTimeout(() => settle(false, 'timeout'), 30000);
      this.pendingApprovals.set(sessionId, {
        resolve: (accepted) => settle(accepted, 'rejected_by_user'),
        timer
      });
    });
  }

  /**
   * Decide on an incoming transfer: paired devices are accepted straight away
   * (unless turned off in Settings); everyone else gets the approval prompt.
   * @param {object} req - Session request payload.
   * @param {{ paired?: boolean, pairedDevice?: object|null }} [ctx]
   * @returns {Promise<{ accepted: boolean, reason?: string }>}
   */
  async evaluateIncomingSession(req, ctx) {
    if (ctx && ctx.paired && this.autoAcceptPaired) {
      const files = req && Array.isArray(req.files) ? req.files : [];
      const sender = (ctx.pairedDevice && ctx.pairedDevice.displayName) ||
        (req && req.sender && req.sender.displayName) || 'A paired device';
      this.broadcastEvent('transfer_auto_accepted', {
        sessionId: req && req.sessionId,
        senderName: sender,
        fileCount: files.length,
        totalBytes: files.reduce((acc, f) => acc + (Number(f && f.fileSize) || 0), 0)
      });
      if (this.onAutoAccepted) {
        try {
          this.onAutoAccepted({ senderName: sender, fileCount: files.length });
        } catch (err) {
          console.warn('Auto-accept hook failed:', err && err.message ? err.message : err);
        }
      }
      return { accepted: true };
    }
    return this.requestIncomingApproval(req);
  }

  /**
   * Resolve a pending incoming-transfer prompt by session/request id.
   * @param {string} sessionId
   * @param {boolean} accepted
   * @returns {boolean} True if a pending request was resolved.
   */
  respondToRequest(sessionId, accepted) {
    const entry = this.pendingApprovals.get(sessionId);
    if (!entry) return false;
    entry.resolve(Boolean(accepted));
    return true;
  }

  /**
   * True when an advertised peer record (any shape) refers to this machine.
   * Centralizes the self checks so every insertion path applies them.
   * @param {object} peer
   * @returns {boolean}
   */
  isSelfRecord(peer) {
    if (!peer) return false;
    const ip = peer.ip || peer.address || '';
    const name = peer.alias || peer.displayName || '';
    if (peer.deviceId && peer.deviceId === this.deviceId) return true;
    if (peer.fingerprint && peer.fingerprint === this.fingerprint) return true;
    if (name && name === this.selfDevice.displayName) return true;
    if (name && this.localsendGateway && name === this.localsendGateway.alias) return true;
    this.localIps = getAllLocalIps();
    return this.localIps.has(normalizeIp(ip));
  }

  /**
   * Access token handed to a peer this PC connects to, so the peer can call back
   * (clipboard push, telemetry) on this PC's protected gateway routes.
   * @param {object} peer
   * @returns {string|undefined}
   */
  peerAccessToken(peer) {
    if (!this.transferGateway) return undefined;
    const key = (peer && (peer.deviceId || peer.address)) || '';
    const existing = this.issuedPeerTokens.get(key);
    if (existing && this.transferGateway.hasAccessToken(existing)) return existing;
    // This PC's user chose to connect to this device, so it counts as paired.
    const token = this.transferGateway.issueAccessToken({
      deviceId: peer && peer.deviceId,
      displayName: peer && peer.displayName,
      platform: peer && peer.platform
    }, { remember: true });
    this.issuedPeerTokens.set(key, token);
    return token;
  }

  handlePeerFound(peer) {
    if (!peer) return;
    const peerIp = normalizeIp(peer.ip || peer.address);
    if (!peerIp) return;

    // Strictly ignore self by deviceId, fingerprint, displayName, LocalSend alias,
    // or any local interface IP (including IPv4-mapped IPv6 forms).
    if (this.isSelfRecord(peer)) {
      return;
    }

    const id = peer.fingerprint || peer.deviceId || `${peerIp}:${peer.port || 53318}`;
    const existing = this.peers.get(id);
    const peerName = peer.alias || peer.displayName || '';

    const updated = {
      deviceId: id,
      displayName: peerName || `Device (${peerIp})`,
      address: peerIp,
      port: peer.port || 53317,
      platform: peer.deviceType || peer.platform || 'mobile',
      fingerprint: peer.fingerprint || '',
      lastSeen: Date.now()
    };

    this.peers.set(id, updated);
    if (!existing) {
      this.broadcastEvent('peer_found', updated);
    }

    if (this.autoReconnect && !this.connectedPeer && this.lastConnectedPeer) {
      const match = (this.lastConnectedPeer.deviceId && this.lastConnectedPeer.deviceId === updated.deviceId) ||
                    (this.lastConnectedPeer.fingerprint && this.lastConnectedPeer.fingerprint === updated.fingerprint);
      if (match) {
        this.connectToLivePeer(updated).catch((err) => logIgnored('auto-reconnect', err));
      }
    }
  }

  async connectToLivePeer(peer) {
    if (!peer || !peer.address) return null;
    try {
      const connectRes = await this.remotePostJson(peer.address, peer.port || 53318, '/v1/live/connect', {
        deviceId: this.selfDevice.deviceId,
        displayName: this.selfDevice.displayName,
        // On the phone's hotspot this PC has a new address; an empty one makes the
        // phone use the address the request came from.
        address: peer.viaHotspot ? '' : this.localIp,
        port: this.selfDevice.port,
        platform: 'desktop',
        accessToken: this.peerAccessToken(peer),
        clipboardSync: true
      });
      if (connectRes.statusCode === 200) {
        this.connectedPeer = peer;
        if (this.transferGateway) {
          this.transferGateway.connectedPeer = peer;
        }
        if (connectRes.body && connectRes.body.currentClipboard) {
          const incoming = connectRes.body.currentClipboard;
          this.lastClipboardHash = crypto.createHash('sha256').update(incoming).digest('hex');
          this.setClipboardText(incoming);
          this.addClipboardHistory(incoming, this.lastClipboardHash, 'remote');
        }
        this.saveLastConnectedPeer(peer);
        this.broadcastEvent('live_connected', { peer: this.connectedPeer });
        return { connected: true, peer: this.connectedPeer };
      }
    } catch (err) {
      logIgnored(`live connect ${peer.address}`, err);
    }
    return null;
  }

  httpGetFast(targetUrl, timeoutMs = 800) {
    return new Promise((resolve) => {
      const u = new URL(targetUrl);
      const req = http.get({
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        timeout: timeoutMs
      }, (res) => {
        let body = '';
        res.on('data', (d) => { body += d; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              resolve(JSON.parse(body));
            } catch (_e) {
              resolve(null);
            }
          } else {
            resolve(null);
          }
        });
      });
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
      req.on('error', () => {
        resolve(null);
      });
    });
  }

  async probeSingleIp(ip) {
    // Never probe our own machine; avoids surfacing this PC's own gateways as peers
    if (this.localIps.has(ip)) return;

    // 1. Probe LocalShare (Port 53318)
    try {
      const lsInfo = await this.httpGetFast(`http://${ip}:53318/v1/info`, 800);
      if (lsInfo && (lsInfo.deviceId || lsInfo.fingerprint) && !this.isSelfPeer(ip, lsInfo.port || 53318, lsInfo.fingerprint)) {
        this.handlePeerFound({
          deviceId: lsInfo.deviceId || `ls-${ip}`,
          displayName: lsInfo.displayName || `Device (${ip})`,
          ip,
          port: lsInfo.port || 53318,
          deviceType: lsInfo.platform || 'mobile',
          fingerprint: lsInfo.fingerprint || '',
          alias: lsInfo.displayName
        });
        return;
      }
    } catch (err) {
      // Offline / unreachable host
      logIgnored(`probe ${ip}`, err);
    }

    // 2. Probe LocalSend (Port 53317)
    try {
      const sendInfo = await this.httpGetFast(`http://${ip}:53317/api/localsend/v2/info`, 800);
      if (sendInfo && sendInfo.alias && !this.isSelfPeer(ip, sendInfo.port || 53317, sendInfo.fingerprint)) {
        this.handlePeerFound({
          deviceId: sendInfo.fingerprint || `localsend-${ip}`,
          displayName: sendInfo.alias,
          ip,
          port: sendInfo.port || 53317,
          deviceType: sendInfo.deviceType || 'mobile',
          fingerprint: sendInfo.fingerprint || '',
          alias: sendInfo.alias
        });

        // Register our presence with the peer
        this.registerWithPeer(ip, sendInfo.port || 53317).catch((err) => logIgnored(`register with ${ip}`, err));
      }
    } catch (err) {
      // Offline / unreachable host
      logIgnored(`probe ${ip}`, err);
    }
  }

  async registerWithPeer(ip, port) {
    try {
      const body = JSON.stringify({
        alias: this.selfDevice.displayName,
        version: '2.2',
        deviceModel: 'PC',
        deviceType: 'desktop',
        fingerprint: this.fingerprint,
        port: this.selfDevice.port,
        protocol: 'http',
        download: true
      });
      await this.httpRequest({
        hostname: ip,
        port,
        path: '/api/localsend/v2/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: 1000
      }, body);
    } catch (err) {
      // Best-effort registration
      logIgnored(`register with ${ip}`, err);
    }
  }

  async probeSubnet() {
    const interfaces = os.networkInterfaces();
    const prefixes = new Set();

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          const parts = iface.address.split('.');
          if (parts.length === 4) {
            prefixes.add(`${parts[0]}.${parts[1]}.${parts[2]}.`);
          }
        }
      }
    }

    if (prefixes.size === 0) {
      prefixes.add('192.168.1.');
    }

    this.localIps = getAllLocalIps();

    for (const prefix of prefixes) {
      const ips = [];
      for (let i = 1; i <= 254; i++) {
        const ip = `${prefix}${i}`;
        if (!this.localIps.has(ip)) {
          ips.push(ip);
        }
      }

      // Concurrently probe in batches of 32
      const batchSize = 32;
      for (let i = 0; i < ips.length; i += batchSize) {
        const batch = ips.slice(i, i + batchSize);
        await Promise.all(batch.map((ip) => this.probeSingleIp(ip)));
      }
    }
  }

  async scanSubnet() {
    if (this.isScanning) return;
    this.isScanning = true;
    this.broadcastEvent('scan_state', { scanning: true });

    if (this.localsendGateway && typeof this.localsendGateway.broadcastAnnouncement === 'function') {
      this.localsendGateway.broadcastAnnouncement();
    }

    try {
      await this.probeSubnet();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Subnet probe warning:', err);
    } finally {
      this.isScanning = false;
      this.broadcastEvent('scan_state', { scanning: false });
    }
  }

  broadcastEvent(type, data) {
    const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(payload);
      } catch (_err) {
        this.sseClients.delete(client);
      }
    }
  }

  /**
   * URL the app window loads. It carries the control token once; the server
   * swaps it for an HttpOnly cookie and redirects to "/".
   * @returns {string}
   */
  getControlUrl() {
    return `http://127.0.0.1:${this.controlPort}/?token=${this.controlToken}`;
  }

  /**
   * Only loopback Host headers are accepted, which blocks DNS-rebinding pages.
   * @param {string|undefined} host
   * @returns {boolean}
   */
  isAllowedControlHost(host) {
    const value = String(host || '').toLowerCase();
    return value === `127.0.0.1:${this.controlPort}` || value === `localhost:${this.controlPort}`;
  }

  /**
   * @param {import('http').IncomingMessage} req
   * @returns {boolean}
   */
  hasControlAuth(req) {
    const header = req.headers[CONTROL_TOKEN_HEADER];
    if (typeof header === 'string' && safeEqual(header, this.controlToken)) return true;
    for (const part of String(req.headers.cookie || '').split(';')) {
      const eq = part.indexOf('=');
      if (eq > 0 && part.slice(0, eq).trim() === CONTROL_COOKIE &&
          safeEqual(part.slice(eq + 1).trim(), this.controlToken)) {
        return true;
      }
    }
    return false;
  }

  /**
   * @param {string} target
   * @returns {(err: any) => void}
   */
  openReporter(target) {
    return (err) => {
      // explorer.exe exits with code 1 even when it opened the item.
      if (err && !(process.platform === 'win32' && err.code === 1)) {
        console.warn('Failed to open path:', target, err.message);
      }
    };
  }

  /**
   * Open a folder in the OS file manager, without a shell.
   * @param {string} dir
   */
  openFolder(dir) {
    const report = this.openReporter(dir);
    if (process.platform === 'win32') {
      execFile('explorer.exe', [dir], report);
    } else if (process.platform === 'darwin') {
      execFile('open', [dir], report);
    } else {
      execFile('xdg-open', [dir], report);
    }
  }

  /**
   * Reveal (select) a file in the OS file manager. Received files are never
   * executed, so a peer cannot get a script run by sending it.
   * @param {string} target
   */
  revealInFolder(target) {
    const report = this.openReporter(target);
    if (process.platform === 'win32') {
      execFile('explorer.exe', [`/select,"${target}"`], { windowsVerbatimArguments: true }, report);
    } else if (process.platform === 'darwin') {
      execFile('open', ['-R', target], report);
    } else {
      execFile('xdg-open', [path.dirname(target)], report);
    }
  }

  async startControlServer() {
    const publicDir = path.join(__dirname, '..', 'public');

    const handleControlRequest = async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const pathname = url.pathname;
      const method = req.method.toUpperCase();

      // This API can send any local file, read the clipboard and approve transfers,
      // so it answers only this app's own window: loopback Host (blocks DNS
      // rebinding), no CORS headers (blocks other websites), and the per-launch token.
      if (!this.isAllowedControlHost(req.headers.host)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
      }

      if (method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const queryToken = url.searchParams.get('token');
      if (queryToken !== null) {
        if (!safeEqual(queryToken, this.controlToken)) {
          res.writeHead(403, { 'Content-Type': 'text/plain' });
          res.end('Invalid token');
          return;
        }
        res.writeHead(302, {
          'Set-Cookie': `${CONTROL_COOKIE}=${this.controlToken}; HttpOnly; SameSite=Strict; Path=/`,
          'Cache-Control': 'no-store',
          Location: '/'
        });
        res.end();
        return;
      }

      if ((pathname.startsWith('/api/') || pathname === '/events') && !this.hasControlAuth(req)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      // API Endpoints
      if (pathname === '/api/self' && method === 'GET') {
        const qrPayload = JSON.stringify({
          address: this.localIp,
          port: this.selfDevice.port,
          deviceId: this.selfDevice.deviceId,
          displayName: this.selfDevice.displayName,
          fingerprint: this.fingerprint,
          code: this.pairingCode
        });
        let qrSvg = '';
        try {
          qrSvg = generateQrSvg(qrPayload, {
            margin: 1,
            dark: '#111827',
            light: '#ffffff'
          });
        } catch (err) {
          console.warn('QR code generation failed:', err.message);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ...this.selfDevice.toJSON(),
          storageDir: this.storageDir,
          pairingCode: this.pairingCode,
          qrPayload,
          qrSvg
        }));
        return;
      }

      if (pathname === '/api/clipboard-history' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.clipboardHistory));
        return;
      }

      if (pathname === '/api/peers' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(Array.from(this.peers.values())));
        return;
      }

      if (pathname === '/api/scan' && method === 'POST') {
        this.scanSubnet();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'scanning' }));
        return;
      }

      if (pathname === '/api/manual-peer' && method === 'POST') {
        const body = await this.readJson(req);
        if (body && body.ip) {
          const peer = {
            deviceId: `manual-${body.ip}:${body.port || 53318}`,
            displayName: body.name || `Device (${body.ip})`,
            address: normalizeIp(body.ip),
            port: parseInt(body.port, 10) || 53318,
            platform: 'device',
            fingerprint: body.fingerprint || '',
            lastSeen: Date.now()
          };
          // Route through handlePeerFound so adding this machine's own address
          // cannot bypass the self-filter and surface the PC in its own radar.
          if (this.isSelfRecord(peer)) {
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'That address belongs to this device' }));
            return;
          }
          this.peers.set(peer.deviceId, peer);
          this.broadcastEvent('peer_found', peer);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'added', peer }));
          return;
        }
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing IP' }));
        return;
      }

      if (pathname === '/api/send' && method === 'POST') {
        const body = await this.readJson(req);
        if (!body || !body.peer || !body.files || !body.files.length) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing peer or files' }));
          return;
        }
        const result = await this.sendFilesToPeer(body.peer, body.files);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      if (pathname === '/api/respond-request' && method === 'POST') {
        const body = await this.readJson(req);
        if (!body || !body.requestId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing requestId' }));
          return;
        }
        const resolved = this.respondToRequest(body.requestId, Boolean(body.accepted));
        res.writeHead(resolved ? 200 : 404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: resolved ? 'resolved' : 'not_found' }));
        return;
      }

      if (pathname === '/api/paired-devices' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          autoAcceptPaired: this.autoAcceptPaired,
          devices: this.transferGateway ? this.transferGateway.listPairedDevices() : []
        }));
        return;
      }

      if (pathname === '/api/paired-devices/forget' && method === 'POST') {
        const body = await this.readJson(req);
        const forgotten = this.transferGateway && body ? this.transferGateway.forgetPairedDevice(body.id) : null;
        if (!forgotten) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No such paired device' }));
          return;
        }
        for (const [key, token] of this.issuedPeerTokens) {
          if (!this.transferGateway.hasAccessToken(token)) this.issuedPeerTokens.delete(key);
        }
        // Drop the live link too, so the forgotten device can't keep using it.
        if (this.connectedPeer && forgotten.deviceId && this.connectedPeer.deviceId === forgotten.deviceId) {
          this.connectedPeer = null;
          if (this.transferGateway) this.transferGateway.connectedPeer = null;
          this.broadcastEvent('live_disconnected', {});
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ forgotten: true }));
        return;
      }

      if (pathname === '/api/settings' && method === 'POST') {
        const body = await this.readJson(req);
        if (body && typeof body.autoAcceptPaired === 'boolean') {
          this.autoAcceptPaired = body.autoAcceptPaired;
          this.state.autoAcceptPaired = body.autoAcceptPaired;
          this.saveState();
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ autoAcceptPaired: this.autoAcceptPaired }));
        return;
      }

      if (pathname === '/api/transfers' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.transfers));
        return;
      }

      if (pathname === '/api/received' && method === 'GET') {
        const files = this.listReceivedFiles();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(files));
        return;
      }

      // Remote Filesystem Explorer proxies (PC UI -> remote peer /v1/fs/*)
      if (pathname === '/api/remote-fs/list' && method === 'GET') {
        const ip = url.searchParams.get('ip');
        const port = url.searchParams.get('port') || '53318';
        const remotePath = url.searchParams.get('path') || '';
        const result = await this.remoteListDir(ip, port, remotePath);
        res.writeHead(result.statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.body));
        return;
      }

      if (pathname === '/api/remote-fs/copy' && method === 'POST') {
        const body = await this.readJson(req);
        if (!body || !body.ip || !body.sourcePath) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing ip or sourcePath' }));
          return;
        }
        const result = await this.remotePostJson(body.ip, body.port, '/v1/fs/copy', {
          sourcePath: body.sourcePath,
          destinationPath: body.destinationPath
        });
        res.writeHead(result.statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.body));
        return;
      }

      if (pathname === '/api/remote-fs/delete' && method === 'POST') {
        const body = await this.readJson(req);
        if (!body || !body.ip || !body.path) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing ip or path' }));
          return;
        }
        const result = await this.remotePostJson(body.ip, body.port, '/v1/fs/delete', { path: body.path });
        res.writeHead(result.statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.body));
        return;
      }

      if (pathname === '/api/remote-fs/pull' && method === 'POST') {
        const body = await this.readJson(req);
        if (!body || !body.ip || !body.path) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing ip or path' }));
          return;
        }
        try {
          const saved = await this.pullRemoteFile(body.ip, body.port, body.path, body.name, body.size);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, savedPath: saved }));
        } catch (err) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      if (pathname === '/api/remote-categories' && method === 'GET') {
        const ip = url.searchParams.get('ip') || (this.connectedPeer ? this.connectedPeer.address : null);
        const port = parseInt(url.searchParams.get('port'), 10) || (this.connectedPeer ? this.connectedPeer.port : 53318);
        const type = url.searchParams.get('type') || 'photos';
        const limit = url.searchParams.get('limit') || '60';
        const offset = url.searchParams.get('offset') || '0';
        if (!ip) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No peer connected or ip supplied' }));
          return;
        }
        const fast = await this.httpGetFast(`http://${ip}:${port}/v1/fs/categories?type=${type}&limit=${limit}&offset=${offset}`, 3000);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(fast || { type, total: 0, entries: [] }));
        return;
      }

      if (pathname === '/api/remote-category-counts' && method === 'GET') {
        const ip = url.searchParams.get('ip') || (this.connectedPeer ? this.connectedPeer.address : null);
        const port = parseInt(url.searchParams.get('port'), 10) || (this.connectedPeer ? this.connectedPeer.port : 53318);
        if (!ip) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No peer connected or ip supplied' }));
          return;
        }
        const fast = await this.httpGetFast(`http://${ip}:${port}/v1/fs/category-counts`, 3000);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(fast || {
          images: 0,
          videos: 0,
          audio: 0,
          documents: 0,
          archives: 0,
          apks: 0,
          whatsapp: 0,
          downloads: 0,
          bluetooth: 0
        }));
        return;
      }

      if (pathname === '/api/remote-search' && method === 'GET') {
        const ip = url.searchParams.get('ip') || (this.connectedPeer ? this.connectedPeer.address : null);
        const port = parseInt(url.searchParams.get('port'), 10) || (this.connectedPeer ? this.connectedPeer.port : 53318);
        const q = url.searchParams.get('q') || '';
        if (!ip) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No peer connected or ip supplied' }));
          return;
        }
        const fast = await this.httpGetFast(`http://${ip}:${port}/v1/fs/search?q=${encodeURIComponent(q)}`, 3000);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(fast || { query: q, count: 0, entries: [] }));
        return;
      }

      if (pathname === '/api/remote-telemetry' && method === 'GET') {
        const ip = url.searchParams.get('ip') || (this.connectedPeer ? this.connectedPeer.address : null);
        const port = parseInt(url.searchParams.get('port'), 10) || (this.connectedPeer ? this.connectedPeer.port : 53318);
        if (!ip) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No peer connected or ip supplied' }));
          return;
        }
        const fast = await this.httpGetFast(`http://${ip}:${port}/v1/telemetry`, 2500);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(fast || { error: 'Telemetry unavailable' }));
        return;
      }

      if (pathname === '/api/remote-fs/thumbnail' && method === 'GET') {
        const ip = url.searchParams.get('ip') || (this.connectedPeer ? this.connectedPeer.address : null);
        const port = parseInt(url.searchParams.get('port'), 10) || (this.connectedPeer ? this.connectedPeer.port : 53318);
        const remotePath = url.searchParams.get('path');
        if (!ip || !remotePath) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing ip or path' }));
          return;
        }
        const proxyReq = http.request({
          hostname: ip,
          port,
          path: `/v1/fs/thumbnail?path=${encodeURIComponent(remotePath)}`,
          method: 'GET',
          agent: this.httpAgent
        }, (proxyRes) => {
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(res);
        });
        proxyReq.on('error', () => {
          if (!res.headersSent) {
            res.writeHead(502);
            res.end();
          }
        });
        proxyReq.end();
        return;
      }

      // Connect without Wi-Fi (BLE handshake in the renderer, crypto + Wi-Fi join here)
      if (pathname.startsWith('/api/offline/')) {
        const sendJson = (status, payload) => {
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(payload));
        };
        const sendError = (err) => sendJson(400, {
          error: err && err.message ? err.message : String(err),
          code: (err && err.code) || 'ERR_OFFLINE',
          settingsUri: err && err.details ? err.details.settingsUri : undefined
        });
        try {
          if (pathname === '/api/offline/status' && method === 'GET') {
            sendJson(200, this.offlineSession.getState());
            return;
          }
          if (pathname === '/api/offline/begin' && method === 'POST') {
            const body = await this.readJson(req);
            sendJson(200, this.offlineSession.begin(body && body.info));
            return;
          }
          if (pathname === '/api/offline/creds' && method === 'POST') {
            const body = await this.readJson(req);
            // Joining takes several seconds; progress arrives as offline_state events.
            const joining = this.offlineSession.acceptCredentials(body && body.blob);
            joining.catch((err) => logIgnored('offline join', err));
            // Decryption errors surface right away; everything after is reported by events.
            await Promise.race([joining, new Promise((resolve) => setImmediate(resolve))]);
            sendJson(202, { accepted: true });
            return;
          }
          if (pathname === '/api/offline/manual' && method === 'POST') {
            const body = await this.readJson(req);
            const joining = this.offlineSession.joinManual(body || {});
            joining.catch((err) => logIgnored('offline manual join', err));
            await Promise.race([joining, new Promise((resolve) => setImmediate(resolve))]);
            sendJson(202, { accepted: true });
            return;
          }
          if (pathname === '/api/offline/cancel' && method === 'POST') {
            const body = await this.readJson(req);
            this.offlineSession.cancel(body && body.reason);
            sendJson(200, this.offlineSession.getState());
            return;
          }
          if (pathname === '/api/offline/end' && method === 'POST') {
            if (this.offlineSession.isHotspotPeer(this.connectedPeer)) {
              const peer = this.connectedPeer;
              this.connectedPeer = null;
              if (this.transferGateway) this.transferGateway.connectedPeer = null;
              await this.remotePostJson(peer.address, peer.port, '/v1/live/disconnect', {
                deviceId: this.selfDevice.deviceId
              }).catch((err) => logIgnored('offline live disconnect notify', err));
              this.broadcastEvent('live_disconnected', {});
            }
            await this.offlineSession.end();
            sendJson(200, this.offlineSession.getState());
            return;
          }
          sendJson(404, { error: 'Unknown offline endpoint' });
        } catch (err) {
          sendError(err);
        }
        return;
      }

      // Live Link & Bi-directional Clipboard Sync
      if (pathname === '/api/live/connect' && method === 'POST') {
        const body = await this.readJson(req);
        if (!body || !body.peer) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing peer' }));
          return;
        }
        const peer = body.peer;
        const connectRes = await this.remotePostJson(peer.address, peer.port, '/v1/live/connect', {
          deviceId: this.selfDevice.deviceId,
          displayName: this.selfDevice.displayName,
          address: this.localIp,
          port: this.selfDevice.port,
          platform: 'desktop',
          accessToken: this.peerAccessToken(peer),
          clipboardSync: true
        });
        if (connectRes.statusCode === 200) {
          this.connectedPeer = peer;
          if (this.transferGateway) {
            this.transferGateway.connectedPeer = peer;
          }
          if (connectRes.body && connectRes.body.currentClipboard) {
            const incoming = connectRes.body.currentClipboard;
            this.lastClipboardHash = crypto.createHash('sha256').update(incoming).digest('hex');
            this.setClipboardText(incoming);
            this.addClipboardHistory(incoming, this.lastClipboardHash, 'remote');
          }
          this.saveLastConnectedPeer(peer);
          this.broadcastEvent('live_connected', { peer: this.connectedPeer });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ connected: true, peer: this.connectedPeer }));
        } else {
          res.writeHead(connectRes.statusCode || 502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to connect to peer' }));
        }
        return;
      }

      if (pathname === '/api/live/disconnect' && method === 'POST') {
        const wasHotspot = this.offlineSession.isHotspotPeer(this.connectedPeer);
        if (this.connectedPeer) {
          this.remotePostJson(this.connectedPeer.address, this.connectedPeer.port, '/v1/live/disconnect', {
            deviceId: this.selfDevice.deviceId
          }).catch((err) => logIgnored('live disconnect notify', err));
        }
        this.connectedPeer = null;
        if (this.transferGateway) {
          this.transferGateway.connectedPeer = null;
        }
        this.broadcastEvent('live_disconnected', {});
        if (wasHotspot) {
          // Leaving the phone's hotspot: put the PC back on its own Wi-Fi.
          this.offlineSession.end().catch((err) => logIgnored('restore Wi-Fi after disconnect', err));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ disconnected: true }));
        return;
      }

      if (pathname === '/api/live/status' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          connected: !!this.connectedPeer,
          peer: this.connectedPeer,
          clipboardSync: this.liveClipboardEnabled
        }));
        return;
      }

      if (pathname === '/api/live/toggle-clipboard' && method === 'POST') {
        const body = await this.readJson(req);
        if (body && typeof body.enabled === 'boolean') {
          this.liveClipboardEnabled = body.enabled;
        } else {
          this.liveClipboardEnabled = !this.liveClipboardEnabled;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ enabled: this.liveClipboardEnabled }));
        return;
      }

      // Clipboard sync proxies
      if (pathname === '/api/remote-clipboard/push' && method === 'POST') {
        const body = await this.readJson(req);
        if (!body || !body.ip) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing ip' }));
          return;
        }
        const text = body.text !== undefined ? String(body.text) : this.getClipboardText();
        const hash = crypto.createHash('sha256').update(text).digest('hex');
        this.lastClipboardHash = hash;
        const result = await this.remotePostJson(body.ip, body.port, '/v1/clipboard', {
          text,
          hash,
          sender: this.selfDevice.displayName
        });
        res.writeHead(result.statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.body));
        return;
      }

      if (pathname === '/api/remote-clipboard/pull' && method === 'POST') {
        const body = await this.readJson(req);
        if (!body || !body.ip) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing ip' }));
          return;
        }
        const result = await this.remoteGetJson(body.ip, body.port, '/v1/clipboard');
        if (result.statusCode !== 200 || !result.body) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to fetch remote clipboard' }));
          return;
        }
        const text = typeof result.body.text === 'string' ? result.body.text : '';
        this.lastClipboardHash = crypto.createHash('sha256').update(text).digest('hex');
        this.setClipboardText(text);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text }));
        return;
      }

      if (pathname === '/api/clipboard' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text: this.getClipboardText(), timestamp: Date.now() }));
        return;
      }

      if (pathname === '/api/open-folder' && method === 'POST') {
        this.openFolder(this.storageDir);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'opened', path: this.storageDir }));
        return;
      }

      if (pathname === '/api/open-file' && method === 'POST') {
        const body = await this.readJson(req);
        const target = body && typeof body.filePath === 'string' ? path.resolve(body.filePath) : '';
        // Only received files, and they are revealed rather than executed.
        if (target && fsService.isPathAllowed(target, [this.storageDir]) && fs.existsSync(target)) {
          this.revealInFolder(target);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'opened' }));
          return;
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'File not found' }));
        return;
      }

      // Server-Sent Events (SSE) Stream
      if (pathname === '/events' && method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive'
        });
        res.write('\n');
        this.sseClients.add(res);

        req.on('close', () => {
          this.sseClients.delete(res);
        });
        return;
      }

      // Static File Server (never outside desktop/public)
      let filePath = path.join(publicDir, pathname === '/' ? 'index.html' : pathname);
      if (!fsService.isPathAllowed(filePath, [publicDir]) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(publicDir, 'index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentTypes = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.svg': 'image/svg+xml'
      };

      try {
        const data = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
        res.end(data);
      } catch (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    };

    this.controlServer = http.createServer((req, res) => {
      handleControlRequest(req, res).catch((err) => {
        console.error('Control API request failed:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal error' }));
        } else {
          res.destroy();
        }
      });
    });

    const recordPort = () => {
      const addr = this.controlServer.address();
      if (addr && typeof addr === 'object') this.controlPort = addr.port;
      return this.controlPort;
    };

    return new Promise((resolve, reject) => {
      this.controlServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && this.controlPort === DESKTOP_HTTP_PORT) {
          this.controlPort = DESKTOP_HTTP_PORT + 1;
          try {
            this.controlServer.listen(this.controlPort, '127.0.0.1', () => {
              resolve(recordPort());
            });
            return;
          } catch (retryErr) {
            reject(retryErr);
            return;
          }
        }
        reject(err);
      });

      this.controlServer.listen(this.controlPort, '127.0.0.1', () => {
        resolve(recordPort());
      });
    });
  }

  listReceivedFiles() {
    if (!fs.existsSync(this.storageDir)) return [];
    try {
      const entries = fs.readdirSync(this.storageDir);
      return entries
        .filter((name) => !name.endsWith(protocol.kPartialSuffix))
        .map((name) => {
          const fullPath = path.join(this.storageDir, name);
          const stat = fs.statSync(fullPath);
          return {
            name,
            path: fullPath,
            size: stat.size,
            receivedAt: stat.mtimeMs
          };
        })
        .sort((a, b) => b.receivedAt - a.receivedAt);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Failed to read received directory:', err);
      return [];
    }
  }

  readJson(req) {
    return new Promise((resolve) => {
      const chunks = [];
      let size = 0;
      let tooLarge = false;
      req.on('data', (chunk) => {
        if (tooLarge) return;
        size += chunk.length;
        if (size > MAX_JSON_BODY_BYTES) {
          tooLarge = true;
          console.warn('Rejected an oversized JSON payload');
          resolve(null);
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (tooLarge) return;
        const data = Buffer.concat(chunks).toString('utf8');
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('Invalid JSON payload received:', err);
          resolve(null);
        }
      });
      req.on('error', (err) => {
        // eslint-disable-next-line no-console
        console.warn('Request read error:', err);
        resolve(null);
      });
    });
  }

  httpRequest(options, body) {
    // Always advertise the body length. Node defaults to chunked transfer-encoding
    // when it is omitted, and the Android server (as well as several third-party
    // LocalShare peers) only reads Content-Length, which truncated every request body.
    const opts = { agent: this.httpAgent, ...options };
    const isStream = body && typeof body.pipe === 'function';
    if (body && !isStream) {
      const length = Buffer.isBuffer(body) ? body.length : Buffer.byteLength(String(body));
      opts.headers = { ...(options.headers || {}), 'Content-Length': String(length) };
    }
    return new Promise((resolve, reject) => {
      const req = http.request(opts, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = data ? JSON.parse(data) : {};
          } catch (_err) {
            parsed = data;
          }
          resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed });
        });
      });
      req.on('error', reject);
      if (options.timeout) {
        req.on('timeout', () => req.destroy(new Error('Request timed out')));
      }
      if (isStream) {
        body.pipe(req);
      } else if (body) {
        req.write(body);
        req.end();
      } else {
        req.end();
      }
    });
  }

  async sendFilesToPeer(peer, fileList) {
    const sessionId = `sess-${crypto.randomBytes(6).toString('hex')}`;
    const transferEntry = {
      id: sessionId,
      peer: peer.displayName || peer.address,
      files: fileList.map((f) => f.name),
      totalBytes: fileList.reduce((sum, f) => sum + (f.size || 0), 0),
      bytesTransferred: 0,
      progress: 0,
      status: 'connecting',
      startTime: Date.now()
    };
    this.transfers.unshift(transferEntry);
    this.broadcastEvent('transfer_update', transferEntry);

    (async () => {
      try {
        transferEntry.status = 'transferring';
        const isLocalSend = peer.platform === 'localsend' || peer.port === 53317;
        if (isLocalSend) {
          await this.sendViaLocalSend(peer, fileList, transferEntry);
        } else {
          await this.sendViaLocalShare(peer, fileList, transferEntry, sessionId);
        }
        transferEntry.status = 'completed';
        transferEntry.progress = 100;
        transferEntry.bytesTransferred = transferEntry.totalBytes;
        this.broadcastEvent('transfer_update', transferEntry);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('File transfer failed:', err);
        transferEntry.status = 'failed';
        transferEntry.error = err.message || 'Transfer failed';
        this.broadcastEvent('transfer_update', transferEntry);
      }
    })();

    return { sessionId, status: 'started' };
  }

  async sendViaLocalShare(peer, fileList, transferEntry, sessionId) {
    const fileDescriptors = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      const fileId = `file-${i + 1}`;
      f.fileId = fileId;
      fileDescriptors.push(new FileDescriptor({
        fileId,
        fileName: f.name,
        fileSize: f.size,
        mimeType: f.type || 'application/octet-stream',
        sha256: ''
      }));
    }

    const sessionReq = new SessionRequest({
      sessionId,
      sender: this.selfDevice,
      files: fileDescriptors
    });

    const sessionRes = await this.httpRequest({
      hostname: peer.address,
      port: peer.port,
      path: '/v1/session',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify(sessionReq.toJSON()));

    if (sessionRes.statusCode !== 200 || !sessionRes.body || !sessionRes.body.accepted) {
      throw new Error(`Session rejected by peer (${sessionRes.statusCode})`);
    }

    // Receivers that advertise `stream` take each file as one continuous request,
    // which keeps the link busy instead of waiting for a reply every few MB.
    const useStream = sessionRes.body.stream === true;
    const resume = (sessionRes.body && sessionRes.body.resume) || {};

    for (const f of fileList) {
      if (!f.path || !fs.existsSync(f.path)) {
        throw new Error(`Local file not found: ${f.name}`);
      }
      const finalSha256 = useStream
        ? await this.streamFileToPeer(peer, sessionId, f, Number(resume[f.fileId]) || 0, transferEntry)
        : await this.chunkFileToPeer(peer, sessionId, f, transferEntry);

      const commitReq = new CommitRequest({
        sessionId,
        fileId: f.fileId,
        sha256: finalSha256,
        lastChunk: true
      });
      const commitRes = await this.httpRequest({
        hostname: peer.address,
        port: peer.port,
        path: '/v1/file/commit',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, JSON.stringify(commitReq.toJSON()));

      if (commitRes.statusCode !== 200) {
        throw new Error(`Failed to commit file ${f.name}`);
      }
    }
  }

  /**
   * Record progress on a transfer entry and push it to the UI at most every 150 ms.
   * @param {object} transferEntry
   * @param {boolean} [force]
   */
  reportSendProgress(transferEntry, force = false) {
    const now = Date.now();
    if (!force && now - (transferEntry.lastBroadcast || 0) < 150) return;
    transferEntry.lastBroadcast = now;
    const elapsed = (now - transferEntry.startTime) / 1000;
    transferEntry.speed = elapsed > 0 ? transferEntry.bytesTransferred / elapsed : 0;
    transferEntry.progress = Math.min(99, Math.round((transferEntry.bytesTransferred / (transferEntry.totalBytes || 1)) * 100));
    this.broadcastEvent('transfer_update', transferEntry);
  }

  /**
   * Upload one file as a single streamed request (PUT /v1/stream), hashing as it reads.
   * @param {object} peer
   * @param {string} sessionId
   * @param {{ path: string, fileId: string }} f
   * @param {number} startOffset - Bytes the receiver already has.
   * @param {object} transferEntry
   * @returns {Promise<string>} SHA-256 of the whole file.
   */
  async streamFileToPeer(peer, sessionId, f, startOffset, transferEntry) {
    const READ_BYTES = 1024 * 1024;
    const size = fs.statSync(f.path).size;
    const offset = Math.max(0, Math.min(startOffset, size));
    const hash = crypto.createHash('sha256');

    // The commit hash covers the whole file, so a resumed upload hashes the prefix locally.
    if (offset > 0) {
      for await (const chunk of fs.createReadStream(f.path, { start: 0, end: offset - 1, highWaterMark: READ_BYTES })) {
        hash.update(chunk);
      }
      transferEntry.bytesTransferred += offset;
    }

    const source = fs.createReadStream(f.path, { start: offset, highWaterMark: READ_BYTES });
    source.on('data', (chunk) => {
      hash.update(chunk);
      transferEntry.bytesTransferred += chunk.length;
      this.reportSendProgress(transferEntry);
    });

    const result = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: peer.address,
        port: peer.port,
        path: '/v1/stream',
        method: 'PUT',
        agent: this.httpAgent,
        timeout: 60000,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(size - offset),
          [protocol.kHeaderSessionId]: sessionId,
          'x-file-id': f.fileId,
          'x-offset': String(offset)
        }
      }, (res) => {
        if (res.statusCode !== 200) {
          // Receiver refused early: stop reading the file.
          source.unpipe(req);
          source.destroy();
        }
        let body = '';
        res.on('data', (d) => { body += d; });
        res.on('end', () => {
          // An early refusal leaves the request body unfinished; don't return that socket to the pool.
          if (res.statusCode !== 200) req.destroy();
          resolve({ statusCode: res.statusCode, body });
        });
        res.on('error', reject);
      });
      req.on('timeout', () => req.destroy(new Error('Upload stalled for 60 seconds')));
      req.on('error', reject);
      source.on('error', (err) => req.destroy(err));
      source.pipe(req);
    });

    if (result.statusCode !== 200) {
      throw new Error(`Upload of ${f.name || f.fileId} failed: HTTP ${result.statusCode}`);
    }
    this.reportSendProgress(transferEntry, true);
    return hash.digest('hex');
  }

  /**
   * Upload one file as sequential 4 MB chunks (PUT /v1/chunk), for receivers
   * that don't advertise streamed uploads.
   * @param {object} peer
   * @param {string} sessionId
   * @param {{ path: string, fileId: string }} f
   * @param {object} transferEntry
   * @returns {Promise<string>} SHA-256 of the whole file.
   */
  async chunkFileToPeer(peer, sessionId, f, transferEntry) {
    const chunkSize = 4 * 1024 * 1024;
    const hash = crypto.createHash('sha256');
    let offset = 0;
    for await (const chunk of fs.createReadStream(f.path, { highWaterMark: chunkSize })) {
      hash.update(chunk);
      const chunkRes = await this.httpRequest({
        hostname: peer.address,
        port: peer.port,
        path: '/v1/chunk',
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(chunk.length),
          [protocol.kHeaderSessionId]: sessionId,
          'x-file-id': f.fileId,
          'x-offset': String(offset)
        }
      }, chunk);

      if (chunkRes.statusCode !== 200) {
        throw new Error(`Failed to upload chunk at offset ${offset}`);
      }
      offset += chunk.length;
      transferEntry.bytesTransferred += chunk.length;
      this.reportSendProgress(transferEntry, true);
    }
    return hash.digest('hex');
  }

  async sendViaLocalSend(peer, fileList, transferEntry) {
    const filesMap = {};
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      const fileId = `ls-file-${i + 1}`;
      f.fileId = fileId;
      filesMap[fileId] = {
        id: fileId,
        fileName: f.name,
        size: f.size,
        fileType: f.type || 'application/octet-stream'
      };
    }

    const prepareBody = {
      info: {
        alias: this.selfDevice.displayName,
        version: '2.0',
        deviceModel: 'PC',
        deviceType: 'desktop',
        fingerprint: this.fingerprint,
        port: this.selfDevice.port,
        protocol: 'https',
        download: true
      },
      files: filesMap
    };

    const prepRes = await this.httpRequest({
      hostname: peer.address,
      port: peer.port,
      path: '/api/localsend/v2/prepare-upload',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify(prepareBody));

    if (prepRes.statusCode !== 200 || !prepRes.body) {
      throw new Error(`LocalSend upload rejected (${prepRes.statusCode})`);
    }

    const sessionId = prepRes.body.sessionId;
    const tokens = prepRes.body.files || {};

    for (const f of fileList) {
      if (!f.path || !fs.existsSync(f.path)) {
        throw new Error(`Local file not found: ${f.name}`);
      }
      const stat = fs.statSync(f.path);
      const token = tokens[f.fileId] || '';
      const readStream = fs.createReadStream(f.path);

      const uploadRes = await this.httpRequest({
        hostname: peer.address,
        port: peer.port,
        path: `/api/localsend/v2/upload?sessionId=${encodeURIComponent(sessionId)}&fileId=${encodeURIComponent(f.fileId)}&token=${encodeURIComponent(token)}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(stat.size)
        }
      }, readStream);

      if (uploadRes.statusCode !== 200) {
        throw new Error(`Failed to upload ${f.name} to LocalSend peer`);
      }

      transferEntry.bytesTransferred += stat.size;
      const elapsed = (Date.now() - transferEntry.startTime) / 1000;
      transferEntry.speed = elapsed > 0 ? transferEntry.bytesTransferred / elapsed : 0;
      transferEntry.progress = Math.min(99, Math.round((transferEntry.bytesTransferred / (transferEntry.totalBytes || 1)) * 100));
      this.broadcastEvent('transfer_update', transferEntry);
    }
  }

  /**
   * GET a JSON payload from a remote peer, returning a normalized result.
   * @param {string} ip
   * @param {string|number} port
   * @param {string} remotePath
   * @returns {Promise<{ statusCode: number, body: any }>}
   */
  remoteGetJson(ip, port, remotePath) {
    return this.httpRequest({
      hostname: ip,
      port: parseInt(port, 10) || TRANSFER_PORT,
      path: remotePath,
      method: 'GET',
      timeout: 5000
    }).catch((err) => ({ statusCode: 502, body: { error: err.message } }));
  }

  /**
   * POST a JSON payload to a remote peer, returning a normalized result.
   * @param {string} ip
   * @param {string|number} port
   * @param {string} remotePath
   * @param {object} payload
   * @returns {Promise<{ statusCode: number, body: any }>}
   */
  remotePostJson(ip, port, remotePath, payload) {
    const body = JSON.stringify(payload);
    return this.httpRequest({
      hostname: ip,
      port: parseInt(port, 10) || TRANSFER_PORT,
      path: remotePath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 10000
    }, body).catch((err) => ({ statusCode: 502, body: { error: err.message } }));
  }

  /**
   * List a directory on a remote peer.
   * @param {string} ip
   * @param {string|number} port
   * @param {string} remotePath
   * @returns {Promise<{ statusCode: number, body: any }>}
   */
  remoteListDir(ip, port, remotePath) {
    if (!ip) {
      return Promise.resolve({ statusCode: 400, body: { error: 'Missing ip' } });
    }
    const query = `?path=${encodeURIComponent(remotePath || '')}`;
    return this.remoteGetJson(ip, port, `/v1/fs/list${query}`);
  }

  /**
   * Stream a remote file into the local Downloads/LocalShare folder.
   * @param {string} ip
   * @param {string|number} port
   * @param {string} remotePath
   * @param {string} [name]
   * @param {number} [size]
   * @returns {Promise<string>} Absolute path of the saved file.
   */
  pullRemoteFile(ip, port, remotePath, name, size) {
    const fileName = fsService.sanitizeFileName(name || remotePath, 'download.bin');
    const destPath = fsService.uniquePath(path.join(this.storageDir, fileName));
    const transferEntry = {
      id: `pull-${Date.now()}`,
      peer: ip,
      files: [fileName],
      totalBytes: Number(size) || 0,
      bytesTransferred: 0,
      progress: 0,
      status: 'transferring',
      startTime: Date.now()
    };
    this.transfers.unshift(transferEntry);
    this.broadcastEvent('transfer_update', transferEntry);

    return new Promise((resolve, reject) => {
      const req = http.get({
        hostname: ip,
        port: parseInt(port, 10) || TRANSFER_PORT,
        path: `/v1/fs/download?path=${encodeURIComponent(remotePath)}`,
        timeout: 15000
      }, (res) => {
        if (res.statusCode !== 200) {
          transferEntry.status = 'failed';
          this.broadcastEvent('transfer_update', transferEntry);
          res.resume();
          reject(new Error(`Remote download failed: HTTP ${res.statusCode}`));
          return;
        }
        const total = Number(res.headers['content-length']) || transferEntry.totalBytes;
        transferEntry.totalBytes = total;
        const out = fs.createWriteStream(destPath);
        res.on('data', (chunk) => {
          transferEntry.bytesTransferred += chunk.length;
          transferEntry.progress = total
            ? Math.min(99, Math.round((transferEntry.bytesTransferred / total) * 100))
            : 0;
          this.broadcastEvent('transfer_update', transferEntry);
        });
        res.pipe(out);
        out.on('finish', () => {
          transferEntry.status = 'completed';
          transferEntry.progress = 100;
          transferEntry.bytesTransferred = transferEntry.totalBytes;
          this.broadcastEvent('transfer_update', transferEntry);
          resolve(destPath);
        });
        out.on('error', (err) => {
          transferEntry.status = 'failed';
          this.broadcastEvent('transfer_update', transferEntry);
          reject(err);
        });
      });
      req.on('timeout', () => {
        req.destroy(new Error('Remote download timed out'));
      });
      req.on('error', (err) => {
        transferEntry.status = 'failed';
        this.broadcastEvent('transfer_update', transferEntry);
        reject(err);
      });
    });
  }

  async stop() {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
    }
    // Never leave the PC stuck on a phone hotspot after the app closes.
    let restoreTimer = null;
    try {
      await Promise.race([
        this.offlineSession.end(),
        new Promise((resolve) => { restoreTimer = setTimeout(resolve, 5000); })
      ]);
    } catch (err) {
      logIgnored('restore Wi-Fi on shutdown', err);
    } finally {
      if (restoreTimer) clearTimeout(restoreTimer);
    }
    if (this.clipboardPollInterval) {
      clearInterval(this.clipboardPollInterval);
      this.clipboardPollInterval = null;
    }
    if (this.httpAgent) {
      this.httpAgent.destroy();
    }
    // Decline every prompt still waiting for an answer. Clearing only the timers left
    // those requests hanging forever, so the servers never closed and the process
    // stayed alive in the background with no window.
    for (const entry of Array.from(this.pendingApprovals.values())) {
      clearTimeout(entry.timer);
      try {
        entry.resolve(false);
      } catch (err) {
        logIgnored('decline pending prompt on stop', err);
      }
    }
    this.pendingApprovals.clear();
    for (const client of this.sseClients) {
      try {
        client.end();
      } catch (err) {
        logIgnored('close event stream', err);
      }
    }
    this.sseClients.clear();

    const closeControlServer = () => new Promise((resolve) => {
      const server = this.controlServer;
      server.close(() => resolve());
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    });
    await Promise.all([
      this.transferGateway ? this.transferGateway.stop() : null,
      this.localsendGateway ? this.localsendGateway.stop() : null,
      this.controlServer ? closeControlServer() : null
    ]);
  }
}

if (require.main === module) {
  const engine = new DesktopEngine();
  engine.start().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to start LocalShare Desktop Engine:', err);
    process.exit(1);
  });

  process.on('SIGINT', async () => {
    await engine.stop();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await engine.stop();
    process.exit(0);
  });
}

module.exports = { DesktopEngine };
