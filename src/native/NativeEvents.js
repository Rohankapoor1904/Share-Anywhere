import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

const {
  NsdDiscoveryModule,
  BleDiscoveryModule,
  TransferServerModule,
  TransferClientModule,
  TransferForegroundService
} = NativeModules;

class NativeEventsManager {
  constructor() {
    this.subscriptions = [];
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
    onServiceState
  }) {
    if (Platform.OS !== 'android') {
      return () => {};
    }

    const nsdEmitter = NsdDiscoveryModule ? new NativeEventEmitter(NsdDiscoveryModule) : null;
    const bleEmitter = BleDiscoveryModule ? new NativeEventEmitter(BleDiscoveryModule) : null;
    const serverEmitter = TransferServerModule ? new NativeEventEmitter(TransferServerModule) : null;
    const clientEmitter = TransferClientModule ? new NativeEventEmitter(TransferClientModule) : null;
    const serviceEmitter = TransferForegroundService ? new NativeEventEmitter(TransferForegroundService) : null;

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
}

export const NativeEvents = new NativeEventsManager();
