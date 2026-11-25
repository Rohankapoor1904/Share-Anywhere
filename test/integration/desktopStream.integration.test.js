const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { TransferGateway } = require('../../nodejs-assets/nodejs-project/transfer-gateway');
const { DesktopEngine } = require('../../desktop/engine/desktop-node');

describe('PC sender streams files to a receiver that supports it', () => {
  let engine;
  let gateway;
  let port;
  let storageDir;
  let srcDir;
  let seenPaths;

  beforeEach(async () => {
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'localshare-recv-'));
    srcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'localshare-src-'));
    seenPaths = [];
    gateway = new TransferGateway({ port: 0, storageDir });
    const original = gateway.handleRequest.bind(gateway);
    gateway.handleRequest = (req, res) => {
      seenPaths.push(req.url.split('?')[0]);
      return original(req, res);
    };
    port = (await gateway.start()).port;
    engine = new DesktopEngine();
    engine.broadcastEvent = () => {};
  });

  afterEach(async () => {
    // Close the sender's keep-alive sockets first so the receiver can shut down promptly.
    await engine.stop();
    await gateway.stop();
    fs.rmSync(storageDir, { recursive: true, force: true });
    fs.rmSync(srcDir, { recursive: true, force: true });
  });

  test('a file is sent as one /v1/stream request and arrives identical', async () => {
    const bytes = crypto.randomBytes(5 * 1024 * 1024 + 7);
    const srcPath = path.join(srcDir, 'video.mp4');
    fs.writeFileSync(srcPath, bytes);
    const files = [{ name: 'video.mp4', path: srcPath, size: bytes.length }];
    const entry = { startTime: Date.now(), bytesTransferred: 0, totalBytes: bytes.length };

    await engine.sendViaLocalShare({ address: '127.0.0.1', port }, files, entry, 'sess-desktop-stream');

    expect(seenPaths.filter((p) => p === '/v1/stream')).toHaveLength(1);
    expect(seenPaths).not.toContain('/v1/chunk');
    expect(entry.bytesTransferred).toBe(bytes.length);
    const saved = path.join(storageDir, 'video.mp4');
    expect(fs.readFileSync(saved).equals(bytes)).toBe(true);
  });

  test('several files in one session all arrive', async () => {
    const files = [1, 2, 3].map((n) => {
      const bytes = crypto.randomBytes(300000 * n);
      const p = path.join(srcDir, `doc${n}.bin`);
      fs.writeFileSync(p, bytes);
      return { name: `doc${n}.bin`, path: p, size: bytes.length, bytes };
    });
    const entry = { startTime: Date.now(), bytesTransferred: 0, totalBytes: files.reduce((a, f) => a + f.size, 0) };

    await engine.sendViaLocalShare({ address: '127.0.0.1', port }, files, entry, 'sess-desktop-multi');

    for (const f of files) {
      expect(fs.readFileSync(path.join(storageDir, f.name)).equals(f.bytes)).toBe(true);
    }
  });
});
