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

const TOKEN_HEADER = 'x-localshare-token';
const MAX_JSON_BODY_BYTES = 4 * 1024 * 1024;
// Bigger write buffer so the socket is paused less often under fast senders.
const WRITE_BUFFER_BYTES = 1024 * 1024;
const MAX_PAIRING_FAILURES = 5;
const PAIRING_LOCKOUT_MS = 5 * 60 * 1000;
const SAFE_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
const TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/;
/** Remembered devices kept at most; the least recently seen is dropped first. */
const MAX_PAIRED_DEVICES = 20;

/**
 * Tokens are stored and compared as SHA-256 hashes, so the paired-devices file
 * on disk never contains a usable credential.
 * @param {string} token
 * @returns {string}
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * Routes a peer may call before it holds an access token. Every other /v1/ route
 * (filesystem, clipboard, telemetry, received-file listing) requires one.
 * Transfers are gated separately: /v1/session asks the user, and chunk/commit
 * calls must belong to a session the user accepted.
 */
const PUBLIC_ROUTES = new Set([
  '/v1/info',
  '/v1/session',
  '/v1/chunk',
  '/v1/stream',
  '/v1/file/commit',
  '/v1/cancel',
  '/v1/live/connect',
  '/v1/live/ping'
]);

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
 * True for ids that are safe inside a file name (no separators, not "." or "..").
 * @param {any} value
 * @returns {boolean}
 */
function isSafeId(value) {
  return typeof value === 'string' && SAFE_ID_PATTERN.test(value) && !/^\.+$/.test(value);
}

/**
 * Write a JSON response, or drop the connection if a response is already on the wire.
 * @param {import('http').ServerResponse} res
 * @param {number} status
 * @param {object} payload
 * @param {Record<string, string>} [extraHeaders]
 */
function sendJson(res, status, payload, extraHeaders = {}) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.writeHead(status, { 'Content-Type': 'application/json', ...extraHeaders });
  res.end(JSON.stringify(payload));
}

/**
 * Report a failing host callback without breaking the request that triggered it.
 * @param {string} name
 * @param {any} err
 */
function logCallbackError(name, err) {
  console.warn(`[TransferGateway] ${name} callback failed:`, err && err.message ? err.message : err);
}

/**
 * Read the operating system clipboard as text.
 * @returns {string}
 */
