import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

const {
  NsdDiscoveryModule,
  BleDiscoveryModule,
  TransferServerModule,
  TransferClientModule,
  TransferForegroundService,
  StorageModule,
  NearbyModule,
  OfflinePcModule
} = NativeModules;

/** Native NearbyModule event name -> handler key passed to subscribeNearby(). */
const NEARBY_EVENTS = {
  NearbyEndpointFound: 'onEndpointFound',
  NearbyEndpointLost: 'onEndpointLost',
  NearbyConnectionInitiated: 'onConnectionInitiated',
  NearbyConnectionResult: 'onConnectionResult',
  NearbyDisconnected: 'onDisconnected',
  NearbyControl: 'onControl',
  NearbyIncomingFile: 'onIncomingFile',
  NearbyPayloadProgress: 'onPayloadProgress'
};

class NativeEventsManager {
  constructor() {
    this.subscriptions = [];
    this.nearbySubscriptions = [];
    this.offlinePcSubscriptions = [];
  }

  subscribeAll({
    onPeerFound,
    onPeerLost,
    onBlePeerFound,
    onIncomingSession,
    onReceiveProgress,
    onFileReceived,
    onSendProgress,
    onSendFinished,
    onSendFailed,
    onServiceState,
    onClipboardChanged,
    onClipboardSynced,
    onLivePeerConnected,
    onLivePeerDisconnected
  }) {
    if (Platform.OS !== 'android') {
      return () => {};
    }

    const nsdEmitter = NsdDiscoveryModule ? new NativeEventEmitter(NsdDiscoveryModule) : null;
    const bleEmitter = BleDiscoveryModule ? new NativeEventEmitter(BleDiscoveryModule) : null;
    const serverEmitter = TransferServerModule ? new NativeEventEmitter(TransferServerModule) : null;
    const clientEmitter = TransferClientModule ? new NativeEventEmitter(TransferClientModule) : null;
    const serviceEmitter = TransferForegroundService ? new NativeEventEmitter(TransferForegroundService) : null;
    const storageEmitter = StorageModule ? new NativeEventEmitter(StorageModule) : null;

    if (nsdEmitter && onPeerFound) {
      this.subscriptions.push(nsdEmitter.addListener('PeerFound', onPeerFound));
    }
    if (nsdEmitter && onPeerLost) {
      this.subscriptions.push(nsdEmitter.addListener('PeerLost', onPeerLost));
    }
    if (bleEmitter && onBlePeerFound) {
      this.subscriptions.push(bleEmitter.addListener('BlePeerFound', onBlePeerFound));
    }
    if (serverEmitter && onIncomingSession) {
      this.subscriptions.push(serverEmitter.addListener('IncomingSession', onIncomingSession));
    }
    if (serverEmitter && onReceiveProgress) {
      this.subscriptions.push(serverEmitter.addListener('ReceiveProgress', onReceiveProgress));
    }
    if (serverEmitter && onFileReceived) {
      this.subscriptions.push(serverEmitter.addListener('FileReceived', onFileReceived));
    }
    if (clientEmitter && onSendProgress) {
      this.subscriptions.push(clientEmitter.addListener('SendProgress', onSendProgress));
    }
    if (clientEmitter && onSendFinished) {
      this.subscriptions.push(clientEmitter.addListener('SendFinished', onSendFinished));
    }
    if (clientEmitter && onSendFailed) {
      this.subscriptions.push(clientEmitter.addListener('SendFailed', onSendFailed));
    }
    if (serviceEmitter && onServiceState) {
      this.subscriptions.push(serviceEmitter.addListener('ServiceState', onServiceState));
    }
    if (storageEmitter && onClipboardChanged) {
      this.subscriptions.push(storageEmitter.addListener('ClipboardChanged', onClipboardChanged));
    }
    if (serverEmitter && onClipboardSynced) {
      this.subscriptions.push(serverEmitter.addListener('ClipboardSynced', onClipboardSynced));
    }
    if (serverEmitter && onLivePeerConnected) {
      this.subscriptions.push(serverEmitter.addListener('LivePeerConnected', onLivePeerConnected));
    }
    if (serverEmitter && onLivePeerDisconnected) {
      this.subscriptions.push(serverEmitter.addListener('LivePeerDisconnected', onLivePeerDisconnected));
    }

    return () => this.unsubscribeAll();
  }

  unsubscribeAll() {
    for (const sub of this.subscriptions) {
      if (sub && sub.remove) {
        sub.remove();
      }
    }
    this.subscriptions = [];
  }

  /**
   * Bind the Nearby transport events. Kept separate from subscribeAll() so offline
   * sharing can be switched on and off without touching the LAN listeners.
   * @param {Record<string, (payload: any) => void>} handlers
   * @returns {() => void}
   */
  subscribeNearby(handlers) {
    if (Platform.OS !== 'android' || !NearbyModule) {
      return () => {};
    }
    const emitter = new NativeEventEmitter(NearbyModule);
    for (const [eventName, key] of Object.entries(NEARBY_EVENTS)) {
      const handler = handlers[key];
      if (handler) {
        this.nearbySubscriptions.push(emitter.addListener(eventName, handler));
      }
    }
    return () => this.unsubscribeNearby();
  }

  unsubscribeNearby() {
    for (const sub of this.nearbySubscriptions) {
      if (sub && sub.remove) {
        sub.remove();
      }
    }
    this.nearbySubscriptions = [];
  }

  /**
   * Bind the offline PC connect events (BLE bootstrap + hotspot).
   * @param {{ onHello?: (e: any) => void, onState?: (e: any) => void }} handlers
   * @returns {() => void}
   */
  subscribeOfflinePc(handlers) {
    if (Platform.OS !== 'android' || !OfflinePcModule) {
      return () => {};
    }
    const emitter = new NativeEventEmitter(OfflinePcModule);
    if (handlers.onHello) {
      this.offlinePcSubscriptions.push(emitter.addListener('OfflinePcHello', handlers.onHello));
    }
    if (handlers.onState) {
      this.offlinePcSubscriptions.push(emitter.addListener('OfflinePcState', handlers.onState));
    }
    return () => this.unsubscribeOfflinePc();
  }

  unsubscribeOfflinePc() {
    for (const sub of this.offlinePcSubscriptions) {
      if (sub && sub.remove) {
        sub.remove();
      }
    }
    this.offlinePcSubscriptions = [];
  }
}

export const NativeEvents = new NativeEventsManager();

