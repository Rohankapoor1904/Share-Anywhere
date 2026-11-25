const http = require('http');
const { TransferGateway } = require('../../nodejs-assets/nodejs-project/transfer-gateway');
const { DesktopEngine } = require('../../desktop/engine/desktop-node');
const { SessionRequest, FileDescriptor } = require('../../nodejs-assets/nodejs-project/models');

function postSession(port, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/v1/session',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function postJson(port, requestPath, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: requestPath,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function waitForEvent(events, type) {
  const start = Date.now();
  while (Date.now() - start < 4000) {
    const found = events.find((e) => e.type === type);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return undefined;
}

function buildSession() {
  return new SessionRequest({
    sessionId: `sess-${Date.now()}`,
    sender: { deviceId: 'phone-1', displayName: 'Pixel 8', fingerprint: 'FP-PHONE', platform: 'android' },
    files: [new FileDescriptor({ fileId: 'f1', fileName: 'photo.jpg', fileSize: 2048, mimeType: 'image/jpeg', sha256: '' })]
  }).toJSON();
}

describe('Incoming transfer approval over real sockets', () => {
  let engine;
  let gateway;
  let port;
  let events;

  beforeEach(async () => {
    engine = new DesktopEngine();
    events = [];
    engine.broadcastEvent = (type, data) => events.push({ type, data });

    gateway = new TransferGateway({
      port: 0,
      storageDir: engine.storageDir,
      selfDevice: engine.selfDevice,
      onSessionRequest: (req) => engine.requestIncomingApproval(req),
      onConnectRequest: (peer) => engine.requestIncomingApproval({ kind: 'connect', sender: peer, files: [] })
    });
    const bound = await gateway.start();
    port = bound.port;
  });

  afterEach(async () => {
    await gateway.stop();
  });

  test('accepting the prompt lets the real session handshake succeed', async () => {
    const pending = postSession(port, buildSession());

    const start = Date.now();
    let reqEvent;
    while (!reqEvent && Date.now() - start < 4000) {
      reqEvent = events.find((e) => e.type === 'incoming_request');
      if (!reqEvent) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(reqEvent).toBeDefined();
    expect(reqEvent.data.senderName).toBe('Pixel 8');
    engine.respondToRequest(reqEvent.data.requestId, true);

    const res = await pending;
    expect(res.statusCode).toBe(200);
    expect(res.body.accepted).toBe(true);
  });

  test('declining the prompt rejects the real session handshake', async () => {
    const pending = postSession(port, buildSession());

    const start = Date.now();
    let reqEvent;
    while (!reqEvent && Date.now() - start < 4000) {
      reqEvent = events.find((e) => e.type === 'incoming_request');
      if (!reqEvent) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(reqEvent).toBeDefined();
    engine.respondToRequest(reqEvent.data.requestId, false);

    const res = await pending;
    expect(res.statusCode).toBe(200);
    expect(res.body.accepted).toBe(false);
    expect(res.body.reason).toBe('rejected_by_user');
  });

  test('a phone without the pairing code is paired only after the user approves', async () => {
    const pending = postJson(port, '/v1/live/connect', { deviceId: 'phone-2', displayName: 'Galaxy S24', platform: 'android' });
    const reqEvent = await waitForEvent(events, 'incoming_request');
    expect(reqEvent).toBeDefined();
    expect(reqEvent.data.kind).toBe('connect');
    expect(reqEvent.data.senderName).toBe('Galaxy S24');
    engine.respondToRequest(reqEvent.data.requestId, true);

    const res = await pending;
    expect(res.statusCode).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
  });

  test('declining a connection request returns no token', async () => {
    const pending = postJson(port, '/v1/live/connect', { deviceId: 'phone-3', displayName: 'Unknown' });
    const reqEvent = await waitForEvent(events, 'incoming_request');
    expect(reqEvent).toBeDefined();
    engine.respondToRequest(reqEvent.data.requestId, false);

    const res = await pending;
    expect(res.statusCode).toBe(403);
    expect(res.body.accessToken).toBeUndefined();
  });

  test('stopping while a prompt is unanswered declines it, so the servers can close', async () => {
    const pending = postSession(port, buildSession());
    const reqEvent = await waitForEvent(events, 'incoming_request');
    expect(reqEvent).toBeDefined();

    const started = Date.now();
    await engine.stop();
    await gateway.stop();
    expect(Date.now() - started).toBeLessThan(3000);

    const res = await pending;
    expect(res.body.accepted).toBe(false);
  });
});
