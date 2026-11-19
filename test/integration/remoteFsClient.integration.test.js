const fs = require('fs');
const path = require('path');
const os = require('os');
const { TransferGateway } = require('../../nodejs-assets/nodejs-project/transfer-gateway');

// RemoteFsClient imports NativeBridge (react-native) which is not loadable in a
// plain Node integration test, so exercise the real HTTP wire protocol directly.
function buildClient(baseUrl) {
  return {
    baseUrl,
    async list(p) {
      const res = await fetch(`${baseUrl}/v1/fs/list?path=${encodeURIComponent(p || '')}`);
      if (!res.ok) throw new Error(`Remote list failed: HTTP ${res.status}`);
      return res.json();
    },
    async copy(sourcePath, destinationPath) {
      const res = await fetch(`${baseUrl}/v1/fs/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourcePath, destinationPath })
      });
      if (!res.ok) throw new Error(`Remote copy failed: HTTP ${res.status}`);
      return res.json();
    },
    async remove(p) {
      const res = await fetch(`${baseUrl}/v1/fs/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: p })
      });
      if (!res.ok) throw new Error(`Remote delete failed: HTTP ${res.status}`);
      return res.json();
    },
    async getClipboard() {
      const res = await fetch(`${baseUrl}/v1/clipboard`);
      if (!res.ok) throw new Error(`Clipboard fetch failed: HTTP ${res.status}`);
      const data = await res.json();
      return typeof data.text === 'string' ? data.text : '';
    },
    downloadUrl(p) {
      return `${baseUrl}/v1/fs/download?path=${encodeURIComponent(p)}`;
    },
    streamUrl(p) {
      return `${baseUrl}/v1/fs/stream?path=${encodeURIComponent(p)}`;
    }
  };
}

describe('Remote FS client wire protocol (real HTTP)', () => {
  let server;
  let port;
  let root;
  let storageDir;
  let client;

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'localshare-client-'));
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'localshare-clientstore-'));
    fs.writeFileSync(path.join(root, 'doc.txt'), 'client payload');

    server = new TransferGateway({ port: 0, storageDir, browseRoot: root });
    const addr = await server.start();
    port = addr.port;
    client = buildClient(`http://127.0.0.1:${port}`);
  });

  afterAll(async () => {
    await server.stop();
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(storageDir, { recursive: true, force: true });
  });

  test('list returns the remote directory listing', async () => {
    const listing = await client.list('');
    expect(listing.entries.some((e) => e.name === 'doc.txt')).toBe(true);
  });

  test('downloadUrl streams real bytes', async () => {
    const res = await fetch(client.downloadUrl(path.join(root, 'doc.txt')));
    expect(await res.text()).toBe('client payload');
  });

  test('copy then delete round-trips on the remote peer', async () => {
    const copy = await client.copy(path.join(root, 'doc.txt'));
    expect(fs.existsSync(copy.newPath)).toBe(true);
    const del = await client.remove(copy.newPath);
    expect(del.success).toBe(true);
    expect(fs.existsSync(copy.newPath)).toBe(false);
  });

  test('getClipboard returns a string', async () => {
    const text = await client.getClipboard();
    expect(typeof text).toBe('string');
  });
});
