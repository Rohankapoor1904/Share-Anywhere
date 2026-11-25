import { Platform, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EngineEventEmitter, EngineEventType } from './EngineEvents';
import { TrustStore } from './trustStore';
import { PairingEngine } from './pairing';
import { SendController } from './sendController';
import { ReceiveController } from './receiveController';
import { NearbyController } from './nearbyController';
import { PcBootstrapController } from './pcBootstrapController';
import { DeviceInfo } from './models';
import { setPeerAccessToken, peerAuthHeaders, loadPeerTokens } from './remoteFs';
import { NativeBridge } from '../native/NativeBridge';
import { NativeEvents } from '../native/NativeEvents';
import { NativeNearbyTransport } from '../native/NearbyTransport';
import { NativePcBootstrapTransport } from '../native/PcBootstrapTransport';
import { generateDeviceName } from '../utils/deviceName';
import { requestDiscoveryPermissions, ensureNotificationPermission } from '../utils/permissions';
import {
  kDefaultPort,
  kBleServiceUuid,
  kPeerStaleMs
} from '../utils/protocol';
import { defaultLogger } from '../utils/logger';
import { formatBytes } from '../utils/byteFormat';

const logger = defaultLogger;

const NEARBY_ENABLED_KEY = '@localshare:nearby_enabled';

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

/**
 * Strip the IPv4-mapped IPv6 prefix so `::ffff:10.0.0.5` compares equal to `10.0.0.5`.
 * @param {string} ip
 * @returns {string}
 */
function normalizeIp(ip) {
  const value = String(ip || '').trim();
  return value.toLowerCase().startsWith('::ffff:') ? value.slice(7) : value;
}

/**
 * True when the address is loopback or matches one of this device's own addresses.
 * @param {string} ip
 * @param {string[]} localAddresses
 * @returns {boolean}
 */
function isLocalAddress(ip, localAddresses) {
  const value = normalizeIp(ip);
  if (!value) return false;
  if (value === '127.0.0.1' || value === '::1' || value === 'localhost') return true;
  return localAddresses.some((address) => normalizeIp(address) === value);
}

export class LocalShareNode {
  /**
   * @param {object} [options]
   * @param {any} [options.nearbyTransport] - Nearby transport (defaults to the native module).
   * @param {any} [options.pcBootstrapTransport] - Offline PC connect transport (defaults to the native module).
   */
  constructor(options = {}) {
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

    // Offline phone-to-phone transport (Google Nearby Connections).
    this.nearbySupported = false;
    this.nearbyEnabled = true;
    this.nearbyReason = '';
    this.nearby = new NearbyController({
      events: this.events,
      pairing: this.pairing,
      trustStore: this.trustStore,
      selfDevice: this.selfDevice,
      transport: options.nearbyTransport || NativeNearbyTransport,
      onPeerSeen: (peer) => this._handlePeerSighting(peer),
      onPeerGone: (endpointId, deviceId) => this._handleNearbyGone(endpointId, deviceId),
      onPeerBandwidth: (endpointId, quality) => this._handleNearbyBandwidth(endpointId, quality)
    });

    // "Connect a PC without Wi-Fi": BLE handshake + phone hotspot.
    this.pcBootstrap = new PcBootstrapController({
      events: this.events,
      trustStore: this.trustStore,
      selfDevice: this.selfDevice,
      transport: options.pcBootstrapTransport || NativePcBootstrapTransport
    });

    this.sendController = new SendController({
      events: this.events,
      trustStore: this.trustStore,
      pairing: this.pairing,
      selfDevice: this.selfDevice,
      nearby: this.nearby
    });

    this.receiveController = new ReceiveController({
      events: this.events,
      trustStore: this.trustStore,
      pairing: this.pairing
    });

    /** @type {Map<string, DeviceInfo>} */
    this.peerMap = new Map();
    /** @type {string} */
    this.detectedLocalIp = '';
    this.discovering = false;
    this.staleIntervalId = null;
    this.subnetScanIntervalId = null;
    this.isScanningSubnet = false;
    this.nativeUnsub = null;
    this.connectedPeer = null;
    this.liveClipboardEnabled = true;
    this.autoReconnectEnabled = true;
    this.lastConnectedPeer = null;
    this.clipboardHistory = [];
    this.pingIntervalId = null;
    this.lastClipboardHash = '';
    this.appStateSub = null;
    this.loadLastConnectedPeer().catch((err) => logger.warn('Failed to restore last connected peer:', err));
  }

