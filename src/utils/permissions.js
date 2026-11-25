import { PermissionsAndroid, Platform } from 'react-native';
import { defaultLogger } from './logger';
import { NativeBridge } from '../native/NativeBridge';

const logger = defaultLogger;

/**
 * True when the app may post notifications (always true outside Android 13+).
 * @returns {Promise<boolean>}
 */
export async function hasNotificationPermission() {
  if (Platform.OS !== 'android') {
    return true;
  }
  if (Platform.Version < 33) {
    return true;
  }
  try {
    return await PermissionsAndroid.check(
      /** @type {any} */ (PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)
    );
  } catch (err) {
    logger.warn('Failed checking notification permission:', err.message);
    return false;
  }
}

/**
 * Requests POST_NOTIFICATIONS only when it has not been granted yet, so the
 * foreground-service status notification is visible before any connection is made.
 * @returns {Promise<boolean>}
 */
export async function ensureNotificationPermission() {
  if (await hasNotificationPermission()) {
    return true;
  }
  if (Platform.OS !== 'android' || Platform.Version < 33) {
    return true;
  }
  try {
    const result = await PermissionsAndroid.request(
      /** @type {any} */ (PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    logger.warn('Failed requesting notification permission:', err.message);
    return false;
  }
}

/**
 * Requests all required Android runtime permissions for peer discovery (mDNS, BLE, Subnet)
 * and file storage operations across all Android API versions (Android 10 - 14+).
 * @returns {Promise<boolean>}
 */
export async function requestDiscoveryPermissions() {
  if (Platform.OS !== 'android') {
    return true;
  }

  try {
    const permissions = [];

    // Android 13+ (API 33+)
    if (Platform.Version >= 33) {
      if (PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES) {
        permissions.push(PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES);
      }
      if (PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS) {
        permissions.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      }
      if (PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES) {
        permissions.push(PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES);
      }
    }

    // Android 12+ (API 31+)
    if (Platform.Version >= 31) {
      if (PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN) {
        permissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
      }
      if (PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE) {
        permissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE);
      }
      if (PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT) {
        permissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
      }
    }

    // Android <= 32 requires Location for Wi-Fi and BLE scanning
    if (Platform.Version <= 32) {
      if (PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION) {
        permissions.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
      }
      if (PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE) {
        permissions.push(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
      }
      if (PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE) {
        permissions.push(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE);
      }
    }

    const uniquePermissions = Array.from(new Set(permissions));
    if (uniquePermissions.length === 0) {
      return true;
    }

    const results = await PermissionsAndroid.requestMultiple(
      /** @type {any} */ (uniquePermissions)
    );
    logger.info('Discovery permissions status:', results);
    return true;
  } catch (err) {
    logger.warn('Failed requesting discovery permissions:', err);
    return false;
  }
}

/**
 * Android 12 and older only report Bluetooth / Wi-Fi scan results (which Nearby relies on)
 * while the system Location service is switched on.
 * @returns {Promise<boolean>} true when offline sharing needs the user to turn Location on.
 */
export async function needsLocationServiceForNearby() {
  if (Platform.OS !== 'android' || Number(Platform.Version) > 32) {
    return false;
  }
  try {
    const enabled = await NativeBridge.nearbyIsLocationServiceEnabled();
    return !enabled;
  } catch (err) {
    logger.warn('Failed reading the Location service state:', err.message);
    return false;
  }
}

/**
 * Open the system Location settings screen.
 * @returns {Promise<boolean>}
 */
export async function openLocationSettings() {
  try {
    await NativeBridge.nearbyOpenLocationSettings();
    return true;
  } catch (err) {
    logger.warn('Failed opening Location settings:', err.message);
    return false;
  }
}
