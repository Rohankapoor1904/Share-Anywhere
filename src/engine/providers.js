import React, { createContext, useContext, useState, useEffect } from 'react';
import { EngineEventType } from './EngineEvents';
import { defaultLogger } from '../utils/logger';

const logger = defaultLogger;

/**
 * @typedef {object} LocalShareContextValue
 * @property {object} selfDevice
 * @property {Array<object>} peers
 * @property {Array<object>} transfers
 * @property {Array<object>} receivedFiles
 * @property {boolean} isDiscovering
 * @property {object | null} activeChallenge
 * @property {object} settings
 * @property {() => Promise<void>} startDiscovery
 * @property {() => Promise<void>} stopDiscovery
 * @property {(peer: object, files: Array<object>) => Promise<void>} sendFiles
 * @property {(sessionId: string) => void} cancelTransfer
 * @property {(sessionId: string) => void} retryTransfer
 * @property {(pin: string) => void} respondPinChallenge
 * @property {() => void} dismissPinChallenge
 * @property {(newSettings: object) => void} updateSettings
 * @property {(ip: string, port: number, fingerprint: string) => void} addManualPeer
 */

const LocalShareContext = createContext(null);

/**
 * @param {object} props
 * @param {React.ReactNode} [props.children]
 * @param {any} props.nodeInstance
 */
export function LocalShareProvider({ children, nodeInstance }) {
  const [selfDevice, setSelfDevice] = useState({
    deviceId: 'init',
    displayName: 'Initializing...',
    fingerprint: '',
    address: '127.0.0.1',
    port: 53318,
    platform: 'android'
  });

  const [peers, setPeers] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [receivedFiles, setReceivedFiles] = useState([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [activeChallenge, setActiveChallenge] = useState(null);
  const [settings, setSettings] = useState({
    autoAcceptTrusted: true,
    autoAcceptAll: false,
    chunkSize: 1024 * 1024,
    lowPowerMode: false,
    theme: 'dark'
  });

  useEffect(() => {
    if (!nodeInstance) {
      return () => {};
    }

    setSelfDevice(nodeInstance.getSelfDevice());
    setIsDiscovering(nodeInstance.isDiscovering());

    const unsubFound = nodeInstance.events.on(EngineEventType.PEER_FOUND, () => {
      setPeers([...nodeInstance.getPeers()]);
    });

    const unsubLost = nodeInstance.events.on(EngineEventType.PEER_LOST, () => {
      setPeers([...nodeInstance.getPeers()]);
    });

    const unsubUpdated = nodeInstance.events.on(EngineEventType.PEER_UPDATED, () => {
      setPeers([...nodeInstance.getPeers()]);
    });

    const unsubChallenge = nodeInstance.events.on(EngineEventType.PIN_CHALLENGE_REQUESTED, (challenge) => {
      setActiveChallenge(challenge);
    });

    const unsubProgress = nodeInstance.events.on(EngineEventType.TRANSFER_PROGRESS, (transfer) => {
      setTransfers((prev) => {
        const index = prev.findIndex((t) => t.sessionId === transfer.sessionId);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = { ...prev[index], ...transfer };
          return updated;
        }
        return [transfer, ...prev];
      });
    });

    const unsubCompleted = nodeInstance.events.on(EngineEventType.TRANSFER_COMPLETED, (transfer) => {
      setTransfers((prev) =>
        prev.map((t) => (t.sessionId === transfer.sessionId ? { ...t, ...transfer, status: 'completed' } : t))
      );
      if (transfer.direction === 'receive' && transfer.file) {
        setReceivedFiles((prev) => [transfer.file, ...prev]);
      }
    });

    const unsubFailed = nodeInstance.events.on(EngineEventType.TRANSFER_FAILED, (transfer) => {
      setTransfers((prev) =>
        prev.map((t) => (t.sessionId === transfer.sessionId ? { ...t, ...transfer, status: 'failed' } : t))
      );
    });

    const unsubCancelled = nodeInstance.events.on(EngineEventType.TRANSFER_CANCELLED, (transfer) => {
      setTransfers((prev) =>
        prev.map((t) => (t.sessionId === transfer.sessionId ? { ...t, ...transfer, status: 'cancelled' } : t))
      );
    });

    return () => {
      unsubFound();
      unsubLost();
      unsubUpdated();
      unsubChallenge();
      unsubProgress();
      unsubCompleted();
      unsubFailed();
      unsubCancelled();
    };
  }, [nodeInstance]);

  const startDiscovery = async () => {
    if (nodeInstance) {
      await nodeInstance.startDiscovery();
      setIsDiscovering(true);
    }
  };

  const stopDiscovery = async () => {
    if (nodeInstance) {
      await nodeInstance.stopDiscovery();
      setIsDiscovering(false);
    }
  };

  const scanSubnet = async () => {
    if (nodeInstance && typeof nodeInstance.scanSubnet === 'function') {
      await nodeInstance.scanSubnet();
    }
  };

  const sendFiles = async (peer, files) => {
    if (nodeInstance) {
      await nodeInstance.send(peer, files);
    }
  };

  const cancelTransfer = (sessionId) => {
    if (nodeInstance) {
      nodeInstance.cancelTransfer(sessionId);
    }
  };

  const retryTransfer = (sessionId) => {
    if (nodeInstance) {
      nodeInstance.retryTransfer(sessionId);
    }
  };

  const respondPinChallenge = (pin) => {
    if (nodeInstance && activeChallenge) {
      nodeInstance.respondPinChallenge(activeChallenge.deviceId, pin);
      setActiveChallenge(null);
    }
  };

  const dismissPinChallenge = () => {
    if (nodeInstance && activeChallenge) {
      nodeInstance.rejectPinChallenge(activeChallenge.deviceId, 'user_declined');
      setActiveChallenge(null);
    }
  };

  const updateSettings = (newSettings) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
    if (nodeInstance) {
      nodeInstance.updateSettings(newSettings);
    }
  };

  const addManualPeer = (ip, port, fingerprint) => {
    if (nodeInstance) {
      nodeInstance.addManualPeer(ip, port, fingerprint);
    }
  };

  const value = {
    selfDevice,
    peers,
    transfers,
    receivedFiles,
    isDiscovering,
    activeChallenge,
    settings,
    startDiscovery,
    stopDiscovery,
    scanSubnet,
    sendFiles,
    cancelTransfer,
    retryTransfer,
    respondPinChallenge,
    dismissPinChallenge,
    updateSettings,
    addManualPeer
  };

  return (
    <LocalShareContext.Provider value={value}>
      {children}
    </LocalShareContext.Provider>
  );
}

export function useLocalShare() {
  const context = useContext(LocalShareContext);
  if (!context) {
    logger.warn('useLocalShare called outside LocalShareProvider; returning fallback values.');
    return {
      selfDevice: { deviceId: '', displayName: 'LocalShare', fingerprint: '', address: '0.0.0.0', port: 53318, platform: 'android' },
      peers: [],
      transfers: [],
      receivedFiles: [],
      isDiscovering: false,
      activeChallenge: null,
      settings: {},
      startDiscovery: async () => {},
      stopDiscovery: async () => {},
      scanSubnet: async () => {},
      sendFiles: async () => {},
      cancelTransfer: () => {},
      retryTransfer: () => {},
      respondPinChallenge: () => {},
      dismissPinChallenge: () => {},
      updateSettings: () => {},
      addManualPeer: () => {}
    };
  }
  return context;
}
