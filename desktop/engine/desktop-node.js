const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { exec, execFile } = require('child_process');

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

function getPrimaryLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
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

    this.transferGateway = null;
    this.localsendGateway = null;
    this.controlServer = null;
  }

  async start() {
    // 1. Start Native Transfer Gateway (Port 53318)
    this.transferGateway = new TransferGateway({
      port: TRANSFER_PORT,
      storageDir: this.storageDir,
      selfDevice: this.selfDevice,
      onSessionRequest: async (req) => {
        this.broadcastEvent('session_request', req);
        return { accepted: true };
      }
    });
    await this.transferGateway.start();

    // 2. Start LocalSend Gateway & Multicast (Port 53317)
    this.localsendGateway = new LocalSendGateway({
      port: LOCALSEND_PORT,
      storageDir: this.storageDir,
      alias: `${this.hostname} (PC)`,
      deviceType: 'desktop',
      fingerprint: this.fingerprint,
      onPeerFound: (peer) => this.handlePeerFound(peer),
      onUploadRequest: async (req) => {
        this.broadcastEvent('upload_request', req);
        return { accepted: true };
      }
    });
    await this.localsendGateway.start();

    // 3. Start Desktop HTTP & Control Server (Port 53319)
    await this.startControlServer();

    // Scan immediately
    this.scanSubnet();

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

  handlePeerFound(peer) {
    if (!peer || !peer.ip) return;
    if (peer.ip === this.localIp && peer.port === LOCALSEND_PORT) return;

    const id = peer.fingerprint || `${peer.ip}:${peer.port}`;
    const existing = this.peers.get(id);

    const updated = {
      deviceId: id,
      displayName: peer.alias || peer.displayName || 'Unknown Peer',
      address: peer.ip,
      port: peer.port || 53317,
      platform: peer.deviceType || 'mobile',
      fingerprint: peer.fingerprint || '',
      lastSeen: Date.now()
    };

    this.peers.set(id, updated);
    if (!existing) {
      this.broadcastEvent('peer_found', updated);
    }
  }

  scanSubnet() {
    this.isScanning = true;
    this.broadcastEvent('scan_state', { scanning: true });

    if (this.localsendGateway && typeof this.localsendGateway.announcePresence === 'function') {
      this.localsendGateway.announcePresence();
    }

    setTimeout(() => {
      this.isScanning = false;
      this.broadcastEvent('scan_state', { scanning: false });
    }, 4000);
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
            address: body.ip,
            port: parseInt(body.port, 10) || 53318,
            platform: 'device',
            fingerprint: body.fingerprint || '',
            lastSeen: Date.now()
          };
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

    return new Promise((resolve) => {
      this.controlServer.listen(DESKTOP_HTTP_PORT, '0.0.0.0', () => {
        resolve();
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
    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
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
        path: '/v1/commit',
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

  async stop() {
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
