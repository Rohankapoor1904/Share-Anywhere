import { Platform } from 'react-native';

const ADJECTIVES = [
  'Swift', 'Cosmic', 'Solar', 'Lunar', 'Nimble', 'Bright', 'Silent', 'Vibrant',
  'Golden', 'Silver', 'Emerald', 'Crystal', 'Azure', 'Crimson', 'Radiant'
];

const NOUNS = [
  'Falcon', 'Comet', 'Beacon', 'Pioneer', 'Horizon', 'Voyager', 'Aurora',
  'Nexus', 'Pulse', 'Orbit', 'Echo', 'Phoenix', 'Haven', 'Glider', 'Drift'
];

/**
 * Generate a deterministic or randomized friendly device name.
 * @param {string} [seedId] - Optional identifier to seed generation.
 * @returns {string} Human-friendly device name (e.g. "Swift Comet (Android)").
 */
export function generateDeviceName(seedId) {
  let hash = 0;
  if (seedId && typeof seedId === 'string') {
    for (let i = 0; i < seedId.length; i++) {
      hash = ((hash << 5) - hash + seedId.charCodeAt(i)) | 0;
    }
  } else {
    hash = Math.floor(Math.random() * 1000000);
  }

  const absHash = Math.abs(hash);
  const adj = ADJECTIVES[absHash % ADJECTIVES.length];
  const noun = NOUNS[(Math.floor(absHash / ADJECTIVES.length)) % NOUNS.length];
  const platformName = Platform.OS === 'android' ? 'Android' : Platform.OS === 'ios' ? 'Apple' : 'Desktop';

  return `${adj} ${noun} (${platformName})`;
}

/**
 * Sanitize user-configured device name to adhere to mDNS / DNS-SD limits.
 * @param {string} rawName - Raw input string.
 * @returns {string} Sanitized device name up to 32 characters.
 */
export function sanitizeDeviceName(rawName) {
  if (!rawName || typeof rawName !== 'string') {
    return 'LocalShare-Device';
  }
  const cleaned = rawName.trim().replace(/[^\w\s-]/g, '').slice(0, 32);
  return cleaned.length > 0 ? cleaned : 'LocalShare-Device';
}
