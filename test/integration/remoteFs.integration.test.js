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

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'localshare-remotefs-'));
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'localshare-store-'));
    fs.mkdirSync(path.join(root, 'media'));
    fs.writeFileSync(path.join(root, 'hello.txt'), 'real bytes here');
    fs.writeFileSync(path.join(root, 'media', 'clip.bin'), Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]));

    server = new TransferGateway({
      port: 0,
      storageDir,
      browseRoot: root
    });
    const addr = await server.start();
    port = addr.port;
  });

  afterAll(async () => {
    await server.stop();
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(storageDir, { recursive: true, force: true });
  });

  test('GET /v1/fs/list returns real directory entries', async () => {
    const res = await request(port, 'GET', '/v1/fs/list?path=');
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.rawBody);
    expect(body.currentPath).toBe(path.resolve(root));
    const names = body.entries.map((e) => e.name);
    expect(names).toContain('hello.txt');
    expect(names).toContain('media');
  });

  test('GET /v1/fs/download streams real file bytes', async () => {
    const res = await request(port, 'GET', `/v1/fs/download?path=${encodeURIComponent(path.join(root, 'hello.txt'))}`);
    expect(res.statusCode).toBe(200);
    expect(res.rawBody).toBe('real bytes here');
  });

  test('GET /v1/fs/stream supports HTTP Range (206)', async () => {
    const target = path.join(root, 'media', 'clip.bin');
    const res = await request(port, 'GET', `/v1/fs/stream?path=${encodeURIComponent(target)}`, undefined, {
      Range: 'bytes=2-5'
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers['content-range']).toBe('bytes 2-5/8');
    expect(res.rawBody.length).toBe(4);
  });

  test('POST /v1/fs/copy duplicates a real file', async () => {
    const res = await request(port, 'POST', '/v1/fs/copy', { sourcePath: path.join(root, 'hello.txt') });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.rawBody);
    expect(body.success).toBe(true);
    expect(fs.existsSync(body.newPath)).toBe(true);
    expect(fs.readFileSync(body.newPath, 'utf8')).toBe('real bytes here');
  });

  test('POST /v1/fs/delete removes a real file', async () => {
    const victim = path.join(root, 'victim.txt');
    fs.writeFileSync(victim, 'x');
    const res = await request(port, 'POST', '/v1/fs/delete', { path: victim });
    expect(res.statusCode).toBe(200);
    expect(fs.existsSync(victim)).toBe(false);
  });

  test('GET /v1/clipboard returns a JSON text field', async () => {
    const res = await request(port, 'GET', '/v1/clipboard');
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.rawBody);
    expect(typeof body.text).toBe('string');
  });

  test('unknown /v1/fs path returns 404', async () => {
    const res = await request(port, 'GET', '/v1/fs/nope');
    expect(res.statusCode).toBe(404);
  });
});
