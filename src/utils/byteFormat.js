/**
 * Utility functions for formatting byte counts, speeds, and transfer durations.
 */

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/**
 * Format raw byte count into human-readable string.
 * @param {number} bytes - Size in bytes.
 * @param {number} [decimals=2] - Number of decimal places.
 * @returns {string} Formatted size string (e.g. "12.45 MB").
 */
export function formatBytes(bytes, decimals = 2) {
  if (typeof bytes !== 'number' || isNaN(bytes) || bytes < 0) {
    return '0 B';
  }
  if (bytes === 0) {
    return '0 B';
  }

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const unitIndex = Math.min(i, UNITS.length - 1);
  const value = bytes / Math.pow(k, unitIndex);

  return `${parseFloat(value.toFixed(dm))} ${UNITS[unitIndex]}`;
}

/**
 * Format byte transfer rate into human-readable speed string.
 * @param {number} bytesPerSecond - Speed in bytes per second.
 * @returns {string} Formatted speed string (e.g. "4.20 MB/s").
 */
export function formatSpeed(bytesPerSecond) {
  if (typeof bytesPerSecond !== 'number' || isNaN(bytesPerSecond) || bytesPerSecond <= 0) {
    return '0 B/s';
  }
  return `${formatBytes(bytesPerSecond, 2)}/s`;
}

/**
 * Format remaining transfer duration into a human-readable ETA.
 * @param {number} remainingBytes - Remaining bytes to transfer.
 * @param {number} bytesPerSecond - Current transfer speed.
 * @returns {string} Formatted ETA (e.g. "02:15" or "--").
 */
export function formatEta(remainingBytes, bytesPerSecond) {
  if (
    typeof remainingBytes !== 'number' ||
    typeof bytesPerSecond !== 'number' ||
    bytesPerSecond <= 0 ||
    remainingBytes <= 0
  ) {
    return '--';
  }

  const totalSeconds = Math.ceil(remainingBytes / bytesPerSecond);
  if (!isFinite(totalSeconds) || totalSeconds < 0) {
    return '--';
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n) => String(n).padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}