  async loadLastConnectedPeer() {
    try {
      const saved = await AsyncStorage.getItem('@localshare:last_connected_peer');
      if (saved) {
        this.lastConnectedPeer = JSON.parse(saved);
      }
      const autoVal = await AsyncStorage.getItem('@localshare:auto_reconnect');
      if (autoVal !== null) {
        this.autoReconnectEnabled = autoVal === 'true';
      }
    } catch (err) {
      logger.warn('Failed to read saved live-link settings:', err);
    }
  }

  addClipboardHistory(text, hash, sender = 'local') {
    if (!text || typeof text !== 'string') return;
    const finalHash = hash || text;
    const entry = {
      text,
      hash: finalHash,
      sender,
      timestamp: Date.now()
    };
    this.clipboardHistory = this.clipboardHistory.filter((item) => item.hash !== finalHash);
    this.clipboardHistory.unshift(entry);
    if (this.clipboardHistory.length > 15) {
      this.clipboardHistory.pop();
    }
    this.events.emit('CLIPBOARD_HISTORY_UPDATED', this.clipboardHistory);
  }

  async fetchPeerTelemetry(peer = this.connectedPeer) {
    if (!peer || !peer.address) return null;
    try {
      const res = await fetch(`http://${peer.address}:${peer.port || 53318}/v1/telemetry`, {
        headers: peerAuthHeaders(peer)
      });
      if (res.ok) {
        const data = await res.json();
        this.events.emit('LIVE_TELEMETRY_UPDATED', { peer, telemetry: data });
        return data;
      }
    } catch (err) {
      logger.warn('Telemetry fetch failed:', err);
    }
    return null;
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
  /**
   * Keep this phone's id and name the same across launches, so paired PCs
   * recognise it and the name doesn't change every time the app opens.
   */
  async _loadIdentity() {
    const KEY = '@localshare:device_identity';
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const saved = raw ? JSON.parse(raw) : null;
      if (saved && typeof saved.deviceId === 'string' && /^[A-Za-z0-9._-]{3,64}$/.test(saved.deviceId)) {
        this.selfDevice.deviceId = saved.deviceId;
        if (typeof saved.displayName === 'string' && saved.displayName.trim()) {
          this.selfDevice.displayName = saved.displayName;
        }
      } else {
        await AsyncStorage.setItem(KEY, JSON.stringify({
          deviceId: this.selfDevice.deviceId,
          displayName: this.selfDevice.displayName
        }));
      }
    } catch (err) {
      logger.warn('Could not load the saved device identity:', err);
    }
    this.events.emit('SELF_DEVICE_UPDATED', this.selfDevice);
  }

