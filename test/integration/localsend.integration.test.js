const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { LocalSendGateway } = require('../../nodejs-assets/nodejs-project/localsend-gateway');

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

describe('LocalSend v2.2 Interop Real-HTTP Integration Tests (§9, §12.2)', () => {
  let server;
  let testPort;
  let testDir;

  beforeAll(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'localsend-integ-'));
    server = new LocalSendGateway({
      port: 0, // dynamic port
      storageDir: testDir,
      alias: 'LocalShare Test Host'
    });
    await server.start();
    testPort = server.httpServer.address().port;
  });

  afterAll(async () => {
    await server.stop();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('GET /api/localsend/v2/info returns valid v2.2 metadata', async () => {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: testPort,
      path: '/api/localsend/v2/info',
      method: 'GET'
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.version).toBe('2.2');
    expect(res.body.alias).toBe('LocalShare Test Host');
    expect(res.body.protocol).toBe('http');
  });

  test('LocalSend file upload flow lands file verified on disk', async () => {
    const fileBytes = Buffer.from('Hello from LocalSend client test payload!');
    const fileId = 'ls-file-1';
    const fileName = 'hello_localsend.txt';

    // 1. Prepare upload
    const prepareRes = await makeRequest({
      hostname: '127.0.0.1',
      port: testPort,
      path: '/api/localsend/v2/prepare-upload',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      info: {
        alias: 'External LocalSend App',
        deviceModel: 'Linux PC'
      },
      files: {
        [fileId]: {
          id: fileId,
          fileName,
          size: fileBytes.length,
          fileType: 'text/plain'
        }
      }
    });

    expect(prepareRes.statusCode).toBe(200);
    const { sessionId, files } = prepareRes.body;
    expect(sessionId).toBeDefined();
    const token = files[fileId];
    expect(token).toBeDefined();

    // 2. Upload file bytes
    const uploadRes = await makeRequest({
      hostname: '127.0.0.1',
      port: testPort,
      path: `/api/localsend/v2/upload?sessionId=${sessionId}&fileId=${fileId}&token=${token}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': fileBytes.length
      }
    }, fileBytes);

    expect(uploadRes.statusCode).toBe(200);
    expect(uploadRes.body.status).toBe('ok');

    // 3. Verify file exists on disk
    const savedPath = path.join(testDir, fileName);
    expect(fs.existsSync(savedPath)).toBe(true);
    const diskContent = fs.readFileSync(savedPath);
    expect(diskContent.equals(fileBytes)).toBe(true);
  });

  test('an upload cannot leave the storage folder, and its token is single-use', async () => {
    const bytes = Buffer.from('escape attempt');
    const fileId = 'ls-evil';
    const prep = await makeRequest({
      hostname: '127.0.0.1',
      port: testPort,
      path: '/api/localsend/v2/prepare-upload',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      info: { alias: 'Hostile Sender' },
      files: {
        [fileId]: { id: fileId, fileName: '../../escaped_localsend.txt', size: bytes.length, fileType: 'text/plain' }
      }
    });
    expect(prep.statusCode).toBe(200);
    const { sessionId, files } = prep.body;
    const upload = () => makeRequest({
      hostname: '127.0.0.1',
      port: testPort,
      path: `/api/localsend/v2/upload?sessionId=${sessionId}&fileId=${fileId}&token=${files[fileId]}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': bytes.length }
    }, bytes);

    const first = await upload();
    expect(first.statusCode).toBe(200);
    expect(fs.existsSync(path.join(testDir, 'escaped_localsend.txt'))).toBe(true);
    expect(fs.existsSync(path.resolve(testDir, '..', '..', 'escaped_localsend.txt'))).toBe(false);

    const replay = await upload();
    expect(replay.statusCode).toBe(403);
  });
});
