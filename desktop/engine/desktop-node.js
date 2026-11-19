const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { exec, execFile, execFileSync } = require('child_process');

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
  constructor() {
    this.localIp = getPrimaryLocalIp();
    this.localIps = getAllLocalIps();
    this.hostname = os.hostname() || 'Windows-PC';
    this.deviceId = `pc-${crypto.randomBytes(4).toString('hex')}`;
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

    /**
     * Optional hook invoked whenever a peer asks to send files. The Electron main
     * process uses it to raise an OS notification and focus the window, so the
     * approval prompt is discoverable when the app is not in the foreground.
     * @type {((payload: object) => void) | null}
     */
    this.onIncomingRequest = null;

    this.transferGateway = null;
    this.localsendGateway = null;
    this.controlServer = null;
    this.controlPort = DESKTOP_HTTP_PORT;
    this.discoveryInterval = null;
  }

  async start() {
    // 1. Start Native Transfer Gateway (Port 53318 / fallback 53328)
    try {
      this.transferGateway = new TransferGateway({
        port: TRANSFER_PORT,
        storageDir: this.storageDir,
        selfDevice: this.selfDevice,
        onSessionRequest: async (req) => this.requestIncomingApproval(req)
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
        onUploadRequest: async (req) => this.requestIncomingApproval(req)
      });
      await this.localsendGateway.start();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('LocalSendGateway start warning:', err.message);
    }

    // 3. Start Desktop HTTP & Control Server (Port 53319 / fallback 53320)
    await this.startControlServer();

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
    console.info(` Web UI:        http://localhost:${DESKTOP_HTTP_PORT}`);
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
      } catch (_err) {
        // A failing host hook must never block the approval gate.
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
    } catch (_e) {
      // Offline / unreachable host
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
        this.registerWithPeer(ip, sendInfo.port || 53317).catch(() => {});
      }
    } catch (_e) {
      // Offline / unreachable host
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
    } catch (_err) {
      // Best-effort registration
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

  async startControlServer() {
    const publicDir = path.join(__dirname, '..', 'public');

    this.controlServer = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = url.pathname;
      const method = req.method.toUpperCase();

      // Enable CORS for local desktop UI
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // API Endpoints
      if (pathname === '/api/self' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ...this.selfDevice.toJSON(),
          storageDir: this.storageDir
        }));
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

      // Clipboard sync proxies
      if (pathname === '/api/remote-clipboard/push' && method === 'POST') {
        const body = await this.readJson(req);
        if (!body || !body.ip) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing ip' }));
          return;
        }
        const text = body.text !== undefined ? String(body.text) : getSystemClipboard();
        const result = await this.remotePostJson(body.ip, body.port, '/v1/clipboard', {
          text,
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
        setSystemClipboard(text);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text }));
        return;
      }

      if (pathname === '/api/clipboard' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text: getSystemClipboard(), timestamp: Date.now() }));
        return;
      }

      if (pathname === '/api/open-folder' && method === 'POST') {
        if (process.platform === 'win32') {
          execFile('explorer.exe', [this.storageDir], () => {});
        } else {
          exec(`open "${this.storageDir}"`, () => {});
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'opened', path: this.storageDir }));
        return;
      }

      if (pathname === '/api/open-file' && method === 'POST') {
        const body = await this.readJson(req);
        if (body && body.filePath && fs.existsSync(body.filePath)) {
          if (process.platform === 'win32') {
            exec(`start "" "${body.filePath.replace(/"/g, '\\"')}"`, () => {});
          } else {
            exec(`open "${body.filePath}"`, () => {});
          }
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

      // Static File Server
      let filePath = path.join(publicDir, pathname === '/' ? 'index.html' : pathname);
      if (!fs.existsSync(filePath)) {
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
    });

    return new Promise((resolve, reject) => {
      this.controlServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && this.controlPort === DESKTOP_HTTP_PORT) {
          this.controlPort = DESKTOP_HTTP_PORT + 1;
          try {
            this.controlServer.listen(this.controlPort, '0.0.0.0', () => {
              resolve(this.controlPort);
            });
            return;
          } catch (retryErr) {
            reject(retryErr);
            return;
          }
        }
        reject(err);
      });

      this.controlServer.listen(this.controlPort, '0.0.0.0', () => {
        resolve(this.controlPort);
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
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
      });
      req.on('end', () => {
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
    const opts = { ...options };
    if (body) {
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
      if (body) {
        req.write(body);
      }
      req.end();
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
      let sha256 = '';
      if (f.path && fs.existsSync(f.path)) {
        const hash = crypto.createHash('sha256');
        const buf = fs.readFileSync(f.path);
        hash.update(buf);
        sha256 = hash.digest('hex');
      }
      f.sha256 = sha256;
      fileDescriptors.push(new FileDescriptor({
        fileId,
        fileName: f.name,
        fileSize: f.size,
        mimeType: f.type || 'application/octet-stream',
        sha256
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

    const chunkSize = 1024 * 1024;
    for (const f of fileList) {
      if (!f.path || !fs.existsSync(f.path)) {
        throw new Error(`Local file not found: ${f.name}`);
      }
      const fileBuf = fs.readFileSync(f.path);
      let offset = 0;
      while (offset < fileBuf.length) {
        const end = Math.min(offset + chunkSize, fileBuf.length);
        const chunk = fileBuf.subarray(offset, end);

        const chunkRes = await this.httpRequest({
          hostname: peer.address,
          port: peer.port,
          path: '/v1/chunk',
          method: 'PUT',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': chunk.length,
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
        transferEntry.progress = Math.min(99, Math.round((transferEntry.bytesTransferred / (transferEntry.totalBytes || 1)) * 100));
        this.broadcastEvent('transfer_update', transferEntry);
      }

      const commitReq = new CommitRequest({
        sessionId,
        fileId: f.fileId,
        sha256: f.sha256,
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
      const fileBuf = fs.readFileSync(f.path);
      const token = tokens[f.fileId] || '';

      const uploadRes = await this.httpRequest({
        hostname: peer.address,
        port: peer.port,
        path: `/api/localsend/v2/upload?sessionId=${encodeURIComponent(sessionId)}&fileId=${encodeURIComponent(f.fileId)}&token=${encodeURIComponent(token)}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': fileBuf.length
        }
      }, fileBuf);

      if (uploadRes.statusCode !== 200) {
        throw new Error(`Failed to upload ${f.name} to LocalSend peer`);
      }

      transferEntry.bytesTransferred += fileBuf.length;
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
    const fileName = path.basename(name || remotePath || 'download.bin');
    const destPath = path.join(this.storageDir, fileName);
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
    for (const entry of this.pendingApprovals.values()) {
      clearTimeout(entry.timer);
    }
    this.pendingApprovals.clear();
    if (this.transferGateway) await this.transferGateway.stop();
    if (this.localsendGateway) await this.localsendGateway.stop();
    if (this.controlServer) {
      await new Promise((resolve) => this.controlServer.close(resolve));
    }
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
