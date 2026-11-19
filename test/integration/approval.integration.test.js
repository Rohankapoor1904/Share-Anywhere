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
      onSessionRequest: (req) => engine.requestIncomingApproval(req)
    });
    const bound = await gateway.start();
    port = bound.port;
  });

  afterEach(async () => {
    await gateway.stop();
  });

  test('accepting the prompt lets the real session handshake succeed', async () => {
    const pending = postSession(port, buildSession());

    await new Promise((resolve) => setTimeout(resolve, 150));
    const reqEvent = events.find((e) => e.type === 'incoming_request');
    expect(reqEvent).toBeDefined();
    expect(reqEvent.data.senderName).toBe('Pixel 8');
    engine.respondToRequest(reqEvent.data.requestId, true);

    const res = await pending;
    expect(res.statusCode).toBe(200);
    expect(res.body.accepted).toBe(true);
  });

  test('declining the prompt rejects the real session handshake', async () => {
    const pending = postSession(port, buildSession());

    await new Promise((resolve) => setTimeout(resolve, 150));
    const reqEvent = events.find((e) => e.type === 'incoming_request');
    engine.respondToRequest(reqEvent.data.requestId, false);

    const res = await pending;
    expect(res.statusCode).toBe(200);
    expect(res.body.accepted).toBe(false);
    expect(res.body.reason).toBe('rejected_by_user');
  });
});