function getSystemClipboard() {
  try {
    if (process.platform === 'win32') {
      return execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Get-Clipboard'], {
        encoding: 'utf8',
        timeout: 4000,
        windowsHide: true
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
   * @param {(sessionReq: object, meta?: { paired: boolean, pairedDevice: { deviceId: string, displayName: string, platform: string } | null }) => Promise<{ accepted: boolean, reason?: string }>} [options.onSessionRequest]
   * @param {string} [options.browseRoot] - Root directory exposed to remote /v1/fs/* clients.
   * @param {boolean} [options.exposeDrives=false] - Also share every drive root (the '__ROOT__' view) with paired peers.
   * @param {string} [options.pairingCode] - Code shown on this device; a peer that presents it on /v1/live/connect is paired.
   * @param {(peer: object) => Promise<{ accepted: boolean }>} [options.onConnectRequest] - Asks the user to approve a peer that has no code.
   * @param {Array<object>} [options.pairedDevices] - Remembered pairings from an earlier run ({ tokenHash, deviceId, displayName, platform, pairedAt, lastSeen }).
   * @param {(devices: Array<object>) => void} [options.onPairedDevicesChanged] - Called with the full list whenever it changes, to persist it.
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
    this.exposeDrives = options.exposeDrives === true;
    this.pairingCode = options.pairingCode ? String(options.pairingCode) : null;
    this.onConnectRequest = options.onConnectRequest || null;
    this.onPairedDevicesChanged = options.onPairedDevicesChanged || null;
    /**
     * Keyed by SHA-256 of the token. `remembered` records survive restarts.
     * @type {Map<string, { deviceId: string, displayName: string, platform: string, issuedAt: number, lastSeen: number, remembered: boolean }>}
     */
    this.accessTokens = new Map();
    for (const rec of Array.isArray(options.pairedDevices) ? options.pairedDevices : []) {
      if (!rec || typeof rec.tokenHash !== 'string' || !TOKEN_HASH_PATTERN.test(rec.tokenHash)) continue;
      this.accessTokens.set(rec.tokenHash, {
        deviceId: String(rec.deviceId || ''),
        displayName: String(rec.displayName || ''),
        platform: String(rec.platform || ''),
        issuedAt: Number(rec.pairedAt) || Date.now(),
        lastSeen: Number(rec.lastSeen) || Number(rec.pairedAt) || Date.now(),
        remembered: true
      });
    }
    /** @type {Map<string, { count: number, last: number }>} */
    this.pairingFailures = new Map();
    this.onProgress = options.onProgress || null;
    this.onFileReceived = options.onFileReceived || null;
    this.onClipboardReceived = options.onClipboardReceived || null;
    this.onLiveConnected = options.onLiveConnected || null;
    this.onLiveDisconnected = options.onLiveDisconnected || null;
    this.clipboardAdapter = options.clipboardAdapter || null;

    this.activeSessions = new Map();
    this.sessionMetrics = new Map();
    /** @type {Set<fs.WriteStream>} */
    this.activeWriteStreams = new Set();
    /** @type {Map<string, { sha256: string, bytes: number }>} SHA-256 computed while a file streamed in. */
    this.streamDigests = new Map();
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
      const handler = (req, res) => {
        this.handleRequest(req, res).catch((err) => {
          console.error('[TransferGateway] Unhandled request error:', err);
          sendJson(res, 500, { error: 'Internal server error' });
        });
      };

      if (this.tls) {
        this.server = https.createServer({ ...this.tls, requestTimeout: 0 }, handler);
      } else {
        this.server = http.createServer({ requestTimeout: 0 }, handler);
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
      const waitStreamsClosed = () => {
        if (this.activeWriteStreams.size === 0) {
          resolve();
          return;
        }
        const pending = Array.from(this.activeWriteStreams).map((stream) => new Promise((done) => {
          if (stream.closed || stream.destroyed) {
            done();
            return;
          }
          stream.once('close', done);
          stream.end();
        }));
        Promise.all(pending).then(() => resolve());
      };

      if (!this.server) {
        waitStreamsClosed();
        return;
      }
      this.server.close(() => waitStreamsClosed());
      // close() waits for every open connection. Drop keep-alive and in-flight ones
      // (a phone's ping, a half-finished upload, which stays resumable) so the app can exit.
      if (typeof this.server.closeAllConnections === 'function') {
        this.server.closeAllConnections();
      }
    });
  }

  /**
   * Issue an access token that authorizes a peer for the protected /v1/ routes.
   * With `remember`, the pairing is saved (as a hash) and survives restarts; any
   * earlier remembered pairing for the same device is replaced.
   * @param {{ deviceId?: string, displayName?: string, platform?: string }} [peer]
   * @param {{ remember?: boolean }} [options]
   * @returns {string}
   */
  issueAccessToken(peer = {}, options = {}) {
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    const deviceId = String(peer.deviceId || '');
    const remember = options.remember === true;
    if (remember && deviceId) {
      for (const [hash, rec] of this.accessTokens) {
        if (rec.remembered && rec.deviceId === deviceId) this.accessTokens.delete(hash);
      }
    }
    this.accessTokens.set(hashToken(token), {
      deviceId,
      displayName: String(peer.displayName || ''),
      platform: String(peer.platform || ''),
      issuedAt: now,
      lastSeen: now,
      remembered: remember
    });
    if (remember) {
      this.trimPairedDevices();
      this.persistPairedDevices();
    }
    return token;
  }

  /**
   * @param {string} token
   * @returns {boolean}
   */
  hasAccessToken(token) {
    return Boolean(token) && this.accessTokens.has(hashToken(token));
  }

  /**
   * @param {string} token
   * @returns {object|null} The record for a valid token.
   */
  getAccessRecord(token) {
    if (!token) return null;
    return this.accessTokens.get(hashToken(token)) || null;
  }

  /**
   * @param {string} token
   */
  revokeAccessToken(token) {
    const hash = hashToken(token);
    const rec = this.accessTokens.get(hash);
    this.accessTokens.delete(hash);
    if (rec && rec.remembered) this.persistPairedDevices();
  }

  /**
   * Remembered pairings, newest first. `id` is a short handle for forgetting one;
   * the token itself is never exposed.
   * @returns {Array<{ id: string, deviceId: string, displayName: string, platform: string, pairedAt: number, lastSeen: number }>}
   */
  listPairedDevices() {
    const out = [];
    for (const [hash, rec] of this.accessTokens) {
      if (!rec.remembered) continue;
      out.push({
        id: hash.slice(0, 16),
        deviceId: rec.deviceId,
        displayName: rec.displayName,
        platform: rec.platform,
        pairedAt: rec.issuedAt,
        lastSeen: rec.lastSeen
      });
    }
    return out.sort((a, b) => b.lastSeen - a.lastSeen);
  }

  /**
   * Forget a remembered pairing. That device must be approved again to connect.
   * @param {string} id - From listPairedDevices().
   * @returns {object|null} The forgotten record, or null if none matched.
   */
  forgetPairedDevice(id) {
    if (typeof id !== 'string' || !/^[0-9a-f]{16}$/.test(id)) return null;
    for (const [hash, rec] of this.accessTokens) {
      if (rec.remembered && hash.startsWith(id)) {
        this.accessTokens.delete(hash);
        this.persistPairedDevices();
        return rec;
      }
    }
    return null;
  }

  /** Drop the least recently seen remembered pairings beyond the limit. */
  trimPairedDevices() {
    const remembered = [...this.accessTokens].filter(([, rec]) => rec.remembered);
    if (remembered.length <= MAX_PAIRED_DEVICES) return;
    remembered
      .sort((a, b) => a[1].lastSeen - b[1].lastSeen)
      .slice(0, remembered.length - MAX_PAIRED_DEVICES)
      .forEach(([hash]) => this.accessTokens.delete(hash));
  }

  /** Hand the remembered pairings (hashes only) to the host to save. */
  persistPairedDevices() {
    if (!this.onPairedDevicesChanged) return;
    const devices = [];
    for (const [hash, rec] of this.accessTokens) {
      if (!rec.remembered) continue;
      devices.push({
        tokenHash: hash,
        deviceId: rec.deviceId,
        displayName: rec.displayName,
        platform: rec.platform,
        pairedAt: rec.issuedAt,
        lastSeen: rec.lastSeen
      });
    }
    try {
      this.onPairedDevicesChanged(devices);
    } catch (err) {
      logCallbackError('onPairedDevicesChanged', err);
    }
  }

  /**
   * Token presented by the caller: the header, or a `token` query param for
   * media URLs that cannot carry headers (image/video sources, native downloads).
   * @param {import('http').IncomingMessage} req
   * @param {URL} url
   * @returns {string}
   */
  getRequestToken(req, url) {
    const header = req.headers[TOKEN_HEADER];
    if (typeof header === 'string' && header) return header;
    return url.searchParams.get('token') || '';
  }

  /**
   * @param {import('http').IncomingMessage} req
   * @param {URL} url
   * @returns {boolean}
   */
  isAuthorized(req, url) {
    return this.hasAccessToken(this.getRequestToken(req, url));
  }

  /**
   * Folders paired peers may browse, copy within and delete from.
   * @returns {string[]}
   */
  getAllowedRoots() {
    return this.exposeDrives ? [this.browseRoot, ...fsService.getDriveRoots()] : [this.browseRoot];
  }

  /**
   * @param {import('http').IncomingMessage} req
   * @returns {string}
   */
  remoteAddress(req) {
    return ((req.socket && req.socket.remoteAddress) || '').replace(/^::ffff:/, '');
  }

  /**
   * @param {string} ip
   * @returns {boolean}
   */
  isPairingLocked(ip) {
    const entry = this.pairingFailures.get(ip);
    if (!entry) return false;
    if (Date.now() - entry.last > PAIRING_LOCKOUT_MS) {
      this.pairingFailures.delete(ip);
      return false;
    }
    return entry.count >= MAX_PAIRING_FAILURES;
  }

  /**
   * @param {string} ip
   */
  recordPairingFailure(ip) {
    const entry = this.pairingFailures.get(ip) || { count: 0, last: 0 };
    entry.count += 1;
    entry.last = Date.now();
    this.pairingFailures.set(ip, entry);
  }

  /**
   * Resolve a client-supplied path to a readable file inside the shared roots.
   * Answers 403/404 itself and returns null when the file cannot be served.
   * @param {import('http').ServerResponse} res
   * @param {string} requested
   * @returns {string|null}
   */
  resolveReadableFile(res, requested) {
    let target;
    try {
      target = fsService.resolvePath(this.browseRoot, requested, this.getAllowedRoots());
    } catch (err) {
      sendJson(res, 403, { error: err.message });
      return null;
    }
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      sendJson(res, 404, { error: 'File not found' });
      return null;
    }
    return target;
  }

  /**
   * Pipe a file stream to the response; a read error (file deleted mid-stream)
   * drops the connection instead of crashing the process.
   * @param {import('fs').ReadStream} stream
   * @param {import('http').ServerResponse} res
   */
  pipeFile(stream, res) {
    stream.on('error', (err) => {
      console.warn('[TransferGateway] File read failed:', err.message);
      res.destroy(err);
    });
    stream.pipe(res);
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

    if (pathname.startsWith('/v1/') && !PUBLIC_ROUTES.has(pathname) && !this.isAuthorized(req, url)) {
      req.resume();
      sendJson(res, 401, { error: 'Not paired: connect with the pairing code first' });
      return;
    }

    try {
      if (pathname === '/v1/info' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.selfDevice.toJSON()));
        return;
      }

      if (pathname === '/v1/session' && method === 'POST') {
        const sessionReq = await this.readJsonBody(req);
        const sessionFiles = sessionReq && Array.isArray(sessionReq.files) ? sessionReq.files : null;
        if (!sessionReq || !isSafeId(sessionReq.sessionId) || !sessionFiles ||
            !sessionFiles.every((f) => f && isSafeId(f.fileId))) {
          sendJson(res, 400, { error: 'Invalid session request' });
          return;
        }
        // A session from a remembered (paired) device carries its token; the host
        // may then accept it without asking again.
        const sender = this.getAccessRecord(this.getRequestToken(req, url));
        const evaluation = await this.onSessionRequest(sessionReq, {
          paired: Boolean(sender && sender.remembered),
          pairedDevice: sender && sender.remembered
            ? { deviceId: sender.deviceId, displayName: sender.displayName, platform: sender.platform }
            : null
        });

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

        // `stream: true` tells the sender it may upload each file as one request to /v1/stream.
        sendJson(res, 200, { ...resp.toJSON(), stream: Boolean(evaluation.accepted) });
        return;
      }

      // /v1/chunk: one bounded slice of a file per request (older senders).
      // /v1/stream: the rest of the file in a single request from x-offset, hashed as it is
      // written so the commit does not have to read the file back.
      if ((pathname === '/v1/chunk' || pathname === '/v1/stream') && method === 'PUT') {
        const streamMode = pathname === '/v1/stream';
        const sessionId = req.headers[protocol.kHeaderSessionId] || req.headers['x-session-id'];
        const fileId = req.headers['x-file-id'];
        const offset = Number.parseInt(String(req.headers['x-offset'] || '0'), 10);

        if (!sessionId || !fileId) {
          req.resume();
          sendJson(res, 400, { error: 'Missing required session or file headers' });
          return;
        }

        // Only bytes for a file in a session the user accepted may touch the disk.
        const session = typeof sessionId === 'string' ? this.activeSessions.get(sessionId) : null;
        const fileEntry = session && Array.isArray(session.files)
          ? session.files.find((f) => f && f.fileId === fileId)
          : null;
        if (!fileEntry || !isSafeId(fileId)) {
          req.resume();
          sendJson(res, 403, { error: 'Unknown or unapproved session/file' });
          return;
        }
        if (!Number.isFinite(offset) || offset < 0) {
          req.resume();
          sendJson(res, 400, { error: 'Invalid x-offset header' });
          return;
        }

        const partPath = path.join(this.storageDir, `${fileId}${protocol.kPartialSuffix}`);
        const existingBytes = fs.existsSync(partPath) ? fs.statSync(partPath).size : 0;
        if (offset > existingBytes) {
          // Writing past the end would leave a hole, and opening a missing file with 'r+' throws.
          req.resume();
          sendJson(res, 409, { error: 'Offset is beyond the bytes received so far', expectedOffset: existingBytes });
          return;
        }

        const declaredSize = Number(fileEntry.fileSize) || 0;
        const exceedsLimits = streamMode
          ? (count) => offset + count > declaredSize
          : (count) => count > protocol.kMaxChunkSize || (declaredSize > 0 && offset + count > declaredSize);
        const contentLength = Number.parseInt(String(req.headers['content-length'] || '0'), 10) || 0;
        if (exceedsLimits(contentLength)) {
          req.resume();
          sendJson(res, 413, { error: 'Upload exceeds the allowed size' }, { Connection: 'close' });
          return;
        }

        const digestKey = `${sessionId}:${fileId}`;
        this.streamDigests.delete(digestKey);
        if (streamMode && existingBytes > offset) {
          // Drop stale bytes past the resume point so the file ends exactly where the stream ends.
          fs.truncateSync(partPath, offset);
        }
        const hash = streamMode && offset === 0 ? crypto.createHash('sha256') : null;

        const writeStream = fs.createWriteStream(partPath, {
          flags: offset === 0 ? 'w' : 'r+',
          start: offset,
          highWaterMark: WRITE_BUFFER_BYTES
        });
        this.activeWriteStreams.add(writeStream);
        writeStream.once('close', () => {
          this.activeWriteStreams.delete(writeStream);
        });

        let bytesWritten = 0;
        let failed = false;
        let ended = false;
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

        const fail = (status, message) => {
          if (failed) return;
          failed = true;
          writeStream.destroy();
          sendJson(res, status, { error: message }, { Connection: 'close' });
          req.resume();
        };

        writeStream.on('error', (err) => fail(500, `Failed writing file: ${err.message}`));
        req.on('error', (err) => fail(500, err.message));
        req.on('close', () => {
          // Sender went away mid-upload: keep what arrived so the next session resumes from it.
          if (!ended && !failed) {
            failed = true;
            writeStream.end();
          }
        });

        req.on('data', (chunk) => {
          if (failed) return;
          bytesWritten += chunk.length;
          if (exceedsLimits(bytesWritten)) {
            fail(413, 'Upload exceeds the allowed size');
            return;
          }
          if (hash) hash.update(chunk);
          metrics.transferredBytes += chunk.length;
          // Respect backpressure so a fast sender cannot buffer the file in memory.
          if (!writeStream.write(chunk)) {
            req.pause();
            writeStream.once('drain', () => req.resume());
          }

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
          ended = true;
          if (failed) return;
          writeStream.end(() => {
            if (failed) return;
            if (hash) {
              this.streamDigests.set(digestKey, { sha256: hash.digest('hex'), bytes: offset + bytesWritten });
            }
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
            sendJson(res, 200, ack.toJSON());
          });
        });
        return;
      }

      if (pathname === '/v1/file/commit' && method === 'POST') {
        const body = await this.readJsonBody(req);
        const { sessionId, fileId, sha256 } = body || {};
        const session = typeof sessionId === 'string' ? this.activeSessions.get(sessionId) : null;
        const fileEntry = session && Array.isArray(session.files)
          ? session.files.find((f) => f && f.fileId === fileId)
          : null;
        if (!fileEntry || !isSafeId(fileId)) {
          const rejected = new CommitResponse({
            sessionId,
            fileId,
            verified: false,
            errorMessage: 'Unknown or unapproved session/file'
          });
          sendJson(res, 403, rejected.toJSON());
          return;
        }

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

        // Use the hash computed while the file streamed in when it covers the whole
        // file on disk; otherwise (chunked or resumed upload) read the file back.
        const cachedDigest = this.streamDigests.get(`${sessionId}:${fileId}`);
        this.streamDigests.delete(`${sessionId}:${fileId}`);
        const actualSha256 = cachedDigest && cachedDigest.bytes === fs.statSync(partPath).size
          ? cachedDigest.sha256
          : await this.computeFileSha256(partPath);
        const verified = actualSha256.toLowerCase() === (sha256 || '').toLowerCase();

        if (verified) {
          // Strip directory parts and reserved characters so an advertised name cannot
          // escape the storage dir, and never overwrite a file that is already there.
          const targetName = fsService.sanitizeFileName(fileEntry.fileName, `${fileId}.bin`);
          const finalPath = fsService.uniquePath(path.join(this.storageDir, targetName));

          // Atomic rename from partial to final
          fs.renameSync(partPath, finalPath);
          const stat = fs.statSync(finalPath);

          if (this.onFileReceived) {
            this.onFileReceived({
              sessionId,
              fileId,
              fileName: path.basename(finalPath),
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
        const { sessionId } = body || {};
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
        if (!fsService.isPathAllowed(fullPath, [this.storageDir])) {
          sendJson(res, 403, { error: 'Path is outside the received-files folder' });
          return;
        }

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

        this.pipeFile(fs.createReadStream(fullPath), res);
        return;
      }

      if (pathname === '/v1/fs/list' && method === 'GET') {
        const requested = url.searchParams.get('path') || '';
        try {
          const listing = fsService.listDirectory(this.browseRoot, requested, {
            allowedRoots: this.getAllowedRoots(),
            exposeDrives: this.exposeDrives
          });
          sendJson(res, 200, listing);
        } catch (err) {
          sendJson(res, err.code === 'EOUTSIDEROOT' ? 403 : 404, { error: err.message });
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
        const target = this.resolveReadableFile(res, requested);
        if (!target) return;
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
          this.pipeFile(fs.createReadStream(target, { start, end }), res);
          return;
        }

        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': stat.size,
          'Accept-Ranges': 'bytes',
          'Content-Disposition': `attachment; filename="${fileName}"`
        });
        this.pipeFile(fs.createReadStream(target), res);
        return;
      }

      if (pathname === '/v1/fs/stream' && method === 'GET') {
        const requested = url.searchParams.get('path');
        if (!requested) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing path parameter' }));
          return;
        }
        const target = this.resolveReadableFile(res, requested);
        if (!target) return;
        this.streamFile(req, res, target);
        return;
      }

      if (pathname === '/v1/fs/copy' && method === 'POST') {
        const body = await this.readJsonBody(req);
        try {
          const newPath = fsService.copyEntry(body.sourcePath, body.destinationPath, this.getAllowedRoots());
          sendJson(res, 200, { success: true, newPath });
        } catch (err) {
          sendJson(res, err.code === 'EOUTSIDEROOT' ? 403 : 400, { error: err.message });
        }
        return;
      }

      if (pathname === '/v1/fs/delete' && method === 'POST') {
        const body = await this.readJsonBody(req);
        try {
          const deletedPath = fsService.deleteEntry(body.path, this.getAllowedRoots());
          sendJson(res, 200, { success: true, deletedPath });
        } catch (err) {
          sendJson(res, err.code === 'EOUTSIDEROOT' ? 403 : 400, { error: err.message });
        }
        return;
      }

      if (pathname === '/v1/fs/categories' && method === 'GET') {
        const type = url.searchParams.get('type') || 'photos';
        const limit = parseInt(url.searchParams.get('limit') || '60', 10) || 60;
        const offset = parseInt(url.searchParams.get('offset') || '0', 10) || 0;
        try {
          // Files received from the phone live in storageDir; they're the phone's media, not this device's.
          const result = fsService.listCategory(type, limit, offset, this.browseRoot, { excludeDirs: [this.storageDir] });
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
        const target = this.resolveReadableFile(res, requested);
        if (!target) return;
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
        const body = (await this.readJsonBody(req)) || {};
        const remoteIp = this.remoteAddress(req);
        const peerInfo = {
          deviceId: String(body.deviceId || ''),
          displayName: String(body.displayName || ''),
          fingerprint: String(body.fingerprint || ''),
          // Trust the socket over a self-reported address so a peer cannot point
          // this device's clipboard pushes at some other host.
          address: remoteIp && remoteIp !== '127.0.0.1'
            ? remoteIp
            : String(body.address || remoteIp || '127.0.0.1'),
          port: Number.parseInt(String(body.port), 10) || protocol.kDefaultPort,
          platform: String(body.platform || ''),
          clipboardSync: body.clipboardSync !== false
        };

        // Pair with a token this device issued before (remembered across restarts),
        // the code shown on this device, or an explicit approval from the user.
        // Nothing else gets a token.
        let token = '';
        const presented = this.getRequestToken(req, url);
        const known = this.getAccessRecord(presented);
        if (known) {
          token = presented;
          known.lastSeen = Date.now();
          if (peerInfo.displayName) known.displayName = peerInfo.displayName;
          if (peerInfo.platform) known.platform = peerInfo.platform;
          if (known.remembered) this.persistPairedDevices();
        } else if (typeof body.pairingCode === 'string' && body.pairingCode.trim()) {
          if (!this.pairingCode) {
            sendJson(res, 403, { error: 'Pairing codes are not enabled on this device' });
            return;
          }
          if (this.isPairingLocked(remoteIp)) {
            sendJson(res, 429, { error: 'Too many wrong pairing codes; try again in a few minutes' });
            return;
          }
          if (!safeEqual(body.pairingCode.trim(), this.pairingCode)) {
            this.recordPairingFailure(remoteIp);
            sendJson(res, 403, { error: 'Wrong pairing code' });
            return;
          }
          this.pairingFailures.delete(remoteIp);
          token = this.issueAccessToken(peerInfo, { remember: true });
        } else if (this.onConnectRequest) {
          const decision = await this.onConnectRequest(peerInfo);
          if (decision && decision.accepted) {
            token = this.issueAccessToken(peerInfo, { remember: true });
          }
        }

        if (!token) {
          sendJson(res, 403, { error: 'Connection was not approved on this device' });
          return;
        }

        this.connectedPeer = peerInfo;
        if (this.onLiveConnected) {
          try {
            this.onLiveConnected(peerInfo);
          } catch (err) {
            logCallbackError('onLiveConnected', err);
          }
        }
        const currentClipboard = this.clipboardAdapter
          ? this.clipboardAdapter.readText()
          : getSystemClipboard();
        sendJson(res, 200, {
          connected: true,
          device: this.selfDevice.toJSON(),
          currentClipboard,
          accessToken: token
        });
        return;
      }

      if (pathname === '/v1/live/disconnect' && method === 'POST') {
        this.connectedPeer = null;
        if (this.onLiveDisconnected) {
          try {
            this.onLiveDisconnected();
          } catch (err) {
            logCallbackError('onLiveDisconnected', err);
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
      sendJson(res, err.statusCode || 500, { error: err.message });
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
      this.pipeFile(fs.createReadStream(target, { start, end }), res);
      return;
    }

    res.writeHead(200, {
      'Content-Type': mimeType,
      'Content-Length': total,
      'Accept-Ranges': 'bytes'
    });
    this.pipeFile(fs.createReadStream(target), res);
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
          reject(Object.assign(new Error(`Malformed JSON body: ${err.message}`), { statusCode: 400 }));
        }
      });
      req.on('error', (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      });
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
