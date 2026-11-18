import { Platform } from 'react-native';
import { EngineEventEmitter, EngineEventType } from './EngineEvents';
import { TrustStore } from './trustStore';
import { PairingEngine } from './pairing';
import { SendController } from './sendController';
import { ReceiveController } from './receiveController';
import { DeviceInfo } from './models';
import { NativeBridge } from '../native/NativeBridge';
import { NativeEvents } from '../native/NativeEvents';
import { generateDeviceName } from '../utils/deviceName';
import { requestDiscoveryPermissions } from '../utils/permissions';
import {
  kDefaultPort,
  kBleServiceUuid,
  kPeerStaleMs
} from '../utils/protocol';
import { defaultLogger } from '../utils/logger';

const logger = defaultLogger;

/**
 * Safely resolve local Wi-Fi IP address across mobile native and desktop/test environments.
 * Avoids crashing in Jest / Node.js test runners where RNCNetInfo native module is absent.
 * @returns {Promise<string|null>}
 */
async function getWifiIpAddress() {
  try {
    // Dynamic import to prevent crash in non-native / test environments
    // eslint-disable-next-line global-require
    const netInfoModule = require('@react-native-community/netinfo');
    const NetInfo = netInfoModule.default || netInfoModule;
    if (NetInfo && typeof NetInfo.fetch === 'function') {
      const netState = await NetInfo.fetch();
      const details = /** @type {*} */ (netState?.details);
      if (details && typeof details.ipAddress === 'string') {
        return details.ipAddress;
      }
    }
  } catch (err) {
    logger.debug('NetInfo unavailable in current environment:', err.message);
  }
  return null;
}

export class LocalShareNode {
  constructor() {
    this.events = new EngineEventEmitter();
    this.trustStore = new TrustStore();

    this.pairing = new PairingEngine(this.trustStore, {
      autoAcceptTrusted: true,
      autoAcceptAll: false,
      onChallenge: (challenge) => {
        this.events.emit(EngineEventType.PIN_CHALLENGE_REQUESTED, challenge);
      }
    });

    const randomSuffix = Math.floor(Math.random() * 10000);
    this.selfDevice = new DeviceInfo({
      deviceId: `ls-${Platform.OS}-${randomSuffix}`,
      displayName: generateDeviceName(`seed-${randomSuffix}`),
      address: '127.0.0.1',
      port: kDefaultPort,
      fingerprint: '',
      platform: Platform.OS || 'unknown'
    });

    this.sendController = new SendController({
      events: this.events,
      trustStore: this.trustStore,
      pairing: this.pairing,
      selfDevice: this.selfDevice
    });

    this.receiveController = new ReceiveController({
      events: this.events,
      trustStore: this.trustStore,
      pairing: this.pairing
    });

    /** @type {Map<string, DeviceInfo>} */
    this.peerMap = new Map();
    this.discovering = false;
    this.staleIntervalId = null;
    this.subnetScanIntervalId = null;
    this.isScanningSubnet = false;
    this.nativeUnsub = null;
  }

  getSelfDevice() {
    return this.selfDevice;
  }

  getPeers() {
    return Array.from(this.peerMap.values());
  }

  isDiscovering() {
    return this.discovering;
  }

  /**
   * Start the engine, load certificate, start native transfer server, and bind native listeners.
   */
  async start() {
    try {
      const cert = await NativeBridge.getEphemeralCert();
      this.selfDevice.fingerprint = cert.fingerprint || '';
    } catch (err) {
      logger.warn('Failed retrieving ephemeral cert from native layer:', err.message);
    }

    // Start native transfer server on port 53318
    try {
      await NativeBridge.startServer(this.selfDevice.port);
      NativeBridge.updateDeviceInfo({
        deviceId: this.selfDevice.deviceId,
        displayName: this.selfDevice.displayName,
        platform: this.selfDevice.platform
      });
    } catch (err) {
      logger.warn('Failed starting native transfer server:', err.message);
    }

    // Bind native events
    this.nativeUnsub = NativeEvents.subscribeAll({
      onPeerFound: (peer) => this._handlePeerSighting({ ...peer, discoveryChannel: 'mdns' }),
      onPeerLost: (peerId) => this._handlePeerLost(peerId),
      onBlePeerFound: (peer) => this._handlePeerSighting({ ...peer, discoveryChannel: 'ble' }),
      onIncomingSession: (sessionReq) => this.receiveController.handleIncomingSession(sessionReq),
      onReceiveProgress: (progress) => this.receiveController.handleChunkProgress(progress),
      onFileReceived: (file) => this.receiveController.handleFileReceived(file),
      onSendProgress: (progress) => this.events.emit(EngineEventType.TRANSFER_PROGRESS, progress),
      onSendFinished: (session) => this.events.emit(EngineEventType.TRANSFER_COMPLETED, session),
      onSendFailed: (err) => this.events.emit(EngineEventType.TRANSFER_FAILED, err),
      onServiceState: () => {}
    });

    // Start periodic staleness sweep
    this.staleIntervalId = setInterval(() => {
      this._sweepStalePeers();
    }, 5000);

    logger.info(`LocalShareNode started. Self device: ${this.selfDevice.displayName} (${this.selfDevice.deviceId})`);
  }

