const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { TransferGateway } = require('../../nodejs-assets/nodejs-project/transfer-gateway');

function request(port, method, requestPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : (typeof body === 'string' ? body : JSON.stringify(body));
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: requestPath,
      method,
      headers: Object.assign(
        payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
        headers
      )
    }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, rawBody: data }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe('PC /v1/fs/* + /v1/clipboard real-socket integration', () => {
  let server;
  let port;
  let root;
  let storageDir;
  let token;

  const call = (method, requestPath, body, headers = {}) =>
    request(port, method, requestPath, body, { 'x-localshare-token': token, ...headers });

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'localshare-remotefs-'));
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'localshare-store-'));
    fs.mkdirSync(path.join(root, 'media'));
    fs.writeFileSync(path.join(root, 'hello.txt'), 'real bytes here');
    fs.writeFileSync(path.join(root, 'media', 'clip.bin'), Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]));

    server = new TransferGateway({
      port: 0,
      storageDir,
      browseRoot: root,
      pairingCode: '123456'
    });
    const addr = await server.start();
    port = addr.port;
    token = server.issueAccessToken({ deviceId: 'test-client' });
  });

  afterAll(async () => {
    await server.stop();
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(storageDir, { recursive: true, force: true });
  });

  test('GET /v1/fs/list returns real directory entries', async () => {
    const res = await call('GET', '/v1/fs/list?path=');
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.rawBody);
    expect(body.currentPath).toBe(path.resolve(root));
    const names = body.entries.map((e) => e.name);
    expect(names).toContain('hello.txt');
    expect(names).toContain('media');
  });

  test('GET /v1/fs/download streams real file bytes', async () => {
    const res = await call('GET', `/v1/fs/download?path=${encodeURIComponent(path.join(root, 'hello.txt'))}`);
    expect(res.statusCode).toBe(200);
    expect(res.rawBody).toBe('real bytes here');
  });

  test('GET /v1/fs/stream supports HTTP Range (206)', async () => {
    const target = path.join(root, 'media', 'clip.bin');
    const res = await call('GET', `/v1/fs/stream?path=${encodeURIComponent(target)}`, undefined, {
      Range: 'bytes=2-5'
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers['content-range']).toBe('bytes 2-5/8');
    expect(res.rawBody.length).toBe(4);
  });

  test('POST /v1/fs/copy duplicates a real file', async () => {
    const res = await call('POST', '/v1/fs/copy', { sourcePath: path.join(root, 'hello.txt') });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.rawBody);
    expect(body.success).toBe(true);
    expect(fs.existsSync(body.newPath)).toBe(true);
    expect(fs.readFileSync(body.newPath, 'utf8')).toBe('real bytes here');
  });

  test('POST /v1/fs/delete removes a real file', async () => {
    const victim = path.join(root, 'victim.txt');
    fs.writeFileSync(victim, 'x');
    const res = await call('POST', '/v1/fs/delete', { path: victim });
    expect(res.statusCode).toBe(200);
    expect(fs.existsSync(victim)).toBe(false);
  });

  test('GET /v1/clipboard returns a JSON text field', async () => {
    const res = await call('GET', '/v1/clipboard');
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.rawBody);
    expect(typeof body.text).toBe('string');
  });

  test('unknown /v1/fs path returns 404', async () => {
    const res = await call('GET', '/v1/fs/nope');
    expect(res.statusCode).toBe(404);
  });

  test('protected routes refuse callers without a valid access token', async () => {
    const victim = path.join(root, 'keep.txt');
    fs.writeFileSync(victim, 'keep');
    expect((await request(port, 'GET', '/v1/fs/list?path=')).statusCode).toBe(401);
    expect((await request(port, 'GET', '/v1/clipboard')).statusCode).toBe(401);
    expect((await request(port, 'GET', '/v1/telemetry')).statusCode).toBe(401);
    expect((await request(port, 'POST', '/v1/fs/delete', { path: victim })).statusCode).toBe(401);
    const forged = await request(port, 'GET', '/v1/fs/list?path=', undefined, { 'x-localshare-token': 'forged' });
    expect(forged.statusCode).toBe(401);
    expect(fs.existsSync(victim)).toBe(true);
  });

  test('the pairing code on /v1/live/connect issues a working token', async () => {
    const wrong = await request(port, 'POST', '/v1/live/connect', { deviceId: 'phone', pairingCode: '000000' });
    expect(wrong.statusCode).toBe(403);
    const res = await request(port, 'POST', '/v1/live/connect', { deviceId: 'phone', pairingCode: '123456' });
    expect(res.statusCode).toBe(200);
    const { accessToken } = JSON.parse(res.rawBody);
    expect(typeof accessToken).toBe('string');
    const list = await request(port, 'GET', '/v1/fs/list?path=', undefined, { 'x-localshare-token': accessToken });
    expect(list.statusCode).toBe(200);
  });

  test('live connect with neither a code nor an approval handler is refused', async () => {
    const res = await request(port, 'POST', '/v1/live/connect', { deviceId: 'stranger' });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.rawBody).accessToken).toBeUndefined();
  });

  test('repeated wrong pairing codes lock the caller out', async () => {
    const lockGateway = new TransferGateway({ port: 0, storageDir, browseRoot: root, pairingCode: '654321' });
    const lockPort = (await lockGateway.start()).port;
    try {
      for (let i = 0; i < 5; i += 1) {
        const res = await request(lockPort, 'POST', '/v1/live/connect', { pairingCode: '111111' });
        expect(res.statusCode).toBe(403);
      }
      // Even the right code is refused while locked out.
      const locked = await request(lockPort, 'POST', '/v1/live/connect', { pairingCode: '654321' });
      expect(locked.statusCode).toBe(429);
    } finally {
      await lockGateway.stop();
    }
  });

  test('media URLs may carry the token as a query parameter', async () => {
    const target = encodeURIComponent(path.join(root, 'hello.txt'));
    const res = await request(port, 'GET', `/v1/fs/download?path=${target}&token=${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.rawBody).toBe('real bytes here');
  });

  test('paths outside the browse root are refused even with a token', async () => {
    const secret = path.join(storageDir, 'secret.txt');
    fs.writeFileSync(secret, 'private');
    const relativeEscape = `../${path.basename(storageDir)}/secret.txt`;
    expect((await call('GET', `/v1/fs/download?path=${encodeURIComponent(secret)}`)).statusCode).toBe(403);
    expect((await call('GET', `/v1/fs/stream?path=${encodeURIComponent(secret)}`)).statusCode).toBe(403);
    expect((await call('GET', `/v1/fs/download?path=${encodeURIComponent(relativeEscape)}`)).statusCode).toBe(403);
    expect((await call('GET', `/v1/fs/list?path=${encodeURIComponent(storageDir)}`)).statusCode).toBe(403);
    expect((await call('POST', '/v1/fs/delete', { path: secret })).statusCode).toBe(403);
    const copy = await call('POST', '/v1/fs/copy', {
      sourcePath: path.join(root, 'hello.txt'),
      destinationPath: path.join(storageDir, 'stolen.txt')
    });
    expect(copy.statusCode).toBe(403);
    expect(fs.existsSync(secret)).toBe(true);
    expect(fs.existsSync(path.join(storageDir, 'stolen.txt'))).toBe(false);
  });

  test('the browse root itself cannot be deleted', async () => {
    const res = await call('POST', '/v1/fs/delete', { path: root });
    expect(res.statusCode).toBe(403);
    expect(fs.existsSync(root)).toBe(true);
  });
});
