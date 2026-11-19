import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EngineEventType } from './EngineEvents';
import { NativeBridge } from '../native/NativeBridge';
import { defaultLogger } from '../utils/logger';

const logger = defaultLogger;

const upsertTransfer = (prev, incoming, forcedStatus) => {
  const nextItem = forcedStatus ? { ...incoming, status: forcedStatus } : incoming;
  const index = prev.findIndex((t) => t.sessionId === nextItem.sessionId);
  if (index >= 0) {
    const updated = [...prev];
    updated[index] = {
      ...prev[index],
      ...nextItem,
      totalBytes: nextItem.totalBytes || prev[index].totalBytes || 0,
      transferredBytes: forcedStatus === 'completed'
        ? (nextItem.totalBytes || prev[index].totalBytes || nextItem.transferredBytes || 0)
        : (nextItem.transferredBytes ?? prev[index].transferredBytes ?? 0),
      fileName: nextItem.fileName || prev[index].fileName || 'File'
    };
    return updated;
  }
  return [
    {
      totalBytes: 0,
      transferredBytes: 0,
      speed: 0,
      direction: 'receive',
      ...nextItem
    },
    ...prev
  ];
};

/**
 * @typedef {object} LocalShareContextValue
 * @property {object} selfDevice
 * @property {Array<object>} peers
 * @property {Array<object>} transfers
 * @property {Array<object>} receivedFiles
 * @property {boolean} isDiscovering
 * @property {object | null} activeChallenge
 * @property {object} settings
 * @property {object | null} connectedPeer
 * @property {boolean} isLiveConnected
 * @property {boolean} liveClipboardEnabled
 * @property {() => Promise<void>} startDiscovery
 * @property {() => Promise<void>} stopDiscovery
 * @property {() => Promise<void>} scanSubnet
 * @property {(peer: object, files: Array<object>) => Promise<void>} sendFiles
 * @property {(sessionId: string) => void} cancelTransfer
 * @property {(sessionId: string) => void} retryTransfer
 * @property {(pin: string) => void} respondPinChallenge
 * @property {() => void} dismissPinChallenge
 * @property {(newSettings: object) => void} updateSettings
 * @property {(ip: string, port: number, fingerprint: string) => void} addManualPeer
 * @property {(peer: object) => Promise<any>} connectToPeer
 * @property {() => Promise<void>} disconnectLive
 * @property {() => boolean} toggleLiveClipboard
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
  const [connectedPeer, setConnectedPeer] = useState(null);
  const [liveClipboardEnabled, setLiveClipboardEnabled] = useState(true);
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
    setConnectedPeer(nodeInstance.connectedPeer || null);
    setLiveClipboardEnabled(nodeInstance.liveClipboardEnabled !== false);

    // Hydrate persisted transfer history from AsyncStorage
    AsyncStorage.getItem('@localshare:transfer_history').then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setTransfers((prev) => {
              const existingIds = new Set(prev.map((t) => t.sessionId));
              const additions = parsed.filter((t) => !existingIds.has(t.sessionId));
              return [...prev, ...additions];
            });
          }
        } catch (_err) {}
      }
    }).catch(() => {});

    // Hydrate received files from storage
    if (NativeBridge.isAvailable()) {
      NativeBridge.listReceivedFiles().then((files) => {
        if (Array.isArray(files) && files.length > 0) {
          setReceivedFiles((prev) => {
            const seen = new Set(prev.map((f) => f.name || f.path));
            const additions = files.filter((f) => !seen.has(f.name || f.path));
            return [...prev, ...additions];
          });
        }
      }).catch(() => {});
    }

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

    const unsubQueued = nodeInstance.events.on(EngineEventType.TRANSFER_QUEUED, (transfer) => {
      setTransfers((prev) => upsertTransfer(prev, transfer, 'queued'));
    });

    const unsubProgress = nodeInstance.events.on(EngineEventType.TRANSFER_PROGRESS, (transfer) => {
      setTransfers((prev) => upsertTransfer(prev, transfer, 'in_progress'));
    });

    const unsubCompleted = nodeInstance.events.on(EngineEventType.TRANSFER_COMPLETED, (transfer) => {
      setTransfers((prev) => {
        const updated = upsertTransfer(prev, transfer, 'completed');
        const completedOnly = updated.filter((t) => t.status === 'completed').slice(0, 50);
        AsyncStorage.setItem('@localshare:transfer_history', JSON.stringify(completedOnly)).catch(() => {});
        return updated;
      });
      if (transfer.direction === 'receive' && transfer.file) {
        setReceivedFiles((prev) => {
          const exists = prev.some((f) => f.path === transfer.file.path || f.name === transfer.file.name);
          return exists ? prev : [transfer.file, ...prev];
        });
      }
    });

    const unsubFailed = nodeInstance.events.on(EngineEventType.TRANSFER_FAILED, (transfer) => {
      setTransfers((prev) => upsertTransfer(prev, transfer, 'failed'));
    });

    const unsubCancelled = nodeInstance.events.on(EngineEventType.TRANSFER_CANCELLED, (transfer) => {
      setTransfers((prev) => upsertTransfer(prev, transfer, 'cancelled'));
    });

    const unsubLive = nodeInstance.events.on('LIVE_STATUS_CHANGED', (status) => {
      setConnectedPeer(status?.connected ? status.peer : null);
      if (status?.clipboardSync !== undefined) {
        setLiveClipboardEnabled(status.clipboardSync);
      }
    });

    return () => {
      unsubFound();
      unsubLost();
      unsubUpdated();
      unsubChallenge();
      unsubQueued();
      unsubProgress();
      unsubCompleted();
      unsubFailed();
      unsubCancelled();
      unsubLive();
    };
  }, [nodeInstance]);

  const startDiscovery = useCallback(async () => {
    if (nodeInstance) {
      await nodeInstance.startDiscovery();
      setIsDiscovering(true);
    }
  }, [nodeInstance]);

  const stopDiscovery = useCallback(async () => {
    if (nodeInstance) {
      await nodeInstance.stopDiscovery();
      setIsDiscovering(false);
    }
  }, [nodeInstance]);

  const scanSubnet = useCallback(async () => {
    if (nodeInstance && typeof nodeInstance.scanSubnet === 'function') {
      await nodeInstance.scanSubnet();
    }
  }, [nodeInstance]);

  const sendFiles = useCallback(async (peer, files) => {
    if (nodeInstance) {
      await nodeInstance.send(peer, files);
    }
  }, [nodeInstance]);

  const cancelTransfer = useCallback((sessionId) => {
    if (nodeInstance) {
      nodeInstance.cancelTransfer(sessionId);
    }
  }, [nodeInstance]);

  const retryTransfer = useCallback((sessionId) => {
    if (nodeInstance) {
      nodeInstance.retryTransfer(sessionId);
    }
  }, [nodeInstance]);

  const respondPinChallenge = useCallback((pin) => {
    if (nodeInstance && activeChallenge) {
      if (activeChallenge.mode === 'approve') {
        nodeInstance.respondIncomingSession(activeChallenge.sessionId, true);
      } else {
        nodeInstance.respondPinChallenge(activeChallenge.deviceId, pin);
      }
      setActiveChallenge(null);
    }
  }, [nodeInstance, activeChallenge]);

  const dismissPinChallenge = useCallback(() => {
    if (nodeInstance && activeChallenge) {
      if (activeChallenge.mode === 'approve') {
        nodeInstance.respondIncomingSession(activeChallenge.sessionId, false);
      } else {
        nodeInstance.rejectPinChallenge(activeChallenge.deviceId, 'user_declined');
      }
      setActiveChallenge(null);
    }
  }, [nodeInstance, activeChallenge]);

  const updateSettings = useCallback((newSettings) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
    if (nodeInstance) {
      nodeInstance.updateSettings(newSettings);
    }
  }, [nodeInstance]);

  const addManualPeer = useCallback((ip, port, fingerprint) => {
    if (nodeInstance) {
      nodeInstance.addManualPeer(ip, port, fingerprint);
    }
  }, [nodeInstance]);

  const connectToPeer = useCallback(async (peer) => {
    if (nodeInstance && typeof nodeInstance.connectToPeer === 'function') {
      const res = await nodeInstance.connectToPeer(peer);
      setConnectedPeer(peer);
      return res;
    }
  }, [nodeInstance]);

  const disconnectLive = useCallback(async () => {
    if (nodeInstance && typeof nodeInstance.disconnectLive === 'function') {
      await nodeInstance.disconnectLive();
      setConnectedPeer(null);
    }
  }, [nodeInstance]);

  const toggleLiveClipboard = useCallback(() => {
    if (nodeInstance && typeof nodeInstance.toggleLiveClipboard === 'function') {
      const next = nodeInstance.toggleLiveClipboard();
      setLiveClipboardEnabled(next);
      return next;
    }
    return liveClipboardEnabled;
  }, [nodeInstance, liveClipboardEnabled]);

  const value = {
    selfDevice,
    peers,
    transfers,
    receivedFiles,
    isDiscovering,
    activeChallenge,
    settings,
    connectedPeer,
    isLiveConnected: Boolean(connectedPeer),
    liveClipboardEnabled,
    startDiscovery,
    stopDiscovery,
    scanSubnet,
    sendFiles,
    cancelTransfer,
    retryTransfer,
    respondPinChallenge,
    dismissPinChallenge,
    updateSettings,
    addManualPeer,
    connectToPeer,
    disconnectLive,
    toggleLiveClipboard
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
      connectedPeer: null,
      isLiveConnected: false,
      liveClipboardEnabled: true,
      startDiscovery: async () => {},
      stopDiscovery: async () => {},
      scanSubnet: async () => {},
      sendFiles: async () => {},
      cancelTransfer: () => {},
      retryTransfer: () => {},
      respondPinChallenge: () => {},
      dismissPinChallenge: () => {},
      updateSettings: () => {},
      addManualPeer: () => {},
      connectToPeer: async () => {},
      disconnectLive: async () => {},
      toggleLiveClipboard: () => true
    };
  }
  return context;
}
