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
  TransferClientModule,
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

  updateForegroundProgress(title, content, progress) {
    if (TransferForegroundService && TransferForegroundService.updateProgress) {
      TransferForegroundService.updateProgress(title, content, progress);
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

  // Incoming transfer approval (releases the native server's waiting HTTP handler)
  async respondToSession(sessionId, accepted) {
    if (TransferServerModule && TransferServerModule.respondToSession) {
      return TransferServerModule.respondToSession(sessionId, accepted);
    }
    return true;
  },

  // Native streaming chunk upload (content:// URIs never cross the RN bridge as base64)
  async uploadChunkFromUri(url, fileUri, offset, length, headers) {
    if (TransferClientModule && TransferClientModule.uploadChunkFromUri) {
      return TransferClientModule.uploadChunkFromUri(url, fileUri, offset, length, headers || {});
    }
    throw new Error('TransferClientModule.uploadChunkFromUri is not available');
  },

  // Native single-stream sender (sequential read from single open stream, 4MB chunks, incremental SHA-256)
  async sendFileStream(baseUrl, sessionId, fileId, fileUri, fileName, totalBytes, startOffset = 0, chunkSize = 4194304) {
    if (TransferClientModule && TransferClientModule.sendFileStream) {
      return TransferClientModule.sendFileStream(
        baseUrl,
        sessionId,
        fileId,
        fileUri,
        fileName,
        totalBytes,
        startOffset,
        chunkSize
      );
    }
    throw new Error('TransferClientModule.sendFileStream is not available');
  },

  cancelSession(sessionId) {
    if (TransferClientModule && TransferClientModule.cancelSession) {
      TransferClientModule.cancelSession(sessionId);
    }
  },

  // Storage
  async getDownloadsDirectory() {
    if (StorageModule && StorageModule.getDownloadsDirectory) {
      return StorageModule.getDownloadsDirectory();
    }
    return '/storage/emulated/0/Download';
  },

  async listReceivedFiles() {
    if (StorageModule && StorageModule.listReceivedFiles) {
      return StorageModule.listReceivedFiles();
    }
    return [];
  },

  async hasAllFilesAccess() {
    if (StorageModule && StorageModule.hasAllFilesAccess) {
      return StorageModule.hasAllFilesAccess();
    }
    return false;
  },

  async requestAllFilesAccess() {
    if (StorageModule && StorageModule.requestAllFilesAccess) {
      return StorageModule.requestAllFilesAccess();
    }
    return false;
  },

  async openRemoteStreamUrl(url, mimeType) {
    if (StorageModule && StorageModule.openRemoteStreamUrl) {
      return StorageModule.openRemoteStreamUrl(url, mimeType || 'application/octet-stream');
    }
    return false;
  },

  // Remote file pull (writes real bytes into Downloads/LocalShare)
  async downloadUrlToFile(url, fileName) {
    if (TransferClientModule && TransferClientModule.downloadUrlToFile) {
      return TransferClientModule.downloadUrlToFile(url, fileName);
    }
    throw new Error('TransferClientModule.downloadUrlToFile is not available');
  },

  // System clipboard (read/write on the UI thread + monitoring)
  async getClipboardText() {
    if (StorageModule && StorageModule.getClipboardText) {
      return StorageModule.getClipboardText();
    }
    return '';
  },

  async setClipboardText(text, hash = '') {
    if (StorageModule && StorageModule.setClipboardText) {
      return StorageModule.setClipboardText(text, hash);
    }
    return false;
  },

  async startClipboardMonitoring() {
    if (StorageModule && StorageModule.startClipboardMonitoring) {
      return StorageModule.startClipboardMonitoring();
    }
    return false;
  },

  async stopClipboardMonitoring() {
    if (StorageModule && StorageModule.stopClipboardMonitoring) {
      return StorageModule.stopClipboardMonitoring();
    }
    return false;
  },

  async checkClipboardOnActive() {
    if (StorageModule && StorageModule.checkClipboardOnActive) {
      return StorageModule.checkClipboardOnActive();
    }
    return false;
  }
};