  async start() {
    // Identity and saved pairings first: everything after this advertises the id,
    // and auto-reconnect needs the stored token to connect without a prompt.
    await this._loadIdentity();
    await loadPeerTokens();

    // Notifications must be permitted before the status notification is posted,
    // otherwise Android 13+ silently drops it and the user gets no feedback until
    // a transfer is already in flight.
    try {
      await ensureNotificationPermission();
      await requestDiscoveryPermissions();
    } catch (err) {
      logger.warn('Permission request error during startup:', err.message);
    }

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
      onIncomingSession: (sessionReq) => {
        // An unhandled rejection here reaches the RN global handler; a malformed
        // peer payload must fail the session, never the app.
        Promise.resolve(this.receiveController.handleIncomingSession(sessionReq)).catch((err) => {
          logger.warn('Failed handling incoming session:', err.message);
        });
      },
      onReceiveProgress: (progress) => this.receiveController.handleChunkProgress(progress),
      onFileReceived: (file) => this.receiveController.handleFileReceived(file),
      onSendProgress: (progress) => this.events.emit(EngineEventType.TRANSFER_PROGRESS, progress),
      onSendFinished: (session) => this.events.emit(EngineEventType.TRANSFER_COMPLETED, session),
      onSendFailed: (err) => this.events.emit(EngineEventType.TRANSFER_FAILED, err),
      onServiceState: () => {},
      onClipboardChanged: async ({ text, hash }) => {
        if (!this.connectedPeer || !this.liveClipboardEnabled) return;
        if (hash && hash === this.lastClipboardHash) return;
        this.lastClipboardHash = hash;
        this.addClipboardHistory(text, hash, 'local');
        try {
          await fetch(`http://${this.connectedPeer.address}:${this.connectedPeer.port}/v1/clipboard`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...peerAuthHeaders(this.connectedPeer) },
            body: JSON.stringify({
              text,
              hash,
              senderDeviceId: this.selfDevice.deviceId,
              timestamp: Date.now()
            })
          });
          this.refreshPeerLastSeen(this.connectedPeer.deviceId);
        } catch (err) {
          logger.warn('Failed pushing clipboard to peer:', err.message);
        }
      },
      onClipboardSynced: ({ text, hash, senderDeviceId }) => {
        this.lastClipboardHash = hash;
        this.addClipboardHistory(text, hash, 'remote');
        this.events.emit('CLIPBOARD_SYNCED', { text, hash, senderDeviceId });
      },
      onLivePeerConnected: (peerInfo) => {
        // A PC that connects to this phone hands over a token for calling it back.
        if (peerInfo && peerInfo.accessToken) {
          setPeerAccessToken(peerInfo, peerInfo.accessToken);
        }
        this.connectedPeer = peerInfo;
        this.refreshPeerLastSeen(peerInfo.deviceId);
        if (NativeBridge.isAvailable()) {
          NativeBridge.startClipboardMonitoring();
        }
        // A PC joining this phone's hotspot completes an offline PC session.
        this.pcBootstrap.handleLiveConnected(peerInfo);
        this.events.emit('LIVE_STATUS_CHANGED', { connected: true, peer: peerInfo });
      },
      onLivePeerDisconnected: () => {
        this.connectedPeer = null;
        if (NativeBridge.isAvailable()) {
          NativeBridge.stopClipboardMonitoring();
        }
        this.pcBootstrap.handleLiveDisconnected();
        this.events.emit('LIVE_STATUS_CHANGED', { connected: false, peer: null });
      }
    });

    if (AppState && typeof AppState.addEventListener === 'function') {
      this.appStateSub = AppState.addEventListener('change', (nextState) => {
        if (nextState === 'active' && NativeBridge.isAvailable()) {
          NativeBridge.checkClipboardOnActive();
        }
      });
    }

    // Reflect transfer lifecycle in the status notification
    this.events.on(EngineEventType.TRANSFER_QUEUED, (transfer) => {
      const label = transfer.direction === 'receive' ? 'Incoming transfer' : 'Sending files';
      this._updateNotification(`LocalShare — ${label}`, transfer.fileName || 'Transfer in progress…');
    });
    this.events.on(EngineEventType.TRANSFER_PROGRESS, (progress) => {
      this._updateProgressNotification(progress);
    });
    this.events.on(EngineEventType.TRANSFER_COMPLETED, () => {
      this._updateNotification('LocalShare ready', 'Waiting for nearby devices to connect…');
    });

    // Start periodic staleness sweep
    this.staleIntervalId = setInterval(() => {
      this._sweepStalePeers();
    }, 5000);

    await this._initNearby();

    // Post a persistent status notification immediately on launch so the user
    // is informed before any peer connection or transfer is established.
    this._updateNotification('LocalShare ready', 'Waiting for nearby devices to connect…');

    logger.info(`LocalShareNode started. Self device: ${this.selfDevice.displayName} (${this.selfDevice.deviceId})`);
  }

  /**
   * Load the offline-sharing preference and find out whether Nearby can run here.
   */
  async _initNearby() {
    try {
      const saved = await AsyncStorage.getItem(NEARBY_ENABLED_KEY);
      if (saved !== null) {
        this.nearbyEnabled = saved === 'true';
      }
    } catch (err) {
      logger.warn('Failed to read the offline sharing setting:', err);
    }
    try {
      const support = await this.nearby.checkSupport();
      this.nearbySupported = support.supported;
      this.nearbyReason = support.reason;
    } catch (err) {
      this.nearbySupported = false;
      this.nearbyReason = err && err.message ? err.message : 'Nearby availability check failed';
      logger.warn('Nearby availability check failed:', err);
    }
    this.events.emit('NEARBY_STATE_CHANGED', this.getNearbyState());
    // The device list can start discovery before start() finishes; catch up here.
    if (this.discovering) {
      await this._startNearby();
    }
  }

  /**
   * @returns {{ supported: boolean, enabled: boolean, reason: string }}
   */
  getNearbyState() {
    return {
      supported: this.nearbySupported,
      enabled: this.nearbyEnabled,
      reason: this.nearbyReason
    };
  }

  /**
   * Turn offline (Nearby) sharing on or off and remember the choice.
   * @param {boolean} enabled
   */
  async setNearbyEnabled(enabled) {
    this.nearbyEnabled = Boolean(enabled);
    try {
      await AsyncStorage.setItem(NEARBY_ENABLED_KEY, String(this.nearbyEnabled));
    } catch (err) {
      logger.warn('Failed to save the offline sharing setting:', err);
    }
    if (!this.nearbyEnabled) {
      try {
        await this.nearby.stop();
      } catch (err) {
        logger.warn('Failed stopping Nearby:', err.message);
      }
      this._dropNearbyPeers();
    } else if (this.discovering) {
      await this._startNearby();
    }
    this.events.emit('NEARBY_STATE_CHANGED', this.getNearbyState());
    return this.getNearbyState();
  }

  async _startNearby() {
    if (!this.nearbySupported || !this.nearbyEnabled) return;
    try {
      await this.nearby.startDiscovery();
    } catch (err) {
      logger.warn('Nearby discovery could not start:', err && err.message ? err.message : err);
    }
  }

  /** Forget every peer that was only reachable over Nearby. */
  _dropNearbyPeers() {
    for (const [id, peer] of Array.from(this.peerMap.entries())) {
      if (peer.transport === 'nearby') {
        this.peerMap.delete(id);
        this.events.emit(EngineEventType.PEER_LOST, peer);
      } else if (peer.endpointId) {
        const updated = new DeviceInfo({ ...peer.toJSON(), endpointId: '', nearbyBandwidth: '' });
        this.peerMap.set(id, updated);
        this.events.emit(EngineEventType.PEER_UPDATED, updated);
      }
    }
  }

  // ---------------------------------------------------------------------------------
  // Offline PC connect (BLE bootstrap + phone hotspot)
  // ---------------------------------------------------------------------------------

  /** @returns {object} Current offline PC session state. */
  getOfflinePcState() {
    return this.pcBootstrap.getState();
  }

  /** Advertise over Bluetooth so a PC can connect without a shared Wi-Fi. */
  startOfflinePc() {
    return this.pcBootstrap.start();
  }

  /** Fallback for a PC without Bluetooth: start the hotspot and show its details. */
  startOfflinePcManual() {
    return this.pcBootstrap.startManual();
  }

  /**
   * @param {boolean} accepted - The user's answer after comparing the 6-digit code.
   */
  respondOfflinePc(accepted) {
    return this.pcBootstrap.respond(accepted);
  }

  /** End the offline PC session (Bluetooth off, hotspot released). */
  stopOfflinePc() {
    return this.pcBootstrap.stop();
  }

  /**
   * A Nearby endpoint went away: drop Nearby-only peers, keep LAN peers without the fallback.
   * @param {string} endpointId
   * @param {string} _deviceId
   */
  _handleNearbyGone(endpointId, _deviceId) {
    for (const [id, peer] of Array.from(this.peerMap.entries())) {
      if (!endpointId || peer.endpointId !== endpointId) continue;
      if (peer.transport === 'nearby') {
        this.peerMap.delete(id);
        this.events.emit(EngineEventType.PEER_LOST, peer);
      } else {
        const updated = new DeviceInfo({ ...peer.toJSON(), endpointId: '', nearbyBandwidth: '' });
        this.peerMap.set(id, updated);
        this.events.emit(EngineEventType.PEER_UPDATED, updated);
      }
    }
  }

  /**
   * Record measured Nearby throughput so the device list can flag a slow link.
   * @param {string} endpointId
   * @param {string} quality - 'LOW' or 'HIGH'
   */
  _handleNearbyBandwidth(endpointId, quality) {
    for (const [id, peer] of this.peerMap.entries()) {
      if (peer.endpointId === endpointId && peer.nearbyBandwidth !== quality) {
        const updated = new DeviceInfo({ ...peer.toJSON(), nearbyBandwidth: quality });
        this.peerMap.set(id, updated);
        this.events.emit(EngineEventType.PEER_UPDATED, updated);
      }
    }
  }

  /**
   * Update the Android foreground-service status notification (no-op off Android).
   * @param {string} title
   * @param {string} content
   */
  _updateNotification(title, content) {
    try {
      NativeBridge.startForegroundService(title, content);
    } catch (err) {
      logger.warn('Failed updating foreground notification:', err.message);
    }
  }

  /**
   * Reflect a transfer-progress event in the Android foreground-service notification.
   * @param {object} progress - { direction, fileName, transferredBytes, totalBytes, speed }
   */
  _updateProgressNotification(progress) {
    try {
      const { direction, fileName, transferredBytes, totalBytes, speed } = progress || {};
      const label = direction === 'receive' ? 'Receiving' : 'Sending';
      const percent = totalBytes > 0
        ? Math.min(100, Math.round((transferredBytes / totalBytes) * 100))
        : -1;
      const speedText = speed > 0 ? ` • ${formatBytes(speed)}/s` : '';
      const name = fileName || 'file';
      const content = percent >= 0
        ? `${label} ${name} — ${percent}%${speedText}`
        : `${label} ${name}${speedText}`;
      NativeBridge.updateForegroundProgress(`LocalShare — ${label}`, content, percent);
    } catch (err) {
      logger.warn('Failed updating foreground progress:', err.message);
    }
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
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
    if (this.appStateSub) {
      if (typeof this.appStateSub.remove === 'function') {
        this.appStateSub.remove();
      }
      this.appStateSub = null;
    }
    this.connectedPeer = null;
    try {
      await this.nearby.stop();
    } catch (err) {
      logger.warn('Failed stopping Nearby:', err.message);
    }
    try {
      await this.pcBootstrap.dispose();
    } catch (err) {
      logger.warn('Failed ending the offline PC session:', err.message);
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
    try {
      NativeBridge.stopForegroundService();
    } catch (err) {
      logger.warn('Failed stopping foreground notification:', err.message);
    }
    this.events.removeAllListeners();
    logger.info('LocalShareNode stopped.');
  }

  /**
   * Start mDNS, BLE, and Subnet Range discovery.
   */
  /**
   * Learn this phone's Wi-Fi IP so its own mDNS/subnet echoes are never listed as a
   * peer. Must run before discovery starts: mDNS can still return this phone's record
   * from an earlier launch (different device id and certificate), and only the address
   * identifies it.
   */
  async _refreshLocalAddress() {
    try {
      const ip = await getWifiIpAddress();
      if (ip) {
        this.detectedLocalIp = ip;
        this.selfDevice.address = ip;
        this._purgeSelfPeers();
      }
    } catch (err) {
      logger.debug('Local IP detection failed:', err.message);
    }
  }

  /** Drop any listed peer that is actually this phone. */
  _purgeSelfPeers() {
    for (const [id, peer] of this.peerMap.entries()) {
      const isSelf = id === this.selfDevice.deviceId ||
        (this.selfDevice.fingerprint && peer.fingerprint === this.selfDevice.fingerprint) ||
        isLocalAddress(peer.address, [this.selfDevice.address, this.detectedLocalIp]);
      if (isSelf) {
        this.peerMap.delete(id);
        this.events.emit(EngineEventType.PEER_LOST, peer);
      }
    }
  }

  async startDiscovery() {
    this.discovering = true;
    await this._refreshLocalAddress();

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

    // Offline phones (no shared Wi-Fi) are found over Nearby; failures never block LAN discovery.
    await this._startNearby();

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

    this._updateNotification('LocalShare — scanning', 'Looking for nearby devices on your Wi-Fi…');

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

    try {
      await this.nearby.stopDiscovery();
    } catch (err) {
      logger.warn('Nearby discovery teardown error:', err.message);
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
          this.detectedLocalIp = detectedIp;
          this.selfDevice.address = localIp;
          this._purgeSelfPeers();
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
            useTls: data.useTls === true, // responded on plain HTTP /v1/info
            discoveryChannel: 'subnet'
          });
          return;
        }
      }
    } catch (err) {
      // Host unreachable
      logger.debug(`Probe of ${ip} failed:`, err);
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
            // LocalSend speaks only its own v2 API; tag it so send() routes to
            // _sendLocalSend instead of posting a LocalShare session to port 53317.
            platform: 'localsend',
            deviceType: data.deviceType || 'mobile',
            fingerprint: data.fingerprint || '',
            discoveryChannel: 'subnet'
          });
        }
      }
    } catch (err) {
      // Host unreachable
      logger.debug(`Probe of ${ip} failed:`, err);
    }
  }

  /**
   * Handle discovered peer sighting from mDNS, BLE, or manual channel.
   * Performs deduplication and merges addresses.
   */
  _handlePeerSighting(rawPeer) {
    if (!rawPeer || !rawPeer.deviceId) return;
    if (rawPeer.deviceId === this.selfDevice.deviceId) return; // Ignore self by device id
    if (
      this.selfDevice.fingerprint &&
      rawPeer.fingerprint &&
      rawPeer.fingerprint === this.selfDevice.fingerprint
    ) {
      return; // Ignore self by certificate fingerprint (own service seen via mDNS)
    }

    // A peer advertising one of our own interface addresses is this device, even
    // when it announced a different id (e.g. the same app on 53317 vs 53318).
    const peerAddress = normalizeIp(rawPeer.address);
    if (peerAddress && isLocalAddress(peerAddress, [this.selfDevice.address, this.detectedLocalIp])) {
      return;
    }

    const existing = this.peerMap.get(rawPeer.deviceId);

    // Transport merge rule: a phone reachable on LAN keeps LAN routing (tested path, resumable),
    // and a Nearby sighting only records the endpoint as a fallback. A LAN sighting of a
    // Nearby-only peer upgrades it to LAN and keeps the endpoint.
    let patch = rawPeer;
    let refreshLastSeen = true;
    if (rawPeer.transport === 'nearby') {
      if (existing && existing.transport !== 'nearby') {
        patch = {
          deviceId: rawPeer.deviceId,
          endpointId: rawPeer.endpointId,
          ...(rawPeer.fingerprint && !existing.fingerprint ? { fingerprint: rawPeer.fingerprint } : {})
        };
        // LAN liveness is judged by LAN sightings only.
        refreshLastSeen = false;
      }
    } else if (existing && existing.transport === 'nearby') {
      patch = { ...rawPeer, transport: 'lan' };
    }

    const updated = new DeviceInfo({
      ...(existing ? existing.toJSON() : {}),
      ...patch,
      lastSeen: refreshLastSeen || !existing ? Date.now() : existing.lastSeen
    });

    this.peerMap.set(rawPeer.deviceId, updated);

    if (existing) {
      this.events.emit(EngineEventType.PEER_UPDATED, updated);
    } else {
      this.events.emit(EngineEventType.PEER_FOUND, updated);
    }

    // The live link (clipboard, remote files) needs HTTP, so only LAN peers auto-reconnect.
    if (this.autoReconnectEnabled && !this.connectedPeer && this.lastConnectedPeer && updated.transport !== 'nearby') {
      const match = (this.lastConnectedPeer.deviceId && this.lastConnectedPeer.deviceId === updated.deviceId) ||
                    (this.lastConnectedPeer.fingerprint && this.lastConnectedPeer.fingerprint === updated.fingerprint);
      if (match) {
        this.connectToPeer(updated).catch((err) => logger.warn('Auto-reconnect failed:', err));
      }
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
      // Nearby reports its own losses (onEndpointLost); its peers have no LAN heartbeat.
      if (peer.transport === 'nearby') continue;
      if (now - peer.lastSeen > kPeerStaleMs) {
        if (peer.endpointId && this.nearby.hasEndpoint(peer.endpointId)) {
          // Left the Wi-Fi but still in Bluetooth range: fall back to Nearby instead of vanishing.
          const demoted = new DeviceInfo({
            ...peer.toJSON(),
            transport: 'nearby',
            address: '',
            port: kDefaultPort,
            lastSeen: now
          });
          this.peerMap.set(id, demoted);
          this.events.emit(EngineEventType.PEER_UPDATED, demoted);
          continue;
        }
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
    if (this.nearby.ownsSession(sessionId)) {
      this.nearby.cancelSession(sessionId);
      return;
    }
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

  /**
   * Resolve an incoming-transfer approval prompt by session id.
   * @param {string} sessionId
   * @param {boolean} accepted
   */
  respondIncomingSession(sessionId, accepted) {
    if (!sessionId) return;
    // Nearby offers are answered over the Nearby link; everything else is the native HTTP server.
    if (this.nearby.respondToOffer(sessionId, accepted)) return;
    this.receiveController.respondToSession(sessionId, accepted);
  }

  /**
   * Refresh a peer's last seen timestamp on activity.
   * @param {string} idOrAddress
   */
  refreshPeerLastSeen(idOrAddress) {
    if (!idOrAddress) return;
    for (const peer of this.peerMap.values()) {
      if (peer.deviceId === idOrAddress || peer.address === idOrAddress) {
        peer.lastSeen = Date.now();
        break;
      }
    }
  }

  /**
   * Establish a persistent live connection session with a peer.
   * @param {object} peer
   */
  async connectToPeer(peer) {
    if (peer && peer.transport === 'nearby') {
      throw new Error('A live connection needs both devices on the same Wi-Fi. Sending files works without it.');
    }
    if (!peer || !peer.address || !peer.port) {
      throw new Error('Invalid peer for live connection');
    }
    const res = await fetch(`http://${peer.address}:${peer.port}/v1/live/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...peerAuthHeaders(peer) },
      body: JSON.stringify({
        // The code from the PC's QR/PIN screen pairs instantly; without it the PC asks its user.
        pairingCode: peer.pairingCode || undefined,
        deviceId: this.selfDevice.deviceId,
        displayName: this.selfDevice.displayName,
        address: this.selfDevice.address,
        port: this.selfDevice.port,
        platform: this.selfDevice.platform,
        clipboardSync: this.liveClipboardEnabled
      })
    });
    if (!res.ok) {
      // The PC forgot this phone or declined it: drop the stale token so the next
      // attempt asks for approval (or uses a fresh code) instead of failing silently.
      if (res.status === 401 || res.status === 403) setPeerAccessToken(peer, '');
      throw new Error(`Connection rejected by peer: HTTP ${res.status}`);
    }
    const data = await res.json();
    setPeerAccessToken(peer, typeof data.accessToken === 'string' ? data.accessToken : '');
    this.connectedPeer = peer;
    this.refreshPeerLastSeen(peer.deviceId);
    this.lastConnectedPeer = {
      deviceId: peer.deviceId,
      displayName: peer.displayName,
      fingerprint: peer.fingerprint || '',
      address: peer.address,
      port: peer.port
    };
    try {
      await AsyncStorage.setItem('@localshare:last_connected_peer', JSON.stringify(this.lastConnectedPeer));
    } catch (err) {
      logger.warn('Failed to save last connected peer:', err);
    }
    if (data.currentClipboard) {
      try {
        await NativeBridge.setClipboardText(data.currentClipboard);
        this.addClipboardHistory(data.currentClipboard, null, 'remote');
      } catch (err) {
        logger.warn('Failed to set initial clipboard text on live connect:', err);
      }
    }
    this._startLiveHeartbeat(peer);
    if (NativeBridge.isAvailable()) {
      NativeBridge.startClipboardMonitoring();
    }
    this.fetchPeerTelemetry(peer).catch((err) => logger.warn('Telemetry fetch failed:', err));
    this.events.emit('LIVE_STATUS_CHANGED', { connected: true, peer });
    return data;
  }

  /**
   * Tear down the live link.
   */
  async disconnectLive() {
    if (this.connectedPeer) {
      try {
        await fetch(`http://${this.connectedPeer.address}:${this.connectedPeer.port}/v1/live/disconnect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...peerAuthHeaders(this.connectedPeer) }
        });
      } catch (err) {
        logger.warn('Failed to notify peer of live disconnect:', err);
      }
    }
    this.connectedPeer = null;
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
    if (NativeBridge.isAvailable()) {
      NativeBridge.stopClipboardMonitoring();
    }
    this.events.emit('LIVE_STATUS_CHANGED', { connected: false, peer: null });
  }

  _startLiveHeartbeat(peer) {
    if (this.pingIntervalId) clearInterval(this.pingIntervalId);
    let failedPings = 0;
    this.pingIntervalId = setInterval(async () => {
      if (!this.connectedPeer) return;
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 4000) : null;
      try {
        const res = await fetch(`http://${peer.address}:${peer.port}/v1/live/ping`, {
          signal: controller ? controller.signal : undefined
        });
        if (timeoutId) clearTimeout(timeoutId);
        if (res.ok) {
          failedPings = 0;
          this.refreshPeerLastSeen(peer.deviceId);
        } else {
          failedPings += 1;
        }
      } catch (err) {
        if (timeoutId) clearTimeout(timeoutId);
        failedPings += 1;
        logger.warn('Live ping failed:', err);
      }
      if (failedPings >= 3) {
        logger.warn('Live peer heartbeat failed 3 times; disconnecting');
        this.disconnectLive();
      }
    }, 5000);
  }

  toggleLiveClipboard() {
    this.liveClipboardEnabled = !this.liveClipboardEnabled;
    this.events.emit('LIVE_STATUS_CHANGED', {
      connected: Boolean(this.connectedPeer),
      peer: this.connectedPeer,
      clipboardSync: this.liveClipboardEnabled
    });
    return this.liveClipboardEnabled;
  }

  updateSettings(newSettings) {
    this.pairing.updateSettings(newSettings);
  }
}
