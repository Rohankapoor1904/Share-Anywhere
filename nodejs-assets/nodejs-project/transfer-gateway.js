const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const protocol = require('./protocol');
const fsService = require('./fs-service');
const {
  DeviceInfo,
  SessionResponse,
  ChunkAck,
  CommitResponse
} = require('./models');

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

/**
 * LocalShare Transfer Server Gateway
 * Serves the wire protocol specified in §6.
 */
class TransferGateway {
  /**
   * @param {object} [options]
   * @param {number} [options.port=53318]
   * @param {string} [options.storageDir]
   * @param {object} [options.tls] - { key: Buffer | string, cert: Buffer | string }
   * @param {DeviceInfo} [options.selfDevice]
   * @param {(sessionReq: object) => Promise<{ accepted: boolean, reason?: string }>} [options.onSessionRequest]
   * @param {string} [options.browseRoot] - Root directory exposed to remote /v1/fs/* clients.
   * @param {(progress: object) => void} [options.onProgress]
   * @param {(file: object) => void} [options.onFileReceived]
   * @param {(clip: object) => void} [options.onClipboardReceived]
   * @param {(peer: object) => void} [options.onLiveConnected]
   * @param {() => void} [options.onLiveDisconnected]
   * @param {{ readText: () => string, writeText: (text: string) => boolean }} [options.clipboardAdapter]
   */
  constructor(options = {}) {
    this.port = typeof options.port === 'number' ? options.port : protocol.kDefaultPort;
    this.storageDir = options.storageDir || path.join(__dirname, 'temp_storage');
    this.tls = options.tls || null;
    this.selfDevice = options.selfDevice || new DeviceInfo({
      deviceId: 'local-node-gateway',
      displayName: 'Node Gateway',
      port: this.port
    });
    this.onSessionRequest = options.onSessionRequest || (async () => ({ accepted: true, reason: undefined }));
    this.browseRoot = options.browseRoot || fsService.getDefaultRoot();
    this.onProgress = options.onProgress || null;
    this.onFileReceived = options.onFileReceived || null;
    this.onClipboardReceived = options.onClipboardReceived || null;
    this.onLiveConnected = options.onLiveConnected || null;
    this.onLiveDisconnected = options.onLiveDisconnected || null;
    this.clipboardAdapter = options.clipboardAdapter || null;

    this.activeSessions = new Map();
    this.sessionMetrics = new Map();
    this.connectedPeer = null;
    this.lastClipboardHash = null;
    this.server = null;

    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  /**
   * Start the HTTP / HTTPS server.
   * @returns {Promise<{ port: number, address: string }>}
   */
  start() {
    return new Promise((resolve, reject) => {
      const handler = (req, res) => this.handleRequest(req, res);

      if (this.tls) {
        this.server = https.createServer(this.tls, handler);
      } else {
        this.server = http.createServer(handler);
      }

      this.server.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && this.port === protocol.kDefaultPort) {
          // If 53318 is temporarily held by a dynamic OS connection, fallback to 53328
          this.port = 53328;
          try {
            this.server.listen(this.port, '0.0.0.0', () => {
              const addr = this.server.address();
              this.port = typeof addr === 'object' && addr ? addr.port : this.port;
              if (this.selfDevice) this.selfDevice.port = this.port;
              resolve({
                port: this.port,
                address: typeof addr === 'object' && addr ? addr.address : '0.0.0.0'
              });
            });
            return;
          } catch (retryErr) {
            reject(retryErr);
            return;
          }
        }
        reject(err);
      });

      this.server.listen(this.port, '0.0.0.0', () => {
        const addr = this.server.address();
        this.port = typeof addr === 'object' && addr ? addr.port : this.port;
        if (this.selfDevice) this.selfDevice.port = this.port;
        resolve({
          port: this.port,
          address: typeof addr === 'object' && addr ? addr.address : '0.0.0.0'
        });
      });
    });
  }

  /**
   * Stop the server and clean up.
   * @returns {Promise<void>}
   */
  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Central request router.
   */
  async handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const method = req.method.toUpperCase();
    const pathname = url.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (pathname === '/v1/info' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.selfDevice.toJSON()));
        return;
      }

      if (pathname === '/v1/session' && method === 'POST') {
        const body = await this.readJsonBody(req);
        const sessionReq = body;
        const evaluation = await this.onSessionRequest(sessionReq);

        const resumeMap = {};
        if (evaluation.accepted && Array.isArray(sessionReq.files)) {
          let totalSessionBytes = 0;
          let firstFileName = '';
          for (const file of sessionReq.files) {
            totalSessionBytes += (file.fileSize || 0);
            if (!firstFileName && file.fileName) firstFileName = file.fileName;
            const partPath = path.join(this.storageDir, `${file.fileId}${protocol.kPartialSuffix}`);
            if (fs.existsSync(partPath)) {
              const stat = fs.statSync(partPath);
              resumeMap[file.fileId] = stat.size;
            } else {
              resumeMap[file.fileId] = 0;
            }
          }

          this.activeSessions.set(sessionReq.sessionId, {
            ...sessionReq,
            createdAt: Date.now()
          });

          this.sessionMetrics.set(sessionReq.sessionId, {
            startTime: Date.now(),
            lastProgressTime: 0,
            transferredBytes: 0,
            totalBytes: totalSessionBytes,
            fileName: firstFileName || 'File'
          });
        }

        const resp = new SessionResponse({
          sessionId: sessionReq.sessionId,
          accepted: evaluation.accepted,
          reason: evaluation.reason || null,
          resume: resumeMap
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(resp.toJSON()));
        return;
      }

      if (pathname === '/v1/chunk' && method === 'PUT') {
        const sessionId = req.headers[protocol.kHeaderSessionId] || req.headers['x-session-id'];
        const fileId = req.headers['x-file-id'];
        const offset = parseInt(req.headers['x-offset'] || '0', 10);

        if (!sessionId || !fileId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing required session or file headers' }));
          return;
        }

        const partPath = path.join(this.storageDir, `${fileId}${protocol.kPartialSuffix}`);
        const writeStream = fs.createWriteStream(partPath, {
          flags: offset === 0 ? 'w' : 'r+',
          start: offset
        });

        let bytesWritten = 0;
        let metrics = this.sessionMetrics.get(sessionId);
        if (!metrics) {
          metrics = {
            startTime: Date.now(),
            lastProgressTime: 0,
            transferredBytes: 0,
            totalBytes: 0,
            fileName: 'File'
          };
          this.sessionMetrics.set(sessionId, metrics);
        }

        req.on('data', (chunk) => {
          bytesWritten += chunk.length;
          metrics.transferredBytes += chunk.length;
          writeStream.write(chunk);

          const now = Date.now();
          if (this.onProgress && now - metrics.lastProgressTime >= 150) {
            metrics.lastProgressTime = now;
            const elapsed = (now - metrics.startTime) / 1000;
            const speed = elapsed > 0 ? metrics.transferredBytes / elapsed : 0;
            this.onProgress({
              sessionId,
              fileId,
              transferredBytes: metrics.transferredBytes,
              totalBytes: metrics.totalBytes,
              speed,
              fileName: metrics.fileName,
              direction: 'receive',
              status: 'in_progress'
            });
          }
        });

        req.on('end', () => {
          writeStream.end(() => {
            if (this.onProgress) {
              const elapsed = (Date.now() - metrics.startTime) / 1000;
              const speed = elapsed > 0 ? metrics.transferredBytes / elapsed : 0;
              this.onProgress({
                sessionId,
                fileId,
                transferredBytes: metrics.transferredBytes,
                totalBytes: metrics.totalBytes,
                speed,
                fileName: metrics.fileName,
                direction: 'receive',
                status: 'in_progress'
              });
            }
            const ack = new ChunkAck({
              sessionId,
              fileId,
              offset,
              received: bytesWritten
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(ack.toJSON()));
          });
        });

        req.on('error', (err) => {
          writeStream.destroy();
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        });
        return;
      }

      if (pathname === '/v1/file/commit' && method === 'POST') {
        const body = await this.readJsonBody(req);
        const { sessionId, fileId, sha256 } = body;

        const partPath = path.join(this.storageDir, `${fileId}${protocol.kPartialSuffix}`);
        if (!fs.existsSync(partPath)) {
          const resp = new CommitResponse({
            sessionId,
            fileId,
            verified: false,
            errorMessage: 'Partial file not found on disk'
          });
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(resp.toJSON()));
          return;
        }

        // Verify streaming SHA-256
        const actualSha256 = await this.computeFileSha256(partPath);
        const verified = actualSha256.toLowerCase() === (sha256 || '').toLowerCase();

        if (verified) {
          const session = this.activeSessions.get(sessionId);
          const fileEntry = session && session.files ? session.files.find((f) => f.fileId === fileId) : null;
          // Strip path components so an advertised file name cannot escape the storage dir.
          const advertised = fileEntry && fileEntry.fileName ? path.basename(fileEntry.fileName) : '';
          const targetName = advertised && advertised !== '.' && advertised !== '..' ? advertised : `${fileId}.bin`;
          const finalPath = path.join(this.storageDir, targetName);

          // Atomic rename from partial to final
          fs.renameSync(partPath, finalPath);
          const stat = fs.statSync(finalPath);

          if (this.onFileReceived) {
            this.onFileReceived({
              sessionId,
              fileId,
              fileName: targetName,
              savedPath: finalPath,
              fileSize: stat.size,
              totalBytes: stat.size
            });
          }

          const resp = new CommitResponse({
            sessionId,
            fileId,
            verified: true,
            savedPath: finalPath,
            errorMessage: null
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(resp.toJSON()));
        } else {
          const resp = new CommitResponse({
            sessionId,
            fileId,
            verified: false,
            savedPath: null,
            errorMessage: `Integrity check failed: expected ${sha256}, actual ${actualSha256}`
          });
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(resp.toJSON()));
        }
        return;
      }

      if (pathname === '/v1/cancel' && method === 'POST') {
        const body = await this.readJsonBody(req);
        const { sessionId } = body;
        this.activeSessions.delete(sessionId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, sessionId }));
        return;
      }

      if (pathname === '/v1/files' && method === 'GET') {
        const files = fs.readdirSync(this.storageDir)
          .filter((f) => !f.endsWith(protocol.kPartialSuffix))
          .map((f) => {
            const stat = fs.statSync(path.join(this.storageDir, f));
            return {
              id: f,
              name: f,
              size: stat.size,
              lastModified: stat.mtimeMs
            };
          });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(files));
        return;
      }

      if (pathname === '/v1/files/download' && method === 'GET') {
        const relativePath = url.searchParams.get('path');
        if (!relativePath) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing path parameter' }));
          return;
        }

        // Prevent path traversal
        const safePath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, '');
        const fullPath = path.join(this.storageDir, safePath);

        if (!fs.existsSync(fullPath)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'File not found' }));
          return;
        }

        const stat = fs.statSync(fullPath);
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': stat.size
        });

        fs.createReadStream(fullPath).pipe(res);
        return;
      }

      if (pathname === '/v1/fs/list' && method === 'GET') {
        const requested = url.searchParams.get('path') || '';
        try {
          const listing = fsService.listDirectory(this.browseRoot, requested);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(listing));
        } catch (err) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      if (pathname === '/v1/fs/download' && method === 'GET') {
        const requested = url.searchParams.get('path');
        if (!requested) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing path parameter' }));
          return;
        }
        const target = fsService.resolvePath(this.browseRoot, requested);
        if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'File not found' }));
          return;
        }
        const stat = fs.statSync(target);
        const fileName = encodeURIComponent(path.basename(target));
        const mimeType = fsService.getMimeType(target);
        const range = req.headers.range;

        if (range) {
          const match = /bytes=(\d*)-(\d*)/.exec(range);
          let start = match && match[1] ? parseInt(match[1], 10) : 0;
          let end = match && match[2] ? parseInt(match[2], 10) : stat.size - 1;
          if (Number.isNaN(start) || start < 0) start = 0;
          if (Number.isNaN(end) || end >= stat.size) end = stat.size - 1;
          if (start > end) {
            res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
            res.end();
            return;
          }
          const chunkSize = end - start + 1;
          res.writeHead(206, {
            'Content-Type': mimeType,
            'Content-Length': chunkSize,
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Disposition': `attachment; filename="${fileName}"`
          });
          fs.createReadStream(target, { start, end }).pipe(res);
          return;
        }

        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': stat.size,
          'Accept-Ranges': 'bytes',
          'Content-Disposition': `attachment; filename="${fileName}"`
        });
        fs.createReadStream(target).pipe(res);
        return;
      }

      if (pathname === '/v1/fs/stream' && method === 'GET') {
        const requested = url.searchParams.get('path');
        if (!requested) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing path parameter' }));
          return;
        }
        const target = fsService.resolvePath(this.browseRoot, requested);
        if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'File not found' }));
          return;
        }
        this.streamFile(req, res, target);
        return;
      }

      if (pathname === '/v1/fs/copy' && method === 'POST') {
        const body = await this.readJsonBody(req);
        try {
          const newPath = fsService.copyEntry(body.sourcePath, body.destinationPath);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, newPath }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      if (pathname === '/v1/fs/delete' && method === 'POST') {
        const body = await this.readJsonBody(req);
        try {
          const deletedPath = fsService.deleteEntry(body.path);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, deletedPath }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      if (pathname === '/v1/fs/categories' && method === 'GET') {
        const type = url.searchParams.get('type') || 'photos';
        const limit = parseInt(url.searchParams.get('limit') || '60', 10) || 60;
        const offset = parseInt(url.searchParams.get('offset') || '0', 10) || 0;
        try {
          const result = fsService.listCategory(type, limit, offset, this.browseRoot);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      if (pathname === '/v1/fs/search' && method === 'GET') {
        const q = url.searchParams.get('q') || '';
        try {
          const results = fsService.searchFiles(q, 50, 4, this.browseRoot);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ query: q, count: results.length, entries: results }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      if (pathname === '/v1/fs/thumbnail' && method === 'GET') {
        const requested = url.searchParams.get('path');
        if (!requested) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing path parameter' }));
          return;
        }
        const target = fsService.resolvePath(this.browseRoot, requested);
        if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'File not found' }));
          return;
        }
        res.setHeader('Cache-Control', 'public, max-age=300');
        this.streamFile(req, res, target);
        return;
      }

      if (pathname === '/v1/telemetry' && method === 'GET') {
        const data = fsService.getTelemetry();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
        return;
      }

      if (pathname === '/v1/live/connect' && method === 'POST') {
        const body = await this.readJsonBody(req);
        let resolvedIp = body.address;
        const remoteIp = req.socket && req.socket.remoteAddress
          ? req.socket.remoteAddress.replace(/^::ffff:/, '')
          : '';
        if (!resolvedIp || resolvedIp === '127.0.0.1' || resolvedIp === '0.0.0.0') {
          resolvedIp = remoteIp || resolvedIp || '127.0.0.1';
        }
        const peerObj = {
          ...body,
          address: resolvedIp,
          port: body.port || protocol.kDefaultPort
        };
        this.connectedPeer = peerObj;
        if (this.onLiveConnected) {
          try {
            this.onLiveConnected(peerObj);
          } catch (e) {
            // callback non-fatal
          }
        }
        const currentClipboard = this.clipboardAdapter
          ? this.clipboardAdapter.readText()
          : getSystemClipboard();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          connected: true,
          device: this.selfDevice.toJSON(),
          currentClipboard
        }));
        return;
      }

      if (pathname === '/v1/live/disconnect' && method === 'POST') {
        this.connectedPeer = null;
        if (this.onLiveDisconnected) {
          try {
            this.onLiveDisconnected();
          } catch (e) {
            // callback non-fatal
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ disconnected: true }));
        return;
      }

      if (pathname === '/v1/live/ping' && (method === 'GET' || method === 'POST')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', pong: true, timestamp: Date.now() }));
        return;
      }

      if (pathname === '/v1/clipboard' && method === 'GET') {
        const text = this.clipboardAdapter
          ? this.clipboardAdapter.readText()
          : getSystemClipboard();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text, timestamp: Date.now() }));
        return;
      }

      if (pathname === '/v1/clipboard' && method === 'POST') {
        const body = await this.readJsonBody(req);
        const text = typeof body.text === 'string' ? body.text : '';
        const incomingHash = body.hash || crypto.createHash('sha256').update(text).digest('hex');
        if (this.lastClipboardHash && incomingHash === this.lastClipboardHash) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, ignored: true }));
          return;
        }
        this.lastClipboardHash = incomingHash;
        const written = this.clipboardAdapter
          ? this.clipboardAdapter.writeText(text)
          : setSystemClipboard(text);
        if (this.onClipboardReceived) {
          this.onClipboardReceived({ text, hash: incomingHash });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: !!written }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  /**
   * Stream a file with HTTP Range (206) support so large media can seek.
   * @param {import('http').IncomingMessage} req
   * @param {import('http').ServerResponse} res
   * @param {string} target
   */
  streamFile(req, res, target) {
    const stat = fs.statSync(target);
    const total = stat.size;
    const mimeType = fsService.getMimeType(target);
    const range = req.headers.range;

    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      let start = match && match[1] ? parseInt(match[1], 10) : 0;
      let end = match && match[2] ? parseInt(match[2], 10) : total - 1;
      if (Number.isNaN(start) || start < 0) start = 0;
      if (Number.isNaN(end) || end >= total) end = total - 1;
      if (start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${total}` });
        res.end();
        return;
      }
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        'Content-Type': mimeType,
        'Content-Length': chunkSize,
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes'
      });
      fs.createReadStream(target, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      'Content-Type': mimeType,
      'Content-Length': total,
      'Accept-Ranges': 'bytes'
    });
    fs.createReadStream(target).pipe(res);
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
          reject(new Error(`Malformed JSON body: ${err.message}`));
        }
      });
      req.on('error', reject);
    });
  }

  computeFileSha256(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (d) => hash.update(d));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }
}

module.exports = {
  TransferGateway
};
