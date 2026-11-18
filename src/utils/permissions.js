import { PermissionsAndroid, Platform } from 'react-native';
import { defaultLogger } from './logger';

const logger = defaultLogger;

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
