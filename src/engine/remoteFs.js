import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeBridge } from '../native/NativeBridge';
import { defaultLogger } from '../utils/logger';

const logger = defaultLogger;

const TOKEN_HEADER = 'x-localshare-token';
const TOKENS_STORAGE_KEY = '@localshare:peer_tokens';

/**
 * Access tokens issued by paired peers. Stored under `id:<deviceId>` (survives the
 * PC changing IP) and `addr:<address>:<port>` (for peers seen without an id), and
 * saved so pairing survives app restarts.
 * @type {Map<string, string>}
 */
const peerTokens = new Map();

/**
 * @param {object} peer
 * @returns {string[]}
 */
function peerKeys(peer) {
  const keys = [];
  if (peer.deviceId) keys.push(`id:${peer.deviceId}`);
  if (peer.address) keys.push(`addr:${peer.address}:${peer.port || 53318}`);
  return keys;
}

function persistPeerTokens() {
  AsyncStorage.setItem(TOKENS_STORAGE_KEY, JSON.stringify(Object.fromEntries(peerTokens)))
    .catch((err) => logger.warn('Failed to save paired-device tokens:', err));
}

/**
 * Restore saved tokens. Call once at startup, before reconnecting to a peer.
 * @returns {Promise<void>}
 */
export async function loadPeerTokens() {
  try {
    const raw = await AsyncStorage.getItem(TOKENS_STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return;
    Object.entries(saved).forEach(([key, token]) => {
      if (typeof token === 'string' && token && !peerTokens.has(key)) peerTokens.set(key, token);
    });
  } catch (err) {
    logger.warn('Failed to restore paired-device tokens:', err);
  }
}

/**
 * Remember (or forget, with an empty token) the access token a peer issued on /v1/live/connect.
 * @param {object} peer
 * @param {string} token
 */
export function setPeerAccessToken(peer, token) {
  if (!peer || (!peer.address && !peer.deviceId)) return;
  peerKeys(peer).forEach((key) => {
    if (token) peerTokens.set(key, token);
    else peerTokens.delete(key);
  });
  persistPeerTokens();
}

/**
 * Access token for a peer this device has paired with, or ''.
 * @param {object} peer
 * @returns {string}
 */
export function getPeerAccessToken(peer) {
  if (!peer || (!peer.address && !peer.deviceId)) return '';
  if (peer.accessToken) return peer.accessToken;
  for (const key of peerKeys(peer)) {
    const token = peerTokens.get(key);
    if (token) return token;
  }
  return '';
}

/**
 * Headers that authorize a request to a paired peer.
 * @param {object} peer
 * @returns {Record<string, string>}
 */
export function peerAuthHeaders(peer) {
  const token = getPeerAccessToken(peer);
  return token ? { [TOKEN_HEADER]: token } : {};
}

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
   * @param {Record<string, string>} [extra]
   * @returns {Record<string, string>}
   */
  headers(extra = {}) {
    return { ...extra, ...peerAuthHeaders(this.peer) };
  }

  /**
   * Add the access token to a media URL (image/video sources and native
   * downloads cannot send headers).
   * @param {string} url
   * @returns {string}
   */
  withToken(url) {
    const token = getPeerAccessToken(this.peer);
    return token ? `${url}&token=${encodeURIComponent(token)}` : url;
  }

  /**
   * List a directory on the remote peer.
   * @param {string} [path]
   * @returns {Promise<{ currentPath: string, parentPath: string|null, entries: Array<object> }>}
   */
  async list(path = '') {
    const res = await fetch(`${this.baseUrl}/v1/fs/list?path=${encodeURIComponent(path)}`, { headers: this.headers() });
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
      headers: this.headers({ 'Content-Type': 'application/json' }),
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
      headers: this.headers({ 'Content-Type': 'application/json' }),
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
    return this.withToken(`${this.baseUrl}/v1/fs/stream?path=${encodeURIComponent(path)}`);
  }

  /**
   * Build a download URL for a remote file.
   * @param {string} path
   * @returns {string}
   */
  downloadUrl(path) {
    return this.withToken(`${this.baseUrl}/v1/fs/download?path=${encodeURIComponent(path)}`);
  }

  /**
   * Build a thumbnail URL for a remote image/video.
   * @param {string} path
   * @param {number} [size=240]
   * @returns {string}
   */
  thumbnailUrl(path, size = 240) {
    return this.withToken(`${this.baseUrl}/v1/fs/thumbnail?path=${encodeURIComponent(path)}&size=${size}`);
  }

  /**
   * Query smart category entries from the peer.
   * @param {string} [type='photos']
   * @param {number} [limit=60]
   * @param {number} [offset=0]
   * @returns {Promise<{ type: string, total: number, offset: number, limit: number, entries: Array<object> }>}
   */
  async categories(type = 'photos', limit = 60, offset = 0) {
    const res = await fetch(`${this.baseUrl}/v1/fs/categories?type=${encodeURIComponent(type)}&limit=${limit}&offset=${offset}`, { headers: this.headers() });
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
    const res = await fetch(`${this.baseUrl}/v1/fs/search?q=${encodeURIComponent(q || '')}`, { headers: this.headers() });
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
    const res = await fetch(`${this.baseUrl}/v1/telemetry`, { headers: this.headers() });
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
    const res = await fetch(`${this.baseUrl}/v1/clipboard`, { headers: this.headers() });
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
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ text, sender })
    });
    if (!res.ok) {
      throw new Error(`Clipboard write failed: HTTP ${res.status}`);
    }
    const data = await res.json();
    return Boolean(data.success);
  }
}
