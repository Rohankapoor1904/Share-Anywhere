import { defaultLogger } from '../utils/logger';

const logger = defaultLogger;
const MAX_ATTEMPTS = 3;

/**
 * Perform constant-time string comparison to prevent timing attacks on PIN verification.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function constantTimeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  const lengthA = a.length;
  const lengthB = b.length;
  let diff = lengthA ^ lengthB;

  const maxLen = Math.max(lengthA, lengthB);
  for (let i = 0; i < maxLen; i++) {
    const charA = i < lengthA ? a.charCodeAt(i) : 0;
    const charB = i < lengthB ? b.charCodeAt(i) : 0;
    diff |= charA ^ charB;
  }

  return diff === 0;
}

/**
 * Generate a random 6-digit numeric PIN.
 * @returns {string} 6-digit PIN string (e.g. "492015").
 */
export function generatePin() {
  const pinNum = Math.floor(100000 + Math.random() * 900000);
  return String(pinNum);
}

/**
 * Pairing engine managing trust evaluation, PIN challenges, and anti-brute-force rate limiting.
 */
export class PairingEngine {
  /**
   * @param {import('./trustStore').TrustStore} trustStore
   * @param {object} [options]
   * @param {boolean} [options.autoAcceptTrusted=true]
   * @param {boolean} [options.autoAcceptAll=false]
   * @param {(challenge: object) => void} [options.onChallenge]
   */
  constructor(trustStore, options = {}) {
    this.trustStore = trustStore;
    this.settings = {
      autoAcceptTrusted: options.autoAcceptTrusted !== undefined ? options.autoAcceptTrusted : true,
      autoAcceptAll: options.autoAcceptAll !== undefined ? options.autoAcceptAll : false
    };
    this.onChallenge = options.onChallenge || null;

    /** @type {Map<string, number>} deviceId -> consecutive failed attempt count */
    this.failedAttempts = new Map();

    /** @type {Map<string, { expectedPin: string, createdAt: number }>} deviceId -> active challenge */
    this.activeChallenges = new Map();
  }

  /**
   * Update pairing policy settings.
   * @param {Partial<{ autoAcceptTrusted: boolean, autoAcceptAll: boolean }>} newSettings
   */
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    logger.info('Updated pairing settings:', this.settings);
  }

  /**
   * Evaluate a pairing request for a device.
   * @param {string} deviceId
   * @param {string} fingerprint
   * @param {string} [candidatePin]
   * @returns {Promise<{ action: 'accept' | 'challenge' | 'reject', reason?: string, pin?: string }>}
   */
  async evaluate(deviceId, fingerprint, candidatePin) {
    if (!deviceId) {
      return { action: 'reject', reason: 'invalid_device_id' };
    }

    // Check failed attempts lockout
    const attempts = this.failedAttempts.get(deviceId) || 0;
    if (attempts >= MAX_ATTEMPTS) {
      logger.warn(`Device ${deviceId} locked out due to too many failed PIN attempts`);
      return { action: 'reject', reason: 'too_many_attempts' };
    }

    // Check if device is already trusted
    let isTrusted = false;
    try {
      isTrusted = await this.trustStore.verify(deviceId, fingerprint);
    } catch (err) {
      logger.warn(`Trust verification failed for ${deviceId}:`, err.message);
      return { action: 'reject', reason: 'fingerprint_mismatch' };
    }

    if (isTrusted && this.settings.autoAcceptTrusted) {
      this.failedAttempts.delete(deviceId);
      return { action: 'accept' };
    }

    if (this.settings.autoAcceptAll) {
      this.failedAttempts.delete(deviceId);
      await this.trustStore.trust(deviceId, fingerprint);
      return { action: 'accept' };
    }

    // Device is unknown or requires PIN confirmation
    const active = this.activeChallenges.get(deviceId);

    // If no candidate PIN provided, issue a new challenge
    if (!candidatePin) {
      const generated = generatePin();
      this.activeChallenges.set(deviceId, {
        expectedPin: generated,
        createdAt: Date.now()
      });

      if (this.onChallenge) {
        this.onChallenge({
          deviceId,
          fingerprint,
          expectedPin: generated,
          mode: 'display'
        });
      }

      return { action: 'challenge', pin: generated };
    }

    // Candidate PIN was supplied — verify it
    const expected = active ? active.expectedPin : null;
    if (!expected) {
      return { action: 'reject', reason: 'no_active_challenge' };
    }

    const matches = constantTimeCompare(candidatePin, expected);
    if (matches) {
      // Success: reset attempts, clean challenge, trust device, accept
      this.failedAttempts.delete(deviceId);
      this.activeChallenges.delete(deviceId);
      await this.trustStore.trust(deviceId, fingerprint);
      logger.info(`Device ${deviceId} successfully authenticated via PIN.`);
      return { action: 'accept' };
    }

    // Wrong PIN: increment attempt count
    const nextAttempts = attempts + 1;
    this.failedAttempts.set(deviceId, nextAttempts);
    logger.warn(`Device ${deviceId} provided wrong PIN. Attempt ${nextAttempts} of ${MAX_ATTEMPTS}`);

    if (nextAttempts >= MAX_ATTEMPTS) {
      this.activeChallenges.delete(deviceId);
      return { action: 'reject', reason: 'too_many_attempts' };
    }

    return { action: 'reject', reason: 'invalid_pin' };
  }

  /**
   * Reset attempt count for a device (e.g. on manual unblock).
   * @param {string} deviceId
   */
  resetAttempts(deviceId) {
    this.failedAttempts.delete(deviceId);
    this.activeChallenges.delete(deviceId);
  }
}
