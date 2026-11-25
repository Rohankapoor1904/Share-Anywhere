const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { TransferGateway } = require('../../nodejs-assets/nodejs-project/transfer-gateway');
const { DesktopEngine } = require('../../desktop/engine/desktop-node');

function call(port, method, requestPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: requestPath,
      method,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data ? JSON.parse(data) : {} }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe('Paired devices are remembered across restarts', () => {
  let dir;
  let gateway;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'localshare-pair-'));
  });

  afterEach(async () => {
    if (gateway) await gateway.stop();
    gateway = null;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function startGateway(options) {
    gateway = new TransferGateway({ port: 0, storageDir: dir, browseRoot: dir, pairingCode: '123456', ...options });
    return (await gateway.start()).port;
  }

  test('a phone paired with the code keeps working after the PC restarts', async () => {
    let saved = [];
    let port = await startGateway({ onPairedDevicesChanged: (list) => { saved = list; } });
    const paired = await call(port, 'POST', '/v1/live/connect', { deviceId: 'phone-1', displayName: 'Pixel', platform: 'android', pairingCode: '123456' });
    expect(paired.statusCode).toBe(200);
    const token = paired.body.accessToken;
    expect(saved).toHaveLength(1);
    expect(JSON.stringify(saved)).not.toContain(token);

    await gateway.stop();
    port = await startGateway({ pairedDevices: saved });

    const list = await call(port, 'GET', '/v1/fs/list?path=', undefined, { 'x-localshare-token': token });
    expect(list.statusCode).toBe(200);
    // Reconnecting with the saved token needs neither the code nor a prompt.
    const again = await call(port, 'POST', '/v1/live/connect', { deviceId: 'phone-1', displayName: 'Pixel' }, { 'x-localshare-token': token });
    expect(again.statusCode).toBe(200);
    expect(again.body.accessToken).toBe(token);
  });

  test('pairing the same phone again replaces its old pairing', async () => {
    let saved = [];
    const port = await startGateway({ onPairedDevicesChanged: (list) => { saved = list; } });
    const first = await call(port, 'POST', '/v1/live/connect', { deviceId: 'phone-1', pairingCode: '123456' });
    const second = await call(port, 'POST', '/v1/live/connect', { deviceId: 'phone-1', pairingCode: '123456' });
    expect(saved).toHaveLength(1);
    expect(gateway.hasAccessToken(first.body.accessToken)).toBe(false);
    expect(gateway.hasAccessToken(second.body.accessToken)).toBe(true);
  });

  test('forgetting a device revokes its access', async () => {
    let saved = [];
    const port = await startGateway({ onPairedDevicesChanged: (list) => { saved = list; } });
    const paired = await call(port, 'POST', '/v1/live/connect', { deviceId: 'phone-1', displayName: 'Pixel', pairingCode: '123456' });
    const [device] = gateway.listPairedDevices();
    expect(device.displayName).toBe('Pixel');
    expect(device.id).toHaveLength(16);

    expect(gateway.forgetPairedDevice(device.id)).not.toBeNull();
    expect(saved).toHaveLength(0);
    const list = await call(port, 'GET', '/v1/fs/list?path=', undefined, { 'x-localshare-token': paired.body.accessToken });
    expect(list.statusCode).toBe(401);
    expect(gateway.forgetPairedDevice('not-a-valid-id')).toBeNull();
  });

  test('a session tells the host whether the sender is paired', async () => {
    const seen = [];
    const port = await startGateway({
      onSessionRequest: async (_req, ctx) => { seen.push(ctx); return { accepted: true }; }
    });
    const paired = await call(port, 'POST', '/v1/live/connect', { deviceId: 'phone-1', displayName: 'Pixel', pairingCode: '123456' });
    const session = (id) => ({ sessionId: id, sender: { deviceId: 'phone-1' }, files: [{ fileId: 'f1', fileName: 'a.jpg', fileSize: 1 }] });

    await call(port, 'POST', '/v1/session', session('s-paired'), { 'x-localshare-token': paired.body.accessToken });
    await call(port, 'POST', '/v1/session', session('s-stranger'));
    expect(seen[0].paired).toBe(true);
    expect(seen[0].pairedDevice.displayName).toBe('Pixel');
    expect(seen[1].paired).toBe(false);
  });
});

describe('Desktop engine identity and auto-accept', () => {
  let dir;
  let stateFile;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'localshare-state-'));
    stateFile = path.join(dir, 'state.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('the PC keeps the same id across launches', () => {
    const a = new DesktopEngine({ stateFile });
    const b = new DesktopEngine({ stateFile });
    expect(b.deviceId).toBe(a.deviceId);
    expect(b.fingerprint).toBe(a.fingerprint);
    expect(JSON.parse(fs.readFileSync(stateFile, 'utf8')).deviceId).toBe(a.deviceId);
  });

  test('files from a paired device are accepted without a prompt', async () => {
    const engine = new DesktopEngine({ stateFile });
    const events = [];
    engine.broadcastEvent = (type, data) => events.push({ type, data });
    const result = await engine.evaluateIncomingSession(
      { sessionId: 's1', files: [{ fileId: 'f1', fileSize: 10 }, { fileId: 'f2', fileSize: 5 }] },
      { paired: true, pairedDevice: { displayName: 'Pixel' } }
    );
    expect(result).toEqual({ accepted: true });
    expect(events.map((e) => e.type)).toEqual(['transfer_auto_accepted']);
    expect(events[0].data).toMatchObject({ senderName: 'Pixel', fileCount: 2, totalBytes: 15 });
  });

  test('with auto-accept turned off, paired devices are asked like everyone else', async () => {
    fs.writeFileSync(stateFile, JSON.stringify({ autoAcceptPaired: false }));
    const engine = new DesktopEngine({ stateFile });
    const events = [];
    engine.broadcastEvent = (type, data) => events.push({ type, data });
    const pending = engine.evaluateIncomingSession({ sessionId: 's2', files: [] }, { paired: true, pairedDevice: { displayName: 'Pixel' } });
    const prompt = events.find((e) => e.type === 'incoming_request');
    expect(prompt).toBeDefined();
    engine.respondToRequest(prompt.data.requestId, false);
    await expect(pending).resolves.toEqual({ accepted: false, reason: 'rejected_by_user' });
  });

  test('a corrupt state file starts fresh instead of crashing', () => {
    fs.writeFileSync(stateFile, '{not json');
    const engine = new DesktopEngine({ stateFile });
    expect(engine.deviceId).toMatch(/^pc-[0-9a-f]{16}$/);
    expect(engine.autoAcceptPaired).toBe(true);
  });
});
