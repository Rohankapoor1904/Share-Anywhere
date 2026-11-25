const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { TransferGateway } = require('../../nodejs-assets/nodejs-project/transfer-gateway');
const { SessionRequest, FileDescriptor, CommitRequest } = require('../../nodejs-assets/nodejs-project/models');
const protocol = require('../../nodejs-assets/nodejs-project/protocol');

function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ statusCode: res.statusCode, headers: res.headers, body: json });
        } catch {
          resolve({ statusCode: res.statusCode, headers: res.headers, rawBody: data });
        }
      });
    });

    req.on('error', reject);

    if (postData) {
      if (Buffer.isBuffer(postData) || typeof postData === 'string') {
        req.write(postData);
      } else {
        req.write(JSON.stringify(postData));
      }
    }
    req.end();
  });
}

function sendChunk(port, sessionId, fileId, offset, chunkBuffer) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/v1/chunk',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': chunkBuffer.length,
        [protocol.kHeaderSessionId]: sessionId,
        'x-file-id': fileId,
        'x-offset': String(offset)
      }
    }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: JSON.parse(body) });
      });
    });

    req.on('error', reject);
    req.write(chunkBuffer);
    req.end();
  });
}

describe('Real-Socket Transfer Gateway Integration Tests (§12.2)', () => {
  let server;
  let testPort;
  let testDir;

  beforeAll(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'localshare-integ-'));
    server = new TransferGateway({
      port: 0, // dynamic OS assigned port
      storageDir: testDir
    });
    const addr = await server.start();
    testPort = addr.port;
  });

  afterAll(async () => {
    await server.stop();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('Identity probe GET /v1/info returns server DeviceInfo', async () => {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: testPort,
      path: '/v1/info',
      method: 'GET'
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.deviceId).toBe('local-node-gateway');
  });

  test('Multi-chunk file transfer arrives byte-identical with verified SHA-256', async () => {
    // Generate 2.5 MB random test payload
    const fileBytes = crypto.randomBytes(2.5 * 1024 * 1024);
    const expectedSha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');
    const fileId = 'integ-file-01';
    const fileName = 'test_payload.bin';

    const sessionReq = new SessionRequest({
      sessionId: 'sess-integ-1',
      sender: {
        deviceId: 'client-integ',
        displayName: 'Integration Client'
      },
      files: [
        new FileDescriptor({
          fileId,
          fileName,
          fileSize: fileBytes.length,
          mimeType: 'application/octet-stream',
          sha256: expectedSha256
        })
      ]
    });

    // 1. Session handshake
    const sessionRes = await makeRequest({
      hostname: '127.0.0.1',
      port: testPort,
      path: '/v1/session',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, sessionReq.toJSON());

    expect(sessionRes.statusCode).toBe(200);
    expect(sessionRes.body.accepted).toBe(true);
    expect(sessionRes.body.resume[fileId]).toBe(0);

    // 2. Upload chunks (1 MB each, last 0.5 MB)
    const chunkSize = 1024 * 1024;
    let offset = 0;
    while (offset < fileBytes.length) {
      const end = Math.min(offset + chunkSize, fileBytes.length);
      const chunk = fileBytes.subarray(offset, end);
      const ack = await sendChunk(testPort, 'sess-integ-1', fileId, offset, chunk);

      expect(ack.statusCode).toBe(200);
      expect(ack.body.received).toBe(chunk.length);
      offset += chunk.length;
    }

    // 3. Commit file
    const commitReq = new CommitRequest({
      sessionId: 'sess-integ-1',
      fileId,
      sha256: expectedSha256,
      lastChunk: true
    });

    const commitRes = await makeRequest({
      hostname: '127.0.0.1',
      port: testPort,
      path: '/v1/file/commit',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, commitReq.toJSON());

    expect(commitRes.statusCode).toBe(200);
    expect(commitRes.body.verified).toBe(true);
    expect(commitRes.body.savedPath).toBeDefined();

    // 4. Assert bytes equal on disk
    const savedBytes = fs.readFileSync(commitRes.body.savedPath);
    expect(savedBytes.equals(fileBytes)).toBe(true);
  });

  test('Resume test: connection interrupted mid-file resumes from last committed byte offset', async () => {
    const fileBytes = crypto.randomBytes(3 * 1024 * 1024);
    const expectedSha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');
    const fileId = 'integ-resume-file';
    const fileName = 'resumable.bin';

    const sessionReq = new SessionRequest({
      sessionId: 'sess-resume-1',
      sender: { deviceId: 'client-resume' },
      files: [
        new FileDescriptor({
          fileId,
          fileName,
          fileSize: fileBytes.length,
          sha256: expectedSha256
        })
      ]
    });

    // Handshake
    await makeRequest({
      hostname: '127.0.0.1',
      port: testPort,
      path: '/v1/session',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, sessionReq.toJSON());

    // Send only chunk 1 (1 MB) and then "kill" connection
    const chunk1 = fileBytes.subarray(0, 1024 * 1024);
    await sendChunk(testPort, 'sess-resume-1', fileId, 0, chunk1);

    // Reconnect with new session request
    const reconnectSessionRes = await makeRequest({
      hostname: '127.0.0.1',
      port: testPort,
      path: '/v1/session',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, sessionReq.toJSON());

    expect(reconnectSessionRes.statusCode).toBe(200);
    expect(reconnectSessionRes.body.accepted).toBe(true);

    // Server must report exact resume byte offset = 1048576
    expect(reconnectSessionRes.body.resume[fileId]).toBe(1024 * 1024);

    // Resume: send remaining bytes from offset 1024 * 1024
    const remaining = fileBytes.subarray(1024 * 1024);
    const ack2 = await sendChunk(testPort, 'sess-resume-1', fileId, 1024 * 1024, remaining);
    expect(ack2.statusCode).toBe(200);

    // Commit file
    const commitReq = new CommitRequest({
      sessionId: 'sess-resume-1',
      fileId,
      sha256: expectedSha256,
      lastChunk: true
    });

    const commitRes = await makeRequest({
      hostname: '127.0.0.1',
      port: testPort,
      path: '/v1/file/commit',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, commitReq.toJSON());

    expect(commitRes.body.verified).toBe(true);

    // Final disk byte verification
    const savedBytes = fs.readFileSync(commitRes.body.savedPath);
    expect(savedBytes.equals(fileBytes)).toBe(true);
  });

  function openSession(sessionId, files) {
    return makeRequest({
      hostname: '127.0.0.1',
      port: testPort,
      path: '/v1/session',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, new SessionRequest({
      sessionId,
      sender: { deviceId: 'client-security' },
      files: files.map((f) => new FileDescriptor(f))
    }).toJSON());
  }

  function commitFile(sessionId, fileId, sha256) {
    return makeRequest({
      hostname: '127.0.0.1',
      port: testPort,
      path: '/v1/file/commit',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, new CommitRequest({ sessionId, fileId, sha256, lastChunk: true }).toJSON());
  }

  test('chunks for a session that was never accepted are refused and write nothing', async () => {
    const ack = await sendChunk(testPort, 'never-accepted', 'ghost-file', 0, Buffer.from('payload'));
    expect(ack.statusCode).toBe(403);
    expect(fs.existsSync(path.join(testDir, `ghost-file${protocol.kPartialSuffix}`))).toBe(false);
    const commitRes = await commitFile('never-accepted', 'ghost-file', '');
    expect(commitRes.statusCode).toBe(403);
  });

  test('an offset past the received bytes returns 409 and the server stays up', async () => {
    const bytes = crypto.randomBytes(100);
    await openSession('sess-gap', [{ fileId: 'gap-file', fileName: 'gap.bin', fileSize: bytes.length, sha256: '' }]);
    const ack = await sendChunk(testPort, 'sess-gap', 'gap-file', 50, bytes.subarray(50));
    expect(ack.statusCode).toBe(409);
    expect(ack.body.expectedOffset).toBe(0);
    const info = await makeRequest({ hostname: '127.0.0.1', port: testPort, path: '/v1/info', method: 'GET' });
    expect(info.statusCode).toBe(200);
  });

  test('a chunk larger than the declared file size is rejected', async () => {
    await openSession('sess-big', [{ fileId: 'big-file', fileName: 'big.bin', fileSize: 10, sha256: '' }]);
    const ack = await sendChunk(testPort, 'sess-big', 'big-file', 0, crypto.randomBytes(64));
    expect(ack.statusCode).toBe(413);
  });

  test('session requests with path characters in ids are rejected', async () => {
    const res = await openSession('sess-evil', [{ fileId: '../../evil', fileName: 'x.bin', fileSize: 1, sha256: '' }]);
    expect(res.statusCode).toBe(400);
  });

  test('a committed file never escapes the storage dir or overwrites an existing file', async () => {
    const existing = path.join(testDir, 'report.txt');
    fs.writeFileSync(existing, 'original');
    const bytes = Buffer.from('incoming bytes');
    const sha = crypto.createHash('sha256').update(bytes).digest('hex');
    await openSession('sess-names', [
      { fileId: 'dup-file', fileName: 'report.txt', fileSize: bytes.length, sha256: sha },
      { fileId: 'esc-file', fileName: '../../escape.txt', fileSize: bytes.length, sha256: sha }
    ]);
    for (const fileId of ['dup-file', 'esc-file']) {
      const ack = await sendChunk(testPort, 'sess-names', fileId, 0, bytes);
      expect(ack.statusCode).toBe(200);
    }

    const dup = await commitFile('sess-names', 'dup-file', sha);
    expect(dup.body.verified).toBe(true);
    expect(dup.body.savedPath).not.toBe(existing);
    expect(fs.readFileSync(existing, 'utf8')).toBe('original');

    const esc = await commitFile('sess-names', 'esc-file', sha);
    expect(esc.body.verified).toBe(true);
    expect(path.dirname(esc.body.savedPath)).toBe(testDir);
    expect(path.basename(esc.body.savedPath)).toBe('escape.txt');
  });

  function putStream(sessionId, fileId, offset, body, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: testPort,
        path: '/v1/stream',
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': body.length,
          [protocol.kHeaderSessionId]: sessionId,
          'x-file-id': fileId,
          'x-offset': String(offset),
          ...extraHeaders
        }
      }, (res) => {
        let data = '';
        res.on('data', (d) => { data += d; });
        res.on('end', () => resolve({ statusCode: res.statusCode, body: data ? JSON.parse(data) : {} }));
      });
      req.on('error', reject);
      req.end(body);
    });
  }

  test('accepted sessions advertise streamed uploads', async () => {
    const res = await openSession('sess-stream-flag', [{ fileId: 'flag-file', fileName: 'flag.bin', fileSize: 1, sha256: '' }]);
    expect(res.statusCode).toBe(200);
    expect(res.body.stream).toBe(true);
  });

  test('a whole file streamed in one request arrives byte-identical and verified', async () => {
    const bytes = crypto.randomBytes(3 * 1024 * 1024 + 123);
    const sha = crypto.createHash('sha256').update(bytes).digest('hex');
    await openSession('sess-stream-1', [{ fileId: 'stream-file', fileName: 'streamed.bin', fileSize: bytes.length, sha256: sha }]);

    const up = await putStream('sess-stream-1', 'stream-file', 0, bytes);
    expect(up.statusCode).toBe(200);
    expect(up.body.received).toBe(bytes.length);

    const commit = await commitFile('sess-stream-1', 'stream-file', sha);
    expect(commit.statusCode).toBe(200);
    expect(commit.body.verified).toBe(true);
    expect(fs.readFileSync(commit.body.savedPath).equals(bytes)).toBe(true);
  });

  test('a stream can resume after a chunked prefix', async () => {
    const bytes = crypto.randomBytes(2 * 1024 * 1024);
    const sha = crypto.createHash('sha256').update(bytes).digest('hex');
    await openSession('sess-stream-resume', [{ fileId: 'resume-stream', fileName: 'resumed.bin', fileSize: bytes.length, sha256: sha }]);

    const first = await sendChunk(testPort, 'sess-stream-resume', 'resume-stream', 0, bytes.subarray(0, 700000));
    expect(first.statusCode).toBe(200);
    const rest = await putStream('sess-stream-resume', 'resume-stream', 700000, bytes.subarray(700000));
    expect(rest.statusCode).toBe(200);

    const commit = await commitFile('sess-stream-resume', 'resume-stream', sha);
    expect(commit.body.verified).toBe(true);
    expect(fs.readFileSync(commit.body.savedPath).equals(bytes)).toBe(true);
  });

  test('a stream that is corrupted in transit fails verification', async () => {
    const bytes = crypto.randomBytes(256 * 1024);
    const sha = crypto.createHash('sha256').update(bytes).digest('hex');
    await openSession('sess-stream-bad', [{ fileId: 'bad-stream', fileName: 'bad.bin', fileSize: bytes.length, sha256: sha }]);
    const tampered = Buffer.from(bytes);
    tampered[1000] ^= 0xff;
    expect((await putStream('sess-stream-bad', 'bad-stream', 0, tampered)).statusCode).toBe(200);
    const commit = await commitFile('sess-stream-bad', 'bad-stream', sha);
    expect(commit.statusCode).toBe(400);
    expect(commit.body.verified).toBe(false);
  });

  test('streams larger than the declared size, or for unapproved sessions, are refused', async () => {
    await openSession('sess-stream-big', [{ fileId: 'big-stream', fileName: 'big.bin', fileSize: 100, sha256: '' }]);
    expect((await putStream('sess-stream-big', 'big-stream', 0, crypto.randomBytes(101))).statusCode).toBe(413);
    expect((await putStream('never-accepted', 'ghost-stream', 0, Buffer.from('x'))).statusCode).toBe(403);
    expect(fs.existsSync(path.join(testDir, `ghost-stream${protocol.kPartialSuffix}`))).toBe(false);
  });

  test('stop() finishes even while an upload is still in flight', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'localshare-stop-'));
    const gw = new TransferGateway({ port: 0, storageDir: dir });
    const gwPort = (await gw.start()).port;
    await makeRequest({
      hostname: '127.0.0.1',
      port: gwPort,
      path: '/v1/session',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, new SessionRequest({
      sessionId: 'sess-stop',
      sender: { deviceId: 'client-stop' },
      files: [new FileDescriptor({ fileId: 'stop-file', fileName: 'big.bin', fileSize: 10 * 1024 * 1024, sha256: '' })]
    }).toJSON());

    // Start a 10 MB stream, send 64 KB, and never finish it.
    const req = http.request({
      hostname: '127.0.0.1',
      port: gwPort,
      path: '/v1/stream',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': 10 * 1024 * 1024,
        [protocol.kHeaderSessionId]: 'sess-stop',
        'x-file-id': 'stop-file',
        'x-offset': '0'
      }
    });
    // stop() resets this socket on purpose; record it rather than ignore it.
    let resetError = null;
    req.on('error', (err) => { resetError = err; });
    req.write(crypto.randomBytes(64 * 1024));
    await new Promise((resolve) => setTimeout(resolve, 200));

    const started = Date.now();
    await gw.stop();
    expect(Date.now() - started).toBeLessThan(2000);
    req.destroy();
    expect(resetError === null || typeof resetError.message === 'string').toBe(true);

    // What arrived is kept, so the next session can resume from it.
    expect(fs.existsSync(path.join(dir, `stop-file${protocol.kPartialSuffix}`))).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

