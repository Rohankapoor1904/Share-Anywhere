import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  StyleSheet,
  SafeAreaView
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useLocalShare } from '../engine/providers';
import { useTheme } from '../theme';
import PeerCard from '../components/PeerCard';
import GlassCard from '../components/GlassCard';
import EmptyState from '../components/EmptyState';
import Icon from '../components/Icon';
import AmbientBackground from '../components/AmbientBackground';
import RadarView from '../components/RadarView';
import { PeerBlip, getPositionForPeer } from './RadarScreen';
import { formatBytes } from '../utils/byteFormat';

/** @type {any} */
let CameraComponent = null;
/** @type {any} */
let useCameraDeviceHook = (_pos) => null;
/** @type {any} */
let useCodeScannerHook = (_opts) => null;

try {
  // eslint-disable-next-line global-require
  const VC = require('react-native-vision-camera');
  CameraComponent = VC.Camera;
  useCameraDeviceHook = VC.useCameraDevice;
  useCodeScannerHook = VC.useCodeScanner;
} catch (_) {}

export default function DevicesScreen({ navigation }) {
  const {
    selfDevice,
    peers,
    isDiscovering,
    startDiscovery,
    stopDiscovery,
    scanSubnet,
    addManualPeer,
    connectedPeer,
    connectedPeerTelemetry,
    isLiveConnected,
    liveClipboardEnabled,
    connectToPeer,
    disconnectLive
  } = useLocalShare();

  const { theme } = useTheme();

  useEffect(() => {
    startDiscovery();
  }, [startDiscovery]);

  const [viewMode, setViewMode] = useState('list');
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [scannerModalVisible, setScannerModalVisible] = useState(false);
  const [pairingInput, setPairingInput] = useState('');
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [manualIp, setManualIp] = useState('');
  const [manualPort, setManualPort] = useState('53318');
  const [manualFingerprint, setManualFingerprint] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const cameraDevice = useCameraDeviceHook ? useCameraDeviceHook('back') : null;

  const codeScanner = useCodeScannerHook ? useCodeScannerHook({
    codeTypes: ['qr'],
    onCodeScanned: (codes) => {
      if (codes && codes.length > 0 && codes[0].value) {
        handleQrPayload(codes[0].value);
      }
    }
  }) : null;

  const handleQrPayload = (payload) => {
    try {
      const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
      if (parsed && parsed.address) {
        setScannerModalVisible(false);
        const peer = {
          deviceId: parsed.deviceId || `qr-${parsed.address}`,
          displayName: parsed.displayName || `PC (${parsed.address})`,
          address: parsed.address,
          port: parsed.port || 53318,
          fingerprint: parsed.fingerprint || '',
          platform: 'desktop'
        };
        connectToPeer(peer);
      }
    } catch (_) {}
  };

  const handleCodeSubmit = () => {
    const val = pairingInput.trim();
    if (!val) return;
    setScannerModalVisible(false);
    if (val.includes('.')) {
      addManualPeer(val, 53318, '');
      connectToPeer({
        deviceId: `manual-${val}`,
        displayName: `Device (${val})`,
        address: val,
        port: 53318,
        platform: 'desktop'
      });
      return;
    }
    const matching = peers.find((p) => p.pairingCode === val);
    if (matching) {
      connectToPeer(matching);
    } else {
      scanSubnet();
    }
  };

  const qrData = JSON.stringify({
    deviceId: selfDevice.deviceId,
    displayName: selfDevice.displayName,
    address: selfDevice.address,
    port: selfDevice.port,
    fingerprint: selfDevice.fingerprint,
    platform: selfDevice.platform
  });

  const filteredPeers = useMemo(() => {
    if (!searchQuery.trim()) return peers;
    const q = searchQuery.toLowerCase();
    return peers.filter(
      (p) =>
        (p.displayName && p.displayName.toLowerCase().includes(q)) ||
        (p.address && p.address.includes(q))
    );
  }, [peers, searchQuery]);

  const handleManualAdd = () => {
    if (manualIp.trim().length > 0) {
      addManualPeer(manualIp.trim(), parseInt(manualPort, 10) || 53318, manualFingerprint.trim());
      setManualIp('');
      setManualFingerprint('');
      setManualModalVisible(false);
    }
  };

  const handleSelectPeer = (peer) => {
    navigation.navigate('ShareHub', { targetPeer: peer });
  };

  const handleBrowsePeer = (peer) => {
    navigation.navigate('Files', { targetPeer: peer });
  };

  return (
    <AmbientBackground>
      <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* View Mode Segmented Switcher */}
        <View style={[styles.segmentedBar, { backgroundColor: theme.colors.cardSolid, borderColor: theme.colors.border }]}>
          <TouchableOpacity
            style={[
              styles.segmentedTab,
              viewMode === 'list' && { backgroundColor: theme.colors.primary }
            ]}
            onPress={() => setViewMode('list')}
          >
            <Icon
              name="devices"
              size={14}
              color={viewMode === 'list' ? (theme.mode === 'light' ? '#ffffff' : '#000000') : theme.colors.textSecondary}
              strokeWidth={2.2}
            />
            <Text
              style={[
                styles.segmentedTabText,
                { color: viewMode === 'list' ? (theme.mode === 'light' ? '#ffffff' : '#000000') : theme.colors.textSecondary }
              ]}
            >
              Nearby Devices ({peers.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.segmentedTab,
              viewMode === 'radar' && { backgroundColor: theme.colors.primary }
            ]}
            onPress={() => setViewMode('radar')}
          >
            <Icon
              name="radar"
              size={14}
              color={viewMode === 'radar' ? (theme.mode === 'light' ? '#ffffff' : '#000000') : theme.colors.textSecondary}
              strokeWidth={2.2}
            />
            <Text
              style={[
                styles.segmentedTabText,
                { color: viewMode === 'radar' ? (theme.mode === 'light' ? '#ffffff' : '#000000') : theme.colors.textSecondary }
              ]}
            >
              Live Radar
            </Text>
          </TouchableOpacity>
        </View>

        {/* Flagship Connected PC Card (O+ Connect style) */}
        {isLiveConnected && connectedPeer ? (
          <GlassCard style={styles.connectedHeroCard} variant="interactive">
            <View style={styles.connectedTopRow}>
              <View style={[styles.connectedAvatar, { backgroundColor: theme.colors.primaryGlow }]}>
                <Icon name="desktop" size={22} color={theme.colors.primary} strokeWidth={2.2} />
              </View>
              <View style={styles.connectedInfo}>
                <View style={styles.connectedBadgeRow}>
                  <View style={[styles.statusDot, { backgroundColor: theme.colors.success }]} />
                  <Text style={[styles.connectedStatusText, { color: theme.colors.success }]}>
                    CONNECTED
                  </Text>
                  {liveClipboardEnabled ? (
                    <View style={[styles.liveClipBadge, { backgroundColor: theme.colors.primaryGlow }]}>
                      <Text style={[styles.liveClipText, { color: theme.colors.primary }]}>Clipboard Live</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.connectedNameText, { color: theme.colors.text }]} numberOfLines={1}>
                  {connectedPeer.displayName || connectedPeer.address}
                </Text>
                {connectedPeerTelemetry && connectedPeerTelemetry.storage ? (
                  <Text style={[styles.connectedTelemetryText, { color: theme.colors.textSecondary }]}>
                    {connectedPeerTelemetry.deviceModel || 'PC'} • {formatBytes(connectedPeerTelemetry.storage.freeBytes)} free
                  </Text>
                ) : (
                  <Text style={[styles.connectedTelemetryText, { color: theme.colors.textSecondary }]}>
                    {connectedPeer.address} • Ready
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={[styles.disconnectIconBtn, { backgroundColor: theme.colors.cardSolid, borderColor: theme.colors.border }]}
                onPress={disconnectLive}
                accessibilityRole="button"
                accessibilityLabel="Disconnect live peer"
              >
                <Icon name="close" size={16} color={theme.colors.danger} strokeWidth={2.6} />
              </TouchableOpacity>
            </View>

            {/* 3 Large Action Tiles */}
            <View style={styles.actionTilesRow}>
              <TouchableOpacity
                style={[styles.actionTile, { backgroundColor: theme.colors.cardSolid, borderColor: theme.colors.border }]}
                onPress={() => handleSelectPeer(connectedPeer)}
              >
                <View style={[styles.tileIconCircle, { backgroundColor: theme.colors.primaryGlow }]}>
                  <Icon name="share" size={18} color={theme.colors.primary} strokeWidth={2.2} />
                </View>
                <Text style={[styles.tileTitle, { color: theme.colors.text }]}>Send Files</Text>
                <Text style={[styles.tileSub, { color: theme.colors.textMuted }]}>Photos & docs</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionTile, { backgroundColor: theme.colors.cardSolid, borderColor: theme.colors.border }]}
                onPress={() => handleBrowsePeer(connectedPeer)}
              >
                <View style={[styles.tileIconCircle, { backgroundColor: theme.colors.successGlow }]}>
                  <Icon name="files" size={18} color={theme.colors.success} strokeWidth={2.2} />
                </View>
                <Text style={[styles.tileTitle, { color: theme.colors.text }]}>Browse PC</Text>
                <Text style={[styles.tileSub, { color: theme.colors.textMuted }]}>Explore & pull</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionTile, { backgroundColor: theme.colors.cardSolid, borderColor: theme.colors.border }]}
                onPress={() => navigation.navigate('Transfers')}
              >
                <View style={[styles.tileIconCircle, { backgroundColor: 'rgba(236,72,153,0.14)' }]}>
                  <Icon name="activity" size={18} color="#ec4899" strokeWidth={2.2} />
                </View>
                <Text style={[styles.tileTitle, { color: theme.colors.text }]}>Activity</Text>
                <Text style={[styles.tileSub, { color: theme.colors.textMuted }]}>Transfers & clip</Text>
              </TouchableOpacity>
            </View>
          </GlassCard>
        ) : null}

        {viewMode === 'radar' ? (
          <View style={styles.radarContainer}>
            <View style={styles.radarWrapper}>
              <RadarView active={isDiscovering} size={280}>
                {peers.map((peer, idx) => (
                  <PeerBlip
                    key={peer.deviceId}
                    peer={peer}
                    position={getPositionForPeer(idx, peers.length)}
                    onPress={() => handleSelectPeer(peer)}
                  />
                ))}
              </RadarView>
            </View>
            <Text style={[styles.radarHint, { color: theme.colors.textMuted }]}>
              {peers.length} {peers.length === 1 ? 'peer detected' : 'peers detected'} in range • Tap to send
            </Text>
          </View>
        ) : (
          <>
            {/* Self Device Header Card (Clean Consumer Design) */}
            <GlassCard style={styles.selfCard} variant="interactive">
              <View style={styles.selfHeaderRow}>
                <View style={styles.selfInfo}>
                  <View style={styles.selfLabelRow}>
                    <View style={[styles.statusDot, { backgroundColor: theme.colors.success }]} />
                    <Text style={[styles.selfLabel, { color: theme.colors.primary }]}>THIS PHONE</Text>
                  </View>
                  <Text style={[styles.selfName, { color: theme.colors.text }]}>{selfDevice.displayName}</Text>
                  <Text style={[styles.selfDetails, { color: theme.colors.textSecondary }]}>
                    Ready to connect & share
                  </Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.qrButton,
                    { backgroundColor: theme.colors.primaryGlow, borderColor: theme.colors.primary }
                  ]}
                  onPress={() => setQrModalVisible(true)}
                  testID="qr-code-button"
                  accessibilityRole="button"
                  accessibilityLabel="Show device QR code"
                >
                  <Icon name="qr" size={14} color={theme.colors.primary} strokeWidth={2.2} />
                  <Text style={[styles.qrButtonText, { color: theme.colors.primary }]}>My QR</Text>
                </TouchableOpacity>
              </View>
            </GlassCard>

            {/* Primary Action & Controls Bar */}
            <View style={styles.controlsBar}>
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  styles.scanPcBtn,
                  { backgroundColor: theme.colors.primary }
                ]}
                onPress={() => setScannerModalVisible(true)}
              >
                <Icon
                  name="qr"
                  size={15}
                  color={theme.mode === 'light' ? '#ffffff' : '#000000'}
                  strokeWidth={2.4}
                />
                <Text
                  style={[
                    styles.actionBtnText,
                    { color: theme.mode === 'light' ? '#ffffff' : '#000000', fontWeight: '800' }
                  ]}
                >
                  Scan PC QR
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  styles.manualBtn,
                  { backgroundColor: theme.colors.cardSolid, borderColor: theme.colors.border }
                ]}
                onPress={isDiscovering ? stopDiscovery : startDiscovery}
              >
                <Icon name={isDiscovering ? 'radar' : 'play'} size={14} color={theme.colors.text} strokeWidth={2.2} />
                <Text style={[styles.actionBtnText, { color: theme.colors.text }]}>
                  {isDiscovering ? 'Scanning…' : 'Scan'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  styles.manualBtn,
                  { backgroundColor: theme.colors.cardSolid, borderColor: theme.colors.border }
                ]}
                onPress={() => setManualModalVisible(true)}
              >
                <Icon name="plus" size={14} color={theme.colors.text} strokeWidth={2.4} />
                <Text style={[styles.actionBtnText, { color: theme.colors.text }]}>Manual IP</Text>
              </TouchableOpacity>
            </View>

            {/* Search Bar when peers present */}
            {peers.length > 2 ? (
              <View style={[styles.searchBox, { backgroundColor: theme.colors.inputBg, borderColor: theme.colors.border }]}>
                <Icon name="search" size={15} color={theme.colors.textMuted} style={styles.searchIcon} strokeWidth={2.2} />
                <TextInput
                  style={[styles.searchInput, { color: theme.colors.text }]}
                  placeholder="Search discovered peers..." // justified: TextInput hint
                  placeholderTextColor={theme.colors.textMuted} // justified: TextInput hint
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery ? (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Icon name="close" size={14} color={theme.colors.textMuted} strokeWidth={2.6} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {/* Peer List */}
            <FlatList
              data={filteredPeers}
              keyExtractor={(item) => item.deviceId}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <PeerCard
                  peer={item}
                  isTrusted={item.isTrusted}
                  isLiveConnected={connectedPeer && connectedPeer.deviceId === item.deviceId}
                  onPress={() => handleSelectPeer(item)}
                  onBrowseFiles={() => handleBrowsePeer(item)}
                  onConnect={() => {
                    if (connectedPeer && connectedPeer.deviceId === item.deviceId) {
                      disconnectLive();
                    } else {
                      connectToPeer(item);
                    }
                  }}
                />
              )}
              ListEmptyComponent={
                <EmptyState
                  title={isDiscovering ? 'Looking for nearby devices...' : 'No devices found'}
                  description="Ensure other devices have LocalShare open on the same Wi-Fi subnet or connect directly via manual IP."
                  action={
                    !isDiscovering ? (
                      <TouchableOpacity
                        style={[styles.scanNowBtn, { backgroundColor: theme.colors.primary }]}
                        onPress={startDiscovery}
                      >
                        <Text style={[styles.scanNowBtnText, { color: theme.mode === 'light' ? '#ffffff' : '#000000' }]}>
                          Scan Now
                        </Text>
                      </TouchableOpacity>
                    ) : null
                  }
                />
              }
            />
          </>
        )}

        {/* Scan PC QR / 6-Digit Code Modal */}
        <Modal
          visible={scannerModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setScannerModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <GlassCard style={styles.scannerModalCard} variant="highlighted">
              <View style={styles.scannerHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Connect to PC</Text>
                  <Text style={[styles.modalSubtitle, { color: theme.colors.textSecondary, textAlign: 'left' }]}>
                    Scan the QR code shown on your PC screen
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.closeIconBtn, { backgroundColor: theme.colors.cardSolid }]}
                  onPress={() => setScannerModalVisible(false)}
                >
                  <Icon name="close" size={16} color={theme.colors.text} strokeWidth={2.4} />
                </TouchableOpacity>
              </View>

              {CameraComponent && cameraDevice ? (
                <View style={styles.cameraViewfinder}>
                  <CameraComponent
                    style={StyleSheet.absoluteFill}
                    device={cameraDevice}
                    isActive={scannerModalVisible}
                    codeScanner={codeScanner}
                  />
                  <View style={styles.viewfinderCorners} />
                  <Text style={styles.viewfinderHint}>Align PC QR code within frame</Text>
                </View>
              ) : (
                <View style={[styles.cameraFallback, { backgroundColor: theme.colors.cardSolid, borderColor: theme.colors.border }]}>
                  <Icon name="qr" size={44} color={theme.colors.primary} strokeWidth={1.8} />
                  <Text style={[styles.fallbackTitle, { color: theme.colors.text }]}>Camera Viewfinder</Text>
                  <Text style={[styles.fallbackSub, { color: theme.colors.textSecondary }]}>
                    Scan the PC's QR code or enter the 6-digit pairing code below.
                  </Text>
                </View>
              )}

              {/* Or enter 6-digit code / IP */}
              <View style={styles.codeEntrySection}>
                <Text style={[styles.codeEntryLabel, { color: theme.colors.textSecondary }]}>
                  Or Enter 6-Digit Pairing Code / IP
                </Text>
                <View style={styles.codeRow}>
                  <TextInput
                    style={[styles.codeInput, { backgroundColor: theme.colors.inputBg, borderColor: theme.colors.border, color: theme.colors.text }]}
                    placeholder="e.g. 482 915 or 192.168.1.5"
                    placeholderTextColor={theme.colors.textMuted}
                    value={pairingInput}
                    onChangeText={setPairingInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={[styles.codeConnectBtn, { backgroundColor: theme.colors.primary }]}
                    onPress={handleCodeSubmit}
                  >
                    <Text style={[styles.codeConnectBtnText, { color: theme.mode === 'light' ? '#ffffff' : '#000000' }]}>
                      Connect
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </GlassCard>
          </View>
        </Modal>

        {/* QR Modal */}
        <Modal
          visible={qrModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setQrModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <GlassCard style={styles.modalCard} variant="highlighted">
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Device QR Identity</Text>
              <Text style={[styles.modalSubtitle, { color: theme.colors.textSecondary }]}>
                Scan with another LocalShare device to pair directly.
              </Text>

              <View style={styles.qrContainer}>
                <QRCode
                  value={qrData}
                  size={200}
                  color="#000000"
                  backgroundColor="#ffffff"
                />
              </View>

              <Text style={[styles.fpText, { color: theme.colors.textMuted }]}>
                Fingerprint: {selfDevice.fingerprint || 'Pending'}
              </Text>

              <TouchableOpacity
                style={[styles.closeModalBtn, { backgroundColor: theme.colors.primary }]}
                onPress={() => setQrModalVisible(false)}
              >
                <Text style={[styles.closeModalBtnText, { color: theme.mode === 'light' ? '#ffffff' : '#000000' }]}>
                  Close
                </Text>
              </TouchableOpacity>
            </GlassCard>
          </View>
        </Modal>

        {/* Manual Add Modal */}
        <Modal
          visible={manualModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setManualModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <GlassCard style={styles.modalCard} variant="highlighted">
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Add Peer Manually</Text>
              <Text style={[styles.modalSubtitle, { color: theme.colors.textSecondary }]}>
                Connect across subnets or when mDNS multicast is restricted.
              </Text>

              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: theme.colors.inputBg, borderColor: theme.colors.border, color: theme.colors.text }
                ]}
                placeholder="IP Address (e.g. 192.168.1.45)" // justified: TextInput hint
                placeholderTextColor={theme.colors.textMuted} // justified: TextInput hint
                value={manualIp}
                onChangeText={setManualIp}
                autoCapitalize="none"
              />

              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: theme.colors.inputBg, borderColor: theme.colors.border, color: theme.colors.text }
                ]}
                placeholder="Port (default: 53318)" // justified: TextInput hint
                placeholderTextColor={theme.colors.textMuted} // justified: TextInput hint
                value={manualPort}
                onChangeText={setManualPort}
                keyboardType="numeric"
              />

              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: theme.colors.inputBg, borderColor: theme.colors.border, color: theme.colors.text }
                ]}
                placeholder="Certificate SHA-256 (optional)" // justified: TextInput hint
                placeholderTextColor={theme.colors.textMuted} // justified: TextInput hint
                value={manualFingerprint}
                onChangeText={setManualFingerprint}
                autoCapitalize="none"
              />

              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: theme.colors.cardSolid, borderColor: theme.colors.border }]}
                  onPress={() => setManualModalVisible(false)}
                >
                  <Text style={[styles.cancelModalBtnText, { color: theme.colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: theme.colors.primary }]}
                  onPress={handleManualAdd}
                >
                  <Text style={[styles.confirmModalBtnText, { color: theme.mode === 'light' ? '#ffffff' : '#000000' }]}>
                    Connect
                  </Text>
                </TouchableOpacity>
              </View>
            </GlassCard>
          </View>
        </Modal>
      </View>
      </SafeAreaView>
    </AmbientBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1
  },
  container: {
    flex: 1,
    padding: 16
  },
  selfCard: {
    marginBottom: 14
  },
  selfHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  selfInfo: {
    flex: 1
  },
  selfLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6
  },
  selfLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8
  },
  selfName: {
    fontSize: 18,
    fontWeight: '800'
  },
  selfDetails: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500'
  },
  qrButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10
  },
  qrButtonText: {
    fontWeight: '800',
    fontSize: 13,
    marginLeft: 6
  },
  controlsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4
  },
  manualBtn: {
    borderWidth: 1
  },
  actionBtnText: {
    fontWeight: '700',
    fontSize: 13,
    marginLeft: 6
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12
  },
  searchIcon: {
    marginRight: 8
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0
  },
  clearSearch: {
    paddingHorizontal: 4
  },
  listContent: {
    flexGrow: 1
  },
  scanNowBtn: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 10
  },
  scanNowBtnText: {
    fontWeight: '800',
    fontSize: 14
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    padding: 24
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 6
  },
  modalSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16
  },
  qrContainer: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 16
  },
  fpText: {
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 16
  },
  closeModalBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center'
  },
  closeModalBtnText: {
    fontWeight: '800',
    fontSize: 14
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    marginBottom: 12
  },
  modalBtnRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    marginTop: 8
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 1
  },
  cancelModalBtnText: {
    fontWeight: '700'
  },
  confirmModalBtnText: {
    fontWeight: '800'
  },
  segmentedBar: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
    marginBottom: 12
  },
  segmentedTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 9,
    gap: 6
  },
  segmentedTabText: {
    fontSize: 12,
    fontWeight: '700'
  },
  liveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12
  },
  liveBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1
  },
  liveBannerTitle: {
    fontSize: 13,
    fontWeight: '700'
  },
  liveBannerSub: {
    fontSize: 11,
    marginTop: 1
  },
  disconnectBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1
  },
  disconnectBtnText: {
    fontSize: 12,
    fontWeight: '700'
  },
  radarContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20
  },
  radarWrapper: {
    width: 280,
    height: 280,
    alignItems: 'center',
    justifyContent: 'center'
  },
  radarHint: {
    marginTop: 24,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center'
  },
  connectedHeroCard: {
    padding: 16,
    borderRadius: 18,
    marginBottom: 14
  },
  connectedTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14
  },
  connectedAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12
  },
  connectedInfo: {
    flex: 1
  },
  connectedBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2
  },
  connectedStatusText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8
  },
  liveClipBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6
  },
  liveClipText: {
    fontSize: 9,
    fontWeight: '800'
  },
  connectedNameText: {
    fontSize: 16,
    fontWeight: '800'
  },
  connectedTelemetryText: {
    fontSize: 11,
    marginTop: 1
  },
  disconnectIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  actionTilesRow: {
    flexDirection: 'row',
    gap: 8
  },
  actionTile: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    alignItems: 'center'
  },
  tileIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6
  },
  tileTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 1
  },
  tileSub: {
    fontSize: 9
  },
  scanPcBtn: {
    flex: 1.3
  },
  scannerModalCard: {
    width: '100%',
    maxWidth: 380,
    padding: 20,
    borderRadius: 20
  },
  scannerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14
  },
  closeIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center'
  },
  cameraViewfinder: {
    width: '100%',
    height: 220,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center'
  },
  viewfinderCorners: {
    width: 160,
    height: 160,
    borderWidth: 2,
    borderColor: '#38bdf8',
    borderRadius: 16
  },
  viewfinderHint: {
    position: 'absolute',
    bottom: 10,
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8
  },
  cameraFallback: {
    width: '100%',
    padding: 24,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  fallbackTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 10,
    marginBottom: 4
  },
  fallbackSub: {
    fontSize: 12,
    textAlign: 'center'
  },
  codeEntrySection: {
    marginTop: 16
  },
  codeEntryLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8
  },
  codeRow: {
    flexDirection: 'row',
    gap: 8
  },
  codeInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13
  },
  codeConnectBtn: {
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  codeConnectBtnText: {
    fontSize: 13,
    fontWeight: '800'
  }
});