  /**
   * Stop the engine.
   */
  async stop() {
    if (this.discovering) {
      await this.stopDiscovery();
    }
    if (this.staleIntervalId) {
      clearInterval(this.staleIntervalId);
      this.staleIntervalId = null;
    }
    if (this.subnetScanIntervalId) {
      clearInterval(this.subnetScanIntervalId);
      this.subnetScanIntervalId = null;
    }
    try {
      await NativeBridge.stopServer();
    } catch (err) {
      logger.warn('Failed stopping native transfer server:', err.message);
    }
    if (this.nativeUnsub) {
      this.nativeUnsub();
      this.nativeUnsub = null;
    }
    this.events.removeAllListeners();
    logger.info('LocalShareNode stopped.');
  }

  /**
   * Start mDNS, BLE, and Subnet Range discovery.
   */
  async startDiscovery() {
    this.discovering = true;

    try {
      await requestDiscoveryPermissions();
    } catch (err) {
      logger.warn('Permission request error during discovery start:', err.message);
    }

    try {
      await NativeBridge.registerMdns(this.selfDevice.port, {
        deviceId: this.selfDevice.deviceId,
        displayName: this.selfDevice.displayName,
        fingerprint: this.selfDevice.fingerprint,
        platform: this.selfDevice.platform,
        port: String(this.selfDevice.port)
      });
      await NativeBridge.startMdnsDiscovery();
      await NativeBridge.startBleAdvertising(kBleServiceUuid, this.selfDevice.deviceId);
      await NativeBridge.startBleScanning(kBleServiceUuid);
    } catch (err) {
      logger.warn('Native discovery startup error:', err.message);
    }

    // Trigger immediate subnet scan
    this.scanSubnet().catch((err) => {
      logger.warn('Initial subnet scan warning:', err.message);
    });

    // Start periodic background subnet scan every 15 seconds
    if (!this.subnetScanIntervalId) {
      this.subnetScanIntervalId = setInterval(() => {
        if (this.discovering) {
          this.scanSubnet().catch((err) => {
            logger.debug('Periodic subnet scan error:', err.message);
          });
        }
      }, 15000);
    }

    this.events.emit(EngineEventType.ENGINE_STATE_CHANGED, { discovering: true });
    logger.info('Discovery started.');
  }

  /**
   * Stop discovery services.
   */
  async stopDiscovery() {
    this.discovering = false;

    if (this.subnetScanIntervalId) {
      clearInterval(this.subnetScanIntervalId);
      this.subnetScanIntervalId = null;
    }

    try {
      await NativeBridge.stopMdnsDiscovery();
      await NativeBridge.unregisterMdns();
      await NativeBridge.stopBleScanning();
      await NativeBridge.stopBleAdvertising();
    } catch (err) {
      logger.warn('Native discovery teardown error:', err.message);
    }

    this.events.emit(EngineEventType.ENGINE_STATE_CHANGED, { discovering: false });
    logger.info('Discovery stopped.');
  }

