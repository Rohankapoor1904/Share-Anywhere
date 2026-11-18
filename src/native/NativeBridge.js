import { NativeModules, Platform } from 'react-native';
import { defaultLogger } from '../utils/logger';

const logger = defaultLogger;
const {
  EphemeralCertModule,
  HashingModule,
  PinModule,
  NsdDiscoveryModule,
  BleDiscoveryModule,
  TransferServerModule,
  TransferForegroundService,
  StorageModule
} = NativeModules;

export const NativeBridge = {
  isAvailable() {
    return Platform.OS === 'android' && Boolean(NsdDiscoveryModule);
  },

  // Crypto & PIN
  async getEphemeralCert() {
    if (EphemeralCertModule && EphemeralCertModule.getCertificate) {
      return EphemeralCertModule.getCertificate();
    }
    return {
      fingerprint: 'FALLBACK:SHA256:000000000000',
      certPem: '',
      keyPem: ''
    };
  },

  async computeFileHash(filePath) {
    if (HashingModule && HashingModule.computeFileHash) {
      return HashingModule.computeFileHash(filePath);
    }
    throw new Error('HashingModule is not available on this platform');
  },

  async generatePin() {
    if (PinModule && PinModule.generatePin) {
      return PinModule.generatePin();
    }
    const pinNum = Math.floor(100000 + Math.random() * 900000);
    return { pin: String(pinNum) };
  },

  async constantTimeCompare(a, b) {
    if (PinModule && PinModule.constantTimeCompare) {
      return PinModule.constantTimeCompare(a, b);
    }
    return a === b;
  },

  // Discovery
  async registerMdns(port, txtRecords = {}) {
    if (NsdDiscoveryModule && NsdDiscoveryModule.registerService) {
      return NsdDiscoveryModule.registerService(port, txtRecords);
    }
    logger.info(`[NativeBridge] mDNS service registration skipped (non-Android / module unavailable)`);
  },

  async unregisterMdns() {
    if (NsdDiscoveryModule && NsdDiscoveryModule.unregisterService) {
      return NsdDiscoveryModule.unregisterService();
    }
  },

  async startMdnsDiscovery() {
    if (NsdDiscoveryModule && NsdDiscoveryModule.startDiscovery) {
      return NsdDiscoveryModule.startDiscovery();
    }
  },

  async stopMdnsDiscovery() {
    if (NsdDiscoveryModule && NsdDiscoveryModule.stopDiscovery) {
      return NsdDiscoveryModule.stopDiscovery();
    }
  },

  // BLE
  async startBleAdvertising(uuid, payload) {
    if (BleDiscoveryModule && BleDiscoveryModule.startAdvertising) {
      return BleDiscoveryModule.startAdvertising(uuid, payload);
    }
  },

  async stopBleAdvertising() {
    if (BleDiscoveryModule && BleDiscoveryModule.stopAdvertising) {
      return BleDiscoveryModule.stopAdvertising();
    }
  },

  async startBleScanning(uuid) {
    if (BleDiscoveryModule && BleDiscoveryModule.startScanning) {
      return BleDiscoveryModule.startScanning(uuid);
    }
  },

  async stopBleScanning() {
    if (BleDiscoveryModule && BleDiscoveryModule.stopScanning) {
      return BleDiscoveryModule.stopScanning();
    }
  },

  // Foreground Service
  startForegroundService(title, content) {
    if (TransferForegroundService && TransferForegroundService.startService) {
      TransferForegroundService.startService(title, content);
    }
  },

  stopForegroundService() {
    if (TransferForegroundService && TransferForegroundService.stopService) {
      TransferForegroundService.stopService();
    }
  },

  // Native Transfer Server
  async startServer(port = 53318) {
    if (TransferServerModule && TransferServerModule.startServer) {
      return TransferServerModule.startServer(port);
    }
  },

  async stopServer() {
    if (TransferServerModule && TransferServerModule.stopServer) {
      return TransferServerModule.stopServer();
    }
  },

  updateDeviceInfo(info) {
    if (TransferServerModule && TransferServerModule.updateDeviceInfo) {
      TransferServerModule.updateDeviceInfo(info);
    }
  },

  // Storage
  async getDownloadsDirectory() {
    if (StorageModule && StorageModule.getDownloadsDirectory) {
      return StorageModule.getDownloadsDirectory();
    }
    return '/storage/emulated/0/Download';
  }
};
