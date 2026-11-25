const http = require('http');
const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fsService = require('./fs-service');

const LOCALSEND_PORT = 53317;
const MAX_JSON_BODY_BYTES = 4 * 1024 * 1024;

/**
 * Report an expected, non-fatal network error (multicast unsupported, a stray
 * UDP packet). Printed only with LOCALSHARE_DEBUG so normal operation stays quiet.
 * @param {string} context
 * @param {any} err
 */
function logIgnored(context, err) {
  if (process.env.LOCALSHARE_DEBUG) {
    console.warn(`[LocalSendGateway] ${context}:`, err && err.message ? err.message : err);
  }
}
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
   * @param {(fileInfo: object) => void} [options.onFileReceived]
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
    this.onFileReceived = options.onFileReceived || null;

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
      } catch (err) {
        // Multicast may fail on restricted platforms or loopback test environments; HTTP is primary
        logIgnored('multicast start', err);
      }
    }
  }

  /**
   * Stop LocalSend servers.
   */
  async stop() {
    if (this.httpServer) {
      const server = this.httpServer;
      await new Promise((resolve) => {
        server.close(() => resolve());
        // Don't let an open upload or keep-alive socket block shutdown.
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      });
    }
    if (this.udpSocket) {
      try {
        this.udpSocket.close();
      } catch (err) {
        // UDP socket might already be closed
        logIgnored('udp close', err);
      }
    }
  }

  startHttpServer() {
    return new Promise((resolve, reject) => {
      // requestTimeout 0: a single large upload may legitimately take longer than 5 minutes.
      this.httpServer = http.createServer({ requestTimeout: 0 }, (req, res) => {
        this.handleHttp(req, res).catch((err) => {
          console.error('[LocalSendGateway] Unhandled request error:', err);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
          } else {
            res.destroy();
          }
        });
      });
      this.httpServer.on('error', (err) => {
        if (/** @type {any} */ (err).code === 'EADDRINUSE' && this.port === LOCALSEND_PORT) {
          this.port = 53327;
          try {
            this.httpServer.listen(this.port, '0.0.0.0', () => resolve(undefined));
            return;
          } catch (retryErr) {
            reject(retryErr);
            return;
          }
        }
        reject(err);
      });
      this.httpServer.listen(this.port, '0.0.0.0', () => {
        resolve();
      });
    });
  }

  startMulticast() {
    this.udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    // Without a listener, a socket error (port in use, send failure) crashes the process.
    this.udpSocket.on('error', (err) => {
      console.warn('[LocalSendGateway] UDP socket error:', err.message);
    });

    this.udpSocket.on('message', (msg, rinfo) => {
      try {
        const payload = JSON.parse(msg.toString('utf8'));
        const isSelf = payload.fingerprint === this.fingerprint || payload.alias === this.alias;
        if (payload.alias && !isSelf) {
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
      } catch (err) {
        logIgnored('non-JSON UDP packet', err);
      }
    });

    this.udpSocket.bind(this.port, () => {
      try {
        this.udpSocket.setBroadcast(true);
        // Do not receive our own multicast announcements back as a peer
        this.udpSocket.setMulticastLoopback(false);
        this.udpSocket.addMembership(MULTICAST_ADDR);
      } catch (err) {
        // Interface may not support multicast membership; broadcast remains active
        logIgnored('multicast membership', err);
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
    } catch (err) {
      logIgnored('broadcast send', err);
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
        const expectedToken = session && fileId && Object.prototype.hasOwnProperty.call(session.tokens, fileId)
          ? session.tokens[fileId]
          : null;
        if (!expectedToken || !token || expectedToken !== token) {
          req.resume();
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid sessionId or token' }));
          return;
        }
        // Upload tokens are single-use.
        delete session.tokens[fileId];

        // The sender controls fileName: keep only a safe base name so it cannot
        // climb out of the storage folder, and never overwrite an existing file.
        const fileMeta = session.files[fileId] || {};
        const fallbackName = fsService.sanitizeFileName(`${fileId}.bin`, 'upload.bin');
        const safeName = fsService.sanitizeFileName(fileMeta.fileName, fallbackName);
        const destPath = fsService.uniquePath(path.join(this.storageDir, safeName));
        const fileStream = fs.createWriteStream(destPath, { highWaterMark: 1024 * 1024 });

        req.on('error', (err) => fileStream.destroy(err));
        req.pipe(fileStream);

        fileStream.on('finish', () => {
          if (this.onFileReceived) {
            let fileSize = 0;
            try {
              fileSize = fs.statSync(destPath).size;
            } catch (err) {
              console.warn('[LocalSendGateway] Could not stat received file:', err.message);
            }
            this.onFileReceived({
              sessionId,
              fileId,
              fileName: path.basename(destPath),
              savedPath: destPath,
              fileSize
            });
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', fileId }));
        });

        fileStream.on('error', (err) => {
          req.unpipe(fileStream);
          req.resume();
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
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
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.writeHead(err.statusCode || 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  readJsonBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      let settled = false;
      req.on('data', (chunk) => {
        if (settled) return;
        size += chunk.length;
        if (size > MAX_JSON_BODY_BYTES) {
          settled = true;
          req.resume();
          reject(Object.assign(new Error('Request body too large'), { statusCode: 413 }));
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (settled) return;
        settled = true;
        const data = Buffer.concat(chunks).toString('utf8');
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch (err) {
          reject(Object.assign(new Error(`Invalid JSON: ${err.message}`), { statusCode: 400 }));
        }
      });
      req.on('error', (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      });
    });
  }
}

module.exports = {
  LocalSendGateway,
  LOCALSEND_PORT
};