  /**
   * Active subnet probe: discovers devices when mDNS / multicast is filtered by router.
   */
  async scanSubnet() {
    if (this.isScanningSubnet) return;
    this.isScanningSubnet = true;

    try {
      let localIp = this.selfDevice.address;
      try {
        const detectedIp = await getWifiIpAddress();
        if (detectedIp) {
          localIp = detectedIp;
          this.selfDevice.address = localIp;
        }
      } catch (err) {
        logger.debug('Subnet scan IP detection error:', err.message);
      }

      if (!localIp || localIp === '127.0.0.1' || !localIp.includes('.')) {
        return;
      }

      const parts = localIp.split('.');
      if (parts.length !== 4) return;
      const prefix = `${parts[0]}.${parts[1]}.${parts[2]}.`;

      const ips = [];
      for (let i = 1; i <= 254; i++) {
        const ip = `${prefix}${i}`;
        if (ip !== localIp) {
          ips.push(ip);
        }
      }

      // Concurrently probe in batches of 20
      const batchSize = 20;
      for (let i = 0; i < ips.length; i += batchSize) {
        if (!this.discovering) break;
        const batch = ips.slice(i, i + batchSize);
        await Promise.all(batch.map((ip) => this._probeSingleHost(ip)));
      }
    } catch (err) {
      logger.warn('Subnet scan error:', err.message);
    } finally {
      this.isScanningSubnet = false;
    }
  }

  async _probeSingleHost(ip) {
    // 1. Probe LocalShare Port 53318
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 900);
      const res = await fetch(`http://${ip}:${kDefaultPort}/v1/info`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data && (data.deviceId || data.fingerprint)) {
          this._handlePeerSighting({
            deviceId: data.deviceId || `ls-${ip}`,
            displayName: data.displayName || `Device (${ip})`,
            address: ip,
            port: data.port || kDefaultPort,
            platform: data.platform || 'desktop',
            fingerprint: data.fingerprint || '',
            discoveryChannel: 'subnet'
          });
          return;
        }
      }
    } catch (_e) {
      // Host unreachable
    }

    // 2. Probe LocalSend Port 53317
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 900);
      const res = await fetch(`http://${ip}:53317/api/localsend/v2/info`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data && data.alias) {
          this._handlePeerSighting({
            deviceId: data.fingerprint || `localsend-${ip}`,
            displayName: data.alias,
            address: ip,
            port: data.port || 53317,
            platform: data.deviceType || 'mobile',
            fingerprint: data.fingerprint || '',
            discoveryChannel: 'subnet'
          });
        }
      }
    } catch (_e) {
      // Host unreachable
    }
  }

  /**
   * Handle discovered peer sighting from mDNS, BLE, or manual channel.
   * Performs deduplication and merges addresses.
   */
  _handlePeerSighting(rawPeer) {
    if (!rawPeer || !rawPeer.deviceId) return;
    if (rawPeer.deviceId === this.selfDevice.deviceId) return; // Ignore self

    const existing = this.peerMap.get(rawPeer.deviceId);
    const updated = new DeviceInfo({
      ...(existing ? existing.toJSON() : {}),
      ...rawPeer,
      lastSeen: Date.now()
    });

    this.peerMap.set(rawPeer.deviceId, updated);

    if (existing) {
      this.events.emit(EngineEventType.PEER_UPDATED, updated);
    } else {
      this.events.emit(EngineEventType.PEER_FOUND, updated);
    }
  }

  _handlePeerLost(peerId) {
    if (this.peerMap.has(peerId)) {
      const lostPeer = this.peerMap.get(peerId);
      this.peerMap.delete(peerId);
      this.events.emit(EngineEventType.PEER_LOST, lostPeer);
    }
  }

  _sweepStalePeers() {
    const now = Date.now();
    for (const [id, peer] of this.peerMap.entries()) {
      if (now - peer.lastSeen > kPeerStaleMs) {
        this.peerMap.delete(id);
        this.events.emit(EngineEventType.PEER_LOST, peer);
      }
    }
  }

  /**
   * Add a peer manually (IP, port, fingerprint).
   */
  addManualPeer(address, port = kDefaultPort, fingerprint = '') {
    const deviceId = `manual-${address}-${port}`;
    this._handlePeerSighting({
      deviceId,
      displayName: `Manual (${address})`,
      address,
      port,
      fingerprint,
      platform: 'unknown',
      discoveryChannel: 'manual'
    });
  }

  /**
   * Send files to peer.
   */
  async send(peer, files) {
    return this.sendController.send(peer, files);
  }

  cancelTransfer(sessionId) {
    this.sendController.cancelTransfer(sessionId);
  }

  retryTransfer(_sessionId) {
    // Retry triggered by user
  }

  respondPinChallenge(deviceId, pin) {
    this.pairing.evaluate(deviceId, '', pin).catch((err) => {
      logger.error('Failed to respond to pin challenge:', err);
    });
  }

  rejectPinChallenge(deviceId, _reason) {
    this.pairing.resetAttempts(deviceId);
  }

  updateSettings(newSettings) {
    this.pairing.updateSettings(newSettings);
  }
}
