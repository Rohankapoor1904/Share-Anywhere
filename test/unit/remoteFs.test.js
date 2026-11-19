import { RemoteFsClient, peerBaseUrl } from '../../src/engine/remoteFs';

describe('RemoteFsClient URL construction (§10, §14)', () => {
  test('peerBaseUrl builds an http URL from address and port', () => {
    expect(peerBaseUrl({ address: '192.168.1.40', port: 53318 })).toBe('http://192.168.1.40:53318');
  });

  test('peerBaseUrl defaults the port to 53318', () => {
    expect(peerBaseUrl({ address: '10.0.0.5' })).toBe('http://10.0.0.5:53318');
  });

  test('peerBaseUrl honors an https peer', () => {
    expect(peerBaseUrl({ address: '10.0.0.5', port: 53318, useTls: true })).toBe('https://10.0.0.5:53318');
  });

  test('peerBaseUrl rejects a peer without an address', () => {
    expect(() => peerBaseUrl({})).toThrow(/address/);
  });

  test('downloadUrl and streamUrl URL-encode the path', () => {
    const client = new RemoteFsClient({ address: '192.168.1.40', port: 53318 });
    expect(client.downloadUrl('/sdcard/a b.txt')).toBe(
      'http://192.168.1.40:53318/v1/fs/download?path=%2Fsdcard%2Fa%20b.txt'
    );
    expect(client.streamUrl('/sdcard/a b.txt')).toBe(
      'http://192.168.1.40:53318/v1/fs/stream?path=%2Fsdcard%2Fa%20b.txt'
    );
  });
});
