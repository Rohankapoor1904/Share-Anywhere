import { NativeBridge } from './NativeBridge';
import { NativeEvents } from './NativeEvents';

/**
 * Transport used by PcBootstrapController on Android: a thin adapter over the real
 * OfflinePcModule (BLE GATT bootstrap + Local-Only Hotspot).
 */
export const NativePcBootstrapTransport = {
  isSupported: () => NativeBridge.offlinePcIsSupported(),
  startSession: (selfJson) => NativeBridge.offlinePcStartSession(selfJson),
  respond: (accepted, port) => NativeBridge.offlinePcRespond(accepted, port),
  startHotspotOnly: (port) => NativeBridge.offlinePcStartHotspotOnly(port),
  stopAdvertising: () => NativeBridge.offlinePcStopAdvertising(),
  stopSession: () => NativeBridge.offlinePcStopSession(),
  subscribe: (handlers) => NativeEvents.subscribeOfflinePc(handlers)
};
