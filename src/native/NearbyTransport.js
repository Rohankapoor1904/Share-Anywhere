import { NativeBridge } from './NativeBridge';
import { NativeEvents } from './NativeEvents';

/**
 * The Nearby transport used by NearbyController on Android: a thin adapter over the
 * real NearbyModule (Google Nearby Connections) and HashingModule.
 */
export const NativeNearbyTransport = {
  isSupported: () => NativeBridge.nearbyIsSupported(),
  startAdvertising: (endpointInfo) => NativeBridge.nearbyStartAdvertising(endpointInfo),
  startDiscovery: () => NativeBridge.nearbyStartDiscovery(),
  stopAdvertising: () => NativeBridge.nearbyStopAdvertising(),
  stopDiscovery: () => NativeBridge.nearbyStopDiscovery(),
  stopAll: () => NativeBridge.nearbyStopAll(),
  requestConnection: (endpointId, endpointInfo) => NativeBridge.nearbyRequestConnection(endpointId, endpointInfo),
  acceptConnection: (endpointId) => NativeBridge.nearbyAcceptConnection(endpointId),
  disconnect: (endpointId) => NativeBridge.nearbyDisconnect(endpointId),
  sendControl: (endpointId, json) => NativeBridge.nearbySendControl(endpointId, json),
  prepareFile: (pathOrUri) => NativeBridge.nearbyPrepareFile(pathOrUri),
  sendPreparedFile: (endpointId, payloadId) => NativeBridge.nearbySendPreparedFile(endpointId, payloadId),
  cancelPayload: (payloadId) => NativeBridge.nearbyCancelPayload(payloadId),
  saveReceivedFile: (payloadId, fileName) => NativeBridge.nearbySaveReceivedFile(payloadId, fileName),
  discardReceivedFile: (payloadId) => NativeBridge.nearbyDiscardReceivedFile(payloadId),
  deleteSavedFile: (path) => NativeBridge.nearbyDeleteSavedFile(path),
  hashFile: (pathOrUri) => NativeBridge.computeFileHash(pathOrUri),
  subscribe: (handlers) => NativeEvents.subscribeNearby(handlers)
};
