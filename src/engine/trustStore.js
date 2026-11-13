import AsyncStorage from '@react-native-async-storage/async-storage';
import { TrustMismatchError } from '../utils/errors';
import { defaultLogger } from '../utils/logger';

const logger = defaultLogger;
const STORAGE_KEY_PREFIX = 'localshare:trust:';

/**
 * Interface for pluggable trust storage persistence.
 */
export class InMemoryTrustPersistence {
  constructor() {
    /** @type {Map<string, string>} */
    this.store = new Map();
  }

  async getItem(key) {
    return this.store.get(key) || null;
  }

  async setItem(key, value) {
    this.store.set(key, value);
  }

  async removeItem(key) {
    this.store.delete(key);
  }

  async getAllKeys() {
    return Array.from(this.store.keys());
  }

  async multiGet(keys) {
    return keys.map((k) => [k, this.store.get(k) || null]);
  }
}

export class AsyncStoragePersistence {
  async getItem(key) {
    return AsyncStorage.getItem(key);
  }

  async setItem(key, value) {
    return AsyncStorage.setItem(key, value);
  }

  async removeItem(key) {
    return AsyncStorage.removeItem(key);
  }

  async getAllKeys() {
    const keys = await AsyncStorage.getAllKeys();
    return keys.filter((k) => k.startsWith(STORAGE_KEY_PREFIX));
  }

  async multiGet(keys) {
    return AsyncStorage.multiGet(keys);
  }
}

export class TrustStore {
  /**
   * @param {object} [persistence] - Optional custom persistence layer (defaults to AsyncStorage).
   */
  constructor(persistence) {
    this.persistence = persistence || new AsyncStoragePersistence();
  }

  /**
   * Look up trusted record for device.
   * @param {string} deviceId
   * @returns {Promise<{ deviceId: string, fingerprint: string, trustedAt: number } | null>}
   */
  async get(deviceId) {
    if (!deviceId) return null;
    const key = `${STORAGE_KEY_PREFIX}${deviceId}`;
    try {
      const raw = await this.persistence.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      logger.error(`Failed to read trust record for ${deviceId}:`, err);
      return null;
    }
  }

  /**
   * Store trusted certificate fingerprint for device.
   * @param {string} deviceId
   * @param {string} fingerprint
   * @param {object} [meta]
   */
  async trust(deviceId, fingerprint, meta = {}) {
    if (!deviceId || !fingerprint) {
      throw new Error('deviceId and fingerprint are required to trust a device');
    }
    const key = `${STORAGE_KEY_PREFIX}${deviceId}`;
    const record = {
      deviceId,
      fingerprint,
      trustedAt: Date.now(),
      ...meta
    };
    await this.persistence.setItem(key, JSON.stringify(record));
    logger.info(`Trusted device ${deviceId} with fingerprint ${fingerprint}`);
    return record;
  }

  /**
   * Revoke trust for a device.
   * @param {string} deviceId
   */
  async revoke(deviceId) {
    if (!deviceId) return;
    const key = `${STORAGE_KEY_PREFIX}${deviceId}`;
    await this.persistence.removeItem(key);
    logger.info(`Revoked trust for device ${deviceId}`);
  }

  /**
   * Verify an incoming or outgoing peer's certificate fingerprint.
   * - If already trusted with matching fingerprint: returns true.
   * - If already trusted with DIFFERENT fingerprint: throws TrustMismatchError.
   * - If not yet trusted: returns false.
   * @param {string} deviceId
   * @param {string} actualFingerprint
   * @returns {Promise<boolean>}
   */
  async verify(deviceId, actualFingerprint) {
    const existing = await this.get(deviceId);
    if (!existing) {
      return false;
    }
    if (existing.fingerprint !== actualFingerprint) {
      throw new TrustMismatchError(deviceId, existing.fingerprint, actualFingerprint);
    }
    return true;
  }

  /**
   * Retrieve all trusted device records.
   * @returns {Promise<Array<{ deviceId: string, fingerprint: string, trustedAt: number }>>}
   */
  async getAll() {
    try {
      const keys = await this.persistence.getAllKeys();
      const trustKeys = keys.filter((k) => k.startsWith(STORAGE_KEY_PREFIX));
      if (trustKeys.length === 0) return [];
      const entries = await this.persistence.multiGet(trustKeys);
      return entries
        .map(([_, val]) => {
          if (!val) return null;
          try {
            return JSON.parse(val);
          } catch (e) {
            logger.warn('Failed parsing trust entry:', e);
            return null;
          }
        })
        .filter(Boolean);
    } catch (err) {
      logger.error('Failed to get all trusted devices:', err);
      return [];
    }
  }
}
