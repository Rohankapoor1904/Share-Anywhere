const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { DesktopEngine } = require('../../desktop/engine/desktop-node');
const { WifiJoiner } = require('../../desktop/engine/wifi-join');
const { createPhoneSession } = require('../../desktop/engine/offline-bootstrap');

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
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data ? JSON.parse(data) : null }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** A real HTTP server speaking the phone's live-link endpoints (what TransferServerModule serves). */
function startFakePhone() {
  const requests = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, body: raw ? JSON.parse(raw) : null });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (req.url === '/v1/info') {
        res.end(JSON.stringify({ deviceId: 'ls-android-it', displayName: 'IT Phone', platform: 'android' }));
      } else if (req.url === '/v1/live/connect') {
        res.end(JSON.stringify({ connected: true, device: { deviceId: 'ls-android-it' } }));
      } else {
        res.end(JSON.stringify({ ok: true }));
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, requests, port: server.address().port })));
}

const SHOW = `
    Name                   : Wi-Fi
    State                  : connected
    SSID                   : Office
    Profile                : Office
`;

async function waitForStep(port, auth, step, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = (await call(port, '/api/offline/status', { headers: auth })).body;
    if (last && last.step === step) return last;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for "${step}", last state: ${JSON.stringify(last)}`);
}

describe('Connect without Wi-Fi through the desktop control API (real sockets)', () => {
  let tmp;
  let engine;
  let port;
  let auth;
  let phoneServer;
  let netshCalls;

  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-offline-it-'));
    phoneServer = await startFakePhone();
    netshCalls = [];
    // justified: netsh would change this machine's Wi-Fi; commands are recorded instead.
    // Reachability uses the real HTTP probe against the fake phone.
    const wifiJoiner = new WifiJoiner({
      platform: 'win32',
      tmpDir: tmp,
      pollMs: 10,
      run: async (args) => {
        netshCalls.push(args.join(' '));
        return { code: 0, stdout: args[1] === 'show' ? SHOW : 'OK', stderr: '' };
      }
    });
    engine = new DesktopEngine({ wifiJoiner, stateFile: path.join(tmp, 'state.json') });
    engine.controlPort = 0;
    port = await engine.startControlServer();
    auth = { 'x-localshare-control-token': engine.controlToken };
  });

  afterEach(async () => {
    await engine.stop();
    await new Promise((resolve) => phoneServer.server.close(resolve));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('handshake → join → live link to the phone, then end restores the old Wi-Fi', async () => {
    const phone = createPhoneSession({ deviceId: 'ls-android-it', displayName: 'IT Phone', fingerprint: 'FPIT' });

    const begin = await call(port, '/api/offline/begin', { headers: auth, method: 'POST', body: { info: phone.info.toString('base64') } });
    expect(begin.statusCode).toBe(200);
    expect(begin.body.code).toMatch(/^\d{6}$/);
    expect(begin.body.phone.displayName).toBe('IT Phone');
    expect(phone.acceptHello(Buffer.from(begin.body.hello, 'base64')).code).toBe(begin.body.code);

    const blob = phone.sealCredentials({ ssid: 'AndroidShare_IT', pass: 'itpassword1', ip: '127.0.0.1', port: phoneServer.port, sec: 'wpa2' });
    const creds = await call(port, '/api/offline/creds', { headers: auth, method: 'POST', body: { blob: blob.toString('base64') } });
    expect(creds.statusCode).toBe(202);

    const connected = await waitForStep(port, auth, 'connected');
    expect(connected.peer).toEqual(expect.objectContaining({ deviceId: 'ls-android-it', address: '127.0.0.1', viaHotspot: true }));
    expect(netshCalls.some((c) => c.startsWith('wlan add profile'))).toBe(true);
    expect(netshCalls.some((c) => /^wlan connect name="LocalShare-AndroidShare_IT-/.test(c))).toBe(true);

    const connect = phoneServer.requests.find((r) => r.url === '/v1/live/connect');
    expect(connect.body.deviceId).toBe(engine.selfDevice.deviceId);
    // On the hotspot the PC lets the phone use the request's source address.
    expect(connect.body.address).toBe('');
    const status = await call(port, '/api/live/status', { headers: auth });
    expect(status.body.connected).toBe(true);

    const end = await call(port, '/api/offline/end', { headers: auth, method: 'POST', body: {} });
    expect(end.statusCode).toBe(200);
    expect(end.body).toEqual({ step: 'idle' });
    expect(phoneServer.requests.some((r) => r.url === '/v1/live/disconnect')).toBe(true);
    expect(netshCalls.slice(-2)).toEqual([
      expect.stringMatching(/^wlan delete profile name="LocalShare-AndroidShare_IT-[0-9a-f]{8}" interface="Wi-Fi"$/),
      'wlan connect name="Office" interface="Wi-Fi"'
    ]);
    expect((await call(port, '/api/live/status', { headers: auth })).body.connected).toBe(false);
  });

  test('tampered credentials are refused with 400 and Wi-Fi is never touched', async () => {
    const phone = createPhoneSession({ deviceId: 'ls-android-it', displayName: 'IT Phone' });
    const begin = await call(port, '/api/offline/begin', { headers: auth, method: 'POST', body: { info: phone.info.toString('base64') } });
    phone.acceptHello(Buffer.from(begin.body.hello, 'base64'));
    const blob = phone.sealCredentials({ ssid: 'AndroidShare_IT', pass: 'itpassword1', ip: '127.0.0.1', port: phoneServer.port, sec: 'wpa2' });
    blob[blob.length - 1] ^= 0xff;
    const res = await call(port, '/api/offline/creds', { headers: auth, method: 'POST', body: { blob: blob.toString('base64') } });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('ERR_BOOTSTRAP_AUTH');
    expect(netshCalls).toEqual([]);
  });

  test('the offline API needs the control token', async () => {
    expect((await call(port, '/api/offline/status')).statusCode).toBe(401);
    expect((await call(port, '/api/offline/manual', { method: 'POST', body: { ssid: 'x' } })).statusCode).toBe(401);
  });

  test('manual details join the same way', async () => {
    const res = await call(port, '/api/offline/manual', {
      headers: auth,
      method: 'POST',
      body: { ssid: 'AndroidShare_M', password: 'manualpass1', ip: '127.0.0.1', port: phoneServer.port }
    });
    expect(res.statusCode).toBe(202);
    const connected = await waitForStep(port, auth, 'connected');
    expect(connected.peer.address).toBe('127.0.0.1');
  });
});
