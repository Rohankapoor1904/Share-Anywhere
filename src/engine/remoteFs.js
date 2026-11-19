import { NativeBridge } from '../native/NativeBridge';
import { defaultLogger } from '../utils/logger';

const logger = defaultLogger;

/**
 * Build the base HTTP URL for a peer's LocalShare transfer gateway.
 * @param {object} peer
 * @returns {string}
 */
export function peerBaseUrl(peer) {
  if (!peer || !peer.address) {
    throw new Error('Invalid peer: address is required');
  }
  const scheme = peer.useTls === true ? 'https' : 'http';
  const port = peer.port || 53318;
  return `${scheme}://${peer.address}:${port}`;
}

/**
 * Client for the remote /v1/fs/* and /v1/clipboard wire protocol.
 * Every call performs a real HTTP request against the peer.
 */
export class RemoteFsClient {
  /**
   * @param {object} peer
   */
  constructor(peer) {
    this.peer = peer;
    this.baseUrl = peerBaseUrl(peer);
  }

  /**
   * List a directory on the remote peer.
   * @param {string} [path]
   * @returns {Promise<{ currentPath: string, parentPath: string|null, entries: Array<object> }>}
   */
  async list(path = '') {
    const res = await fetch(`${this.baseUrl}/v1/fs/list?path=${encodeURIComponent(path)}`);
    if (!res.ok) {
      throw new Error(`Remote list failed: HTTP ${res.status}`);
    }
    return res.json();
  }

  /**
   * Duplicate a file/folder on the remote peer.
   * @param {string} sourcePath
   * @param {string} [destinationPath]
   * @returns {Promise<{ success: boolean, newPath: string }>}
   */
  async copy(sourcePath, destinationPath) {
    const res = await fetch(`${this.baseUrl}/v1/fs/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourcePath, destinationPath })
    });
    if (!res.ok) {
      throw new Error(`Remote copy failed: HTTP ${res.status}`);
    }
    return res.json();
  }

  /**
   * Delete a file/folder on the remote peer.
   * @param {string} path
   * @returns {Promise<{ success: boolean, deletedPath: string }>}
   */
  async remove(path) {
    const res = await fetch(`${this.baseUrl}/v1/fs/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path })
    });
    if (!res.ok) {
      throw new Error(`Remote delete failed: HTTP ${res.status}`);
    }
    return res.json();
  }

  /**
   * Build a directly streamable URL for a remote file (supports HTTP Range).
   * @param {string} path
   * @returns {string}
   */
  streamUrl(path) {
    return `${this.baseUrl}/v1/fs/stream?path=${encodeURIComponent(path)}`;
  }

  /**
   * Build a download URL for a remote file.
   * @param {string} path
   * @returns {string}
   */
  downloadUrl(path) {
    return `${this.baseUrl}/v1/fs/download?path=${encodeURIComponent(path)}`;
  }

  /**
   * Build a thumbnail URL for a remote image/video.
   * @param {string} path
   * @param {number} [size=240]
   * @returns {string}
   */
  thumbnailUrl(path, size = 240) {
    return `${this.baseUrl}/v1/fs/thumbnail?path=${encodeURIComponent(path)}&size=${size}`;
  }

  /**
   * Query smart category entries from the peer.
   * @param {string} [type='photos']
   * @param {number} [limit=60]
   * @param {number} [offset=0]
   * @returns {Promise<{ type: string, total: number, offset: number, limit: number, entries: Array<object> }>}
   */
  async categories(type = 'photos', limit = 60, offset = 0) {
    const res = await fetch(`${this.baseUrl}/v1/fs/categories?type=${encodeURIComponent(type)}&limit=${limit}&offset=${offset}`);
    if (!res.ok) {
      throw new Error(`Categories fetch failed: HTTP ${res.status}`);
    }
    return res.json();
  }

  /**
   * Search files on the remote peer by filename query.
   * @param {string} q
   * @returns {Promise<{ query: string, count: number, entries: Array<object> }>}
   */
  async search(q) {
    const res = await fetch(`${this.baseUrl}/v1/fs/search?q=${encodeURIComponent(q || '')}`);
    if (!res.ok) {
      throw new Error(`Search failed: HTTP ${res.status}`);
    }
    return res.json();
  }

  /**
   * Fetch live hardware & storage telemetry from the peer.
   * @returns {Promise<object>}
   */
  async telemetry() {
    const res = await fetch(`${this.baseUrl}/v1/telemetry`);
    if (!res.ok) {
      throw new Error(`Telemetry fetch failed: HTTP ${res.status}`);
    }
    return res.json();
  }

  /**
   * Pull a remote file into this device's Downloads/LocalShare folder.
   * @param {string} path
   * @param {string} fileName
   * @returns {Promise<{ savedPath: string, size: number }>}
   */
  async downloadToDevice(path, fileName) {
    if (NativeBridge.isAvailable()) {
      return NativeBridge.downloadUrlToFile(this.downloadUrl(path), fileName);
    }
    // Non-native fallback (tests / desktop): fetch the bytes directly.
    const res = await fetch(this.downloadUrl(path));
    if (!res.ok) {
      throw new Error(`Remote download failed: HTTP ${res.status}`);
    }
    const buffer = await res.arrayBuffer();
    logger.info(`Downloaded ${fileName} (${buffer.byteLength} bytes) via JS fallback`);
    return { savedPath: fileName, size: buffer.byteLength };
  }

  /**
   * Read the peer's current clipboard text.
   * @returns {Promise<string>}
   */
  async getClipboard() {
    const res = await fetch(`${this.baseUrl}/v1/clipboard`);
    if (!res.ok) {
      throw new Error(`Clipboard fetch failed: HTTP ${res.status}`);
    }
    const data = await res.json();
    return typeof data.text === 'string' ? data.text : '';
  }

  /**
   * Write text to the peer's clipboard.
   * @param {string} text
   * @param {string} [sender]
   * @returns {Promise<boolean>}
   */
  async setClipboard(text, sender = '') {
    const res = await fetch(`${this.baseUrl}/v1/clipboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, sender })
    });
    if (!res.ok) {
      throw new Error(`Clipboard write failed: HTTP ${res.status}`);
    }
    const data = await res.json();
    return Boolean(data.success);
  }
}
