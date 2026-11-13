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
});
