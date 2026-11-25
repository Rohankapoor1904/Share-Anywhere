const http = require('http');
const { DesktopEngine } = require('../../desktop/engine/desktop-node');

function call(port, requestPath, { headers = {}, method = 'GET', body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: requestPath,
      method,
      headers: {
        Host: `127.0.0.1:${port}`,
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe('Desktop control API is local-only and token-protected', () => {
  let engine;
  let port;
  let auth;

  beforeAll(async () => {
    engine = new DesktopEngine();
    engine.controlPort = 0;
    port = await engine.startControlServer();
    auth = { 'x-localshare-control-token': engine.controlToken };
  });

  afterAll(async () => {
    await engine.stop();
  });

  test('binds to loopback only', () => {
    expect(engine.controlServer.address().address).toBe('127.0.0.1');
  });

  test('API calls without the token are refused and leak nothing', async () => {
    const self = await call(port, '/api/self');
    expect(self.statusCode).toBe(401);
    expect(self.body).not.toContain(engine.pairingCode);
    expect((await call(port, '/api/clipboard')).statusCode).toBe(401);
    expect((await call(port, '/api/respond-request', { method: 'POST', body: { requestId: 'x', accepted: true } })).statusCode).toBe(401);
    expect((await call(port, '/events')).statusCode).toBe(401);
  });

  test('a foreign Host header is refused (DNS rebinding)', async () => {
    const res = await call(port, '/api/self', { headers: { ...auth, Host: 'evil.example' } });
    expect(res.statusCode).toBe(403);
  });

  test('no CORS headers are sent to other origins', async () => {
    const res = await call(port, '/api/self', { headers: { ...auth, Origin: 'https://evil.example' } });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('the token header authorizes API calls', async () => {
    const res = await call(port, '/api/self', { headers: auth });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).pairingCode).toBe(engine.pairingCode);
  });

  test('the launch URL swaps the token for an HttpOnly cookie', async () => {
    const launch = await call(port, `/?token=${engine.controlToken}`);
    expect(launch.statusCode).toBe(302);
    const cookie = String(launch.headers['set-cookie']);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    const res = await call(port, '/api/peers', { headers: { Cookie: cookie.split(';')[0] } });
    expect(res.statusCode).toBe(200);
  });

  test('a wrong launch token is refused', async () => {
    expect((await call(port, '/?token=wrong')).statusCode).toBe(403);
  });

  test('open-file refuses paths outside the received-files folder', async () => {
    const res = await call(port, '/api/open-file', { headers: auth, method: 'POST', body: { filePath: __filename } });
    expect(res.statusCode).toBe(404);
  });

  test('the static server never serves files outside desktop/public', async () => {
    const res = await call(port, '/../../package.json');
    expect(res.body).not.toContain('"name": "localshare"');
  });
});
