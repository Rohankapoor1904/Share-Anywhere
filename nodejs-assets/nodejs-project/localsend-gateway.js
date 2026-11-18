const http = require('http');
const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOCALSEND_PORT = 53317;
const MULTICAST_ADDR = '224.0.0.167';

class LocalSendGateway {
  /**
   * @param {object} [options]
   * @param {number} [options.port=53317]
   * @param {string} [options.storageDir]
   * @param {string} [options.alias='LocalShare Device']
   * @param {string} [options.deviceType='mobile']
   * @param {string} [options.fingerprint]
   * @param {boolean} [options.enableMulticast]
   * @param {(peer: object) => void} [options.onPeerFound]
   * @param {(req: object) => Promise<{ accepted: boolean }>} [options.onUploadRequest]
   */
  constructor(options = {}) {
    this.port = options.port !== undefined ? options.port : LOCALSEND_PORT;
    this.storageDir = options.storageDir || path.join(__dirname, 'temp_storage');
    this.alias = options.alias || 'LocalShare Device';
    this.deviceType = options.deviceType || 'mobile';
    this.fingerprint = options.fingerprint || crypto.randomBytes(16).toString('hex');
    this.enableMulticast = options.enableMulticast !== undefined ? options.enableMulticast : (this.port !== 0);
    this.onPeerFound = options.onPeerFound || (() => {});
    this.onUploadRequest = options.onUploadRequest || (async () => ({ accepted: true }));

    this.httpServer = null;
    this.udpSocket = null;
    this.sessions = new Map();

    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  /**
   * Start LocalSend HTTP server and multicast listener.
   */
  async start() {
    await this.startHttpServer();
    if (this.enableMulticast) {
      try {
        this.startMulticast();
      } catch {
        // Multicast may fail on restricted platforms or loopback test environments; HTTP is primary
      }
    }
  }

  /**
   * Stop LocalSend servers.
   */
  async stop() {
    if (this.httpServer) {
      await new Promise((resolve) => this.httpServer.close(resolve));
    }
    if (this.udpSocket) {
      try {
        this.udpSocket.close();
      } catch (err) {
        // UDP socket might already be closed
      }
    }
  }

  startHttpServer() {
    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer((req, res) => this.handleHttp(req, res));
      this.httpServer.on('error', reject);
      this.httpServer.listen(this.port, '0.0.0.0', () => {
        resolve();
      });
    });
  }

  startMulticast() {
    this.udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    this.udpSocket.on('message', (msg, rinfo) => {
      try {
        const payload = JSON.parse(msg.toString('utf8'));
        if (payload.alias && payload.fingerprint !== this.fingerprint) {
          this.onPeerFound({
            deviceId: payload.fingerprint || rinfo.address,
            displayName: payload.alias,
            address: rinfo.address,
            port: payload.port || LOCALSEND_PORT,
            platform: 'localsend',
            fingerprint: payload.fingerprint,
            protocolVersion: 2
          });
        }
      } catch (e) {
        // Non-JSON UDP packet
      }
    });

    this.udpSocket.bind(this.port, () => {
      try {
        this.udpSocket.setBroadcast(true);
        this.udpSocket.addMembership(MULTICAST_ADDR);
      } catch (_err) {
        // Interface may not support multicast membership; broadcast remains active
      }
    });
  }

  /**
   * Broadcast LocalSend presence announcement over UDP multicast and broadcast.
   */
  broadcastAnnouncement() {
    if (!this.udpSocket) return;

    const message = JSON.stringify({
      alias: this.alias,
      version: '2.2',
      deviceModel: 'LocalShare',
      deviceType: this.deviceType,
      fingerprint: this.fingerprint,
      port: this.port,
      protocol: 'http',
      download: true,
      announcement: true
    });

    // Send to multicast group
    this.udpSocket.send(message, 0, message.length, this.port, MULTICAST_ADDR);

    // Also send to local broadcast address for routers with multicast filtering
    try {
      this.udpSocket.send(message, 0, message.length, this.port, '255.255.255.255');
    } catch (_err) {
      // Broadcast send fallback
    }
  }

  announcePresence() {
    this.broadcastAnnouncement();
  }

  async handleHttp(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const method = req.method.toUpperCase();
    const pathname = url.pathname;

    try {
      if (pathname === '/api/localsend/v2/info' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          alias: this.alias,
          version: '2.2',
          deviceModel: 'LocalShare Client',
          deviceType: this.deviceType,
          fingerprint: this.fingerprint,
          port: this.port,
          protocol: 'http',
          download: true
        }));
        return;
      }

      if (pathname === '/api/localsend/v2/register' && method === 'POST') {
        const body = await this.readJsonBody(req);
        this.onPeerFound({
          deviceId: body.fingerprint || req.socket.remoteAddress,
          displayName: body.alias || 'LocalSend Peer',
          address: req.socket.remoteAddress,
          port: body.port || LOCALSEND_PORT,
          platform: 'localsend',
          fingerprint: body.fingerprint,
          protocolVersion: 2
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      if (pathname === '/api/localsend/v2/prepare-upload' && method === 'POST') {
        const body = await this.readJsonBody(req);
        const evalRes = await this.onUploadRequest(body);
        if (!evalRes.accepted) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Transfer rejected' }));
          return;
        }

        const sessionId = crypto.randomBytes(8).toString('hex');
        const tokenMap = {};
        const filesObj = body.files || {};

        for (const fileId of Object.keys(filesObj)) {
          tokenMap[fileId] = crypto.randomBytes(16).toString('hex');
        }

        this.sessions.set(sessionId, {
          info: body.info,
          files: filesObj,
          tokens: tokenMap,
          createdAt: Date.now()
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          sessionId,
          files: tokenMap
        }));
        return;
      }

      if (pathname === '/api/localsend/v2/upload' && method === 'POST') {
        const sessionId = url.searchParams.get('sessionId');
        const fileId = url.searchParams.get('fileId');
        const token = url.searchParams.get('token');

        const session = this.sessions.get(sessionId);
        if (!session || session.tokens[fileId] !== token) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid sessionId or token' }));
          return;
        }

        const fileMeta = session.files[fileId] || { fileName: `${fileId}.bin` };
        const destPath = path.join(this.storageDir, fileMeta.fileName || `${fileId}.bin`);
        const fileStream = fs.createWriteStream(destPath);

        req.pipe(fileStream);

        fileStream.on('finish', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', fileId }));
        });

        fileStream.on('error', (err) => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        });
        return;
      }

      if (pathname === '/api/localsend/v2/cancel' && method === 'POST') {
        const sessionId = url.searchParams.get('sessionId');
        if (sessionId) {
          this.sessions.delete(sessionId);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Endpoint not found' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  readJsonBody(req) {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
      });
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch (err) {
          reject(new Error(`Invalid JSON: ${err.message}`));
        }
      });
      req.on('error', reject);
    });
  }
}

module.exports = {
  LocalSendGateway,
  LOCALSEND_PORT
};
