import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  StyleSheet,
  ActivityIndicator
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalShare } from '../engine/providers';
import { useTheme } from '../theme';
import PeerCard from '../components/PeerCard';
import OfflinePcSheet from '../components/OfflinePcSheet';
import GlassCard from '../components/GlassCard';
import EmptyState from '../components/EmptyState';
import Icon from '../components/Icon';
import AmbientBackground from '../components/AmbientBackground';
import RadarView from '../components/RadarView';
import { PeerBlip, getPositionForPeer } from './RadarScreen';
import { formatBytes } from '../utils/byteFormat';
import { defaultLogger } from '../utils/logger';

function formatDeviceTelemetry(model) {
  if (!model) return 'PC';
  const m = String(model);
  if (/windows/i.test(m)) return 'Windows PC';
  if (/darwin|mac/i.test(m)) return 'Mac';
  if (/linux/i.test(m)) return 'Linux';
  if (/android/i.test(m)) return 'Android phone';
  if (/ios|iphone/i.test(m)) return 'iPhone';
  return m.replace(/_/g, ' ');
}

/** Short, grouped fingerprint for display: "A1B2 C3D4 E5F6 7890". */
function shortFingerprint(fp) {
  if (!fp) return '';
  return String(fp).replace(/[^0-9a-f]/gi, '').slice(0, 16).toUpperCase().replace(/(.{4})(?=.)/g, '$1 ');
}

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
} catch (err) {
  defaultLogger.info('Camera module unavailable; QR scanning disabled:', err);
}

/**
 * Solid button. 'primary' is the inverted neutral (dark on light themes,
 * light on dark), 'secondary' a soft fill, 'plain' text only.
 * @param {object} props
 * @param {string} props.label
 * @param {string} [props.icon]
 * @param {'primary' | 'secondary' | 'plain'} [props.variant='primary']
 * @param {() => void} [props.onPress]
 * @param {boolean} [props.disabled]
 * @param {any} [props.style]
 * @param {string} [props.testID]
 */
function Button({ label, icon, variant = 'primary', onPress, disabled, style, testID }) {
  const { theme } = useTheme();
  const colors = {
    primary: { bg: theme.colors.text, fg: theme.colors.background },
    secondary: { bg: theme.colors.fill, fg: theme.colors.text },
    plain: { bg: 'transparent', fg: theme.colors.text }
  }[variant];
  return (
    <TouchableOpacity
      style={[styles.button, { backgroundColor: colors.bg, opacity: disabled ? 0.4 : 1 }, style]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
    >
      {icon ? <Icon name={icon} size={17} color={colors.fg} strokeWidth={2.1} /> : null}
      <Text style={[styles.buttonText, { color: colors.fg }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/**
 * Round icon button used in the screen header.
 * @param {object} props
 * @param {string} props.icon
 * @param {string} props.label - Accessibility label.
 * @param {() => void} props.onPress
 * @param {string} [props.testID]
 */
function HeaderIconButton({ icon, label, onPress, testID }) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.headerIconBtn, { backgroundColor: theme.colors.fill }]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      <Icon name={icon} size={19} color={theme.colors.text} strokeWidth={2} />
    </TouchableOpacity>
  );
}

/**
 * Bottom sheet built on Modal: dimmed backdrop (tap to close), grab handle,
 * title row with a close button.
 * @param {object} props
 * @param {boolean} props.visible
 * @param {() => void} props.onClose
 * @param {string} props.title
 * @param {string} [props.subtitle]
 * @param {React.ReactNode} props.children
 */
function Sheet({ visible, onClose, title, subtitle, children }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.colors.card, paddingBottom: Math.max(insets.bottom, 16) + 8 }
          ]}
        >
          <View style={[styles.sheetHandle, { backgroundColor: theme.colors.fillStrong }]} />
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderText}>
              <Text style={[styles.sheetTitle, { color: theme.colors.text }]}>{title}</Text>
              {subtitle ? (
                <Text style={[styles.sheetSubtitle, { color: theme.colors.textSecondary }]}>{subtitle}</Text>
              ) : null}
            </View>
            <TouchableOpacity
              style={[styles.sheetClose, { backgroundColor: theme.colors.fill }]}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="close" size={15} color={theme.colors.textSecondary} strokeWidth={2.4} />
            </TouchableOpacity>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

/**
 * Labelled text field for sheets.
 * @param {object} props
 * @param {string} props.label
 * @param {string} props.value
 * @param {(text: string) => void} props.onChangeText
 * @param {string} [props.hint] - Example text shown when empty.
 * @param {any} [props.keyboardType]
 * @param {boolean} [props.mono]
 */
function Field({ label, value, onChangeText, hint, keyboardType, mono }) {
  const { theme } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
      <TextInput
        style={[
          styles.fieldInput,
          { backgroundColor: theme.colors.fill, color: theme.colors.text },
          mono ? styles.mono : null
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={hint} // justified: TextInput hint
        placeholderTextColor={theme.colors.textMuted} // justified: TextInput hint
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

export default function DevicesScreen({ navigation }) {
  const {
    selfDevice,
    peers,
    isDiscovering,
    startDiscovery,
    scanSubnet,
    addManualPeer,
    connectedPeer,
    connectedPeerTelemetry,
    isLiveConnected,
    liveClipboardEnabled,
    connectToPeer,
    disconnectLive,
    showToast
  } = useLocalShare();

  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    startDiscovery();
  }, [startDiscovery]);

  const [viewMode, setViewMode] = useState('list');
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [scannerModalVisible, setScannerModalVisible] = useState(false);
  const [pairingInput, setPairingInput] = useState('');
  const [codeError, setCodeError] = useState('');
  const [codeTargets, setCodeTargets] = useState(/** @type {any[]} */ ([]));
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [manualIp, setManualIp] = useState('');
  const [manualPort, setManualPort] = useState('53318');
  const [manualFingerprint, setManualFingerprint] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [offlinePcVisible, setOfflinePcVisible] = useState(false);

  const cameraDevice = useCameraDeviceHook ? useCameraDeviceHook('back') : null;

  /**
   * Connect and tell the user, in plain words, when it fails.
   * @param {object} peer
   */
  const connectSafely = async (peer) => {
    const name = peer.displayName || peer.address || 'the device';
    try {
      await connectToPeer(peer);
    } catch (err) {
      const message = err && err.message ? String(err.message) : '';
      defaultLogger.warn('Live connect failed:', message);
      let text = `Couldn't reach ${name}. Check that it's on the same Wi-Fi.`;
      if (/403/.test(message)) text = `${name} declined the connection.`;
      else if (/429/.test(message)) text = 'Too many wrong codes. Wait a few minutes and try again.';
      if (showToast) showToast(text);
    }
  };

  const closeScanner = () => {
    setScannerModalVisible(false);
    setPairingInput('');
    setCodeError('');
    setCodeTargets([]);
  };

  const handleQrPayload = (payload) => {
    try {
      const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
      if (parsed && parsed.address) {
        closeScanner();
        connectSafely({
          deviceId: parsed.deviceId || `qr-${parsed.address}`,
          displayName: parsed.displayName || `PC (${parsed.address})`,
          address: parsed.address,
          port: parsed.port || 53318,
          fingerprint: parsed.fingerprint || '',
          // The PC's QR includes its pairing code, which pairs without a prompt.
          pairingCode: typeof parsed.code === 'string' ? parsed.code : '',
          platform: 'desktop'
        });
      }
    } catch (err) {
      defaultLogger.warn('Ignoring unreadable QR code:', err);
    }
  };

  const codeScanner = useCodeScannerHook ? useCodeScannerHook({
    codeTypes: ['qr'],
    onCodeScanned: (codes) => {
      if (codes && codes.length > 0 && codes[0].value) {
        handleQrPayload(codes[0].value);
      }
    }
  }) : null;

  const handleCodeSubmit = () => {
    const val = pairingInput.trim();
    if (!val) return;
    setCodeError('');

    if (val.includes('.')) {
      const [host, portText] = val.split(':');
      const port = parseInt(portText, 10) || 53318;
      closeScanner();
      addManualPeer(host, port, '');
      // No code: the PC asks its user to approve this phone.
      connectSafely({
        deviceId: `manual-${host}`,
        displayName: `Device (${host})`,
        address: host,
        port,
        platform: 'desktop'
      });
      return;
    }

    const code = val.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(code)) {
      setCodeError('Enter the 6-digit code from your PC, or its IP address.');
      return;
    }
    const pcs = peers.filter((p) => p.platform === 'desktop');
    if (pcs.length === 1) {
      closeScanner();
      connectSafely({ ...pcs[0], pairingCode: code });
    } else if (pcs.length > 1) {
      setCodeTargets(pcs);
    } else {
      setCodeError("No PC found on this Wi-Fi yet. Make sure Share Anywhere is open on it, then try again.");
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

  const otherPeers = useMemo(() => {
    if (!(isLiveConnected && connectedPeer)) return peers;
    return peers.filter(
      (p) => p.deviceId !== connectedPeer.deviceId && p.address !== connectedPeer.address
    );
  }, [peers, isLiveConnected, connectedPeer]);

  const filteredPeers = useMemo(() => {
    if (!searchQuery.trim()) return otherPeers;
    const q = searchQuery.toLowerCase();
    return otherPeers.filter(
      (p) =>
        (p.displayName && p.displayName.toLowerCase().includes(q)) ||
        (p.address && p.address.includes(q))
    );
  }, [otherPeers, searchQuery]);

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

  const isConnected = Boolean(isLiveConnected && connectedPeer);
  const telemetryLine = connectedPeerTelemetry && connectedPeerTelemetry.storage
    ? `${formatDeviceTelemetry(connectedPeerTelemetry.deviceModel)} · ${formatBytes(connectedPeerTelemetry.storage.freeBytes)} free`
    : 'Connected over Wi-Fi';

  const connectionCard = isConnected ? (
    <GlassCard style={styles.connectionCard}>
      <View style={styles.connectedRow}>
        <View style={[styles.deviceTile, { backgroundColor: theme.colors.successGlow }]}>
          <Icon name="desktop" size={22} color={theme.colors.success} strokeWidth={1.9} />
        </View>
        <View style={styles.connectedInfo}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: theme.colors.success }]} />
            <Text style={[styles.statusText, { color: theme.colors.success }]}>Connected</Text>
          </View>
          <Text style={[styles.connectedName, { color: theme.colors.text }]} numberOfLines={1}>
            {connectedPeer.displayName || connectedPeer.address}
          </Text>
          <Text style={[styles.connectedMeta, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {telemetryLine}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.smallPill, { backgroundColor: theme.colors.fill }]}
          onPress={disconnectLive}
          accessibilityRole="button"
          accessibilityLabel="Disconnect"
        >
          <Text style={[styles.smallPillText, { color: theme.colors.textSecondary }]}>Disconnect</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.quickActions, { borderTopColor: theme.colors.border }]}>
        {[
          { key: 'send', icon: 'share', label: 'Send files', onPress: () => handleSelectPeer(connectedPeer) },
          { key: 'browse', icon: 'files', label: 'Browse PC', onPress: () => handleBrowsePeer(connectedPeer) },
          { key: 'activity', icon: 'transfers', label: 'Activity', onPress: () => navigation.navigate('Transfers') }
        ].map((action) => (
          <TouchableOpacity
            key={action.key}
            style={styles.quickAction}
            onPress={action.onPress}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={action.label}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: theme.colors.fill }]}>
              <Icon name={action.icon} size={20} color={theme.colors.text} strokeWidth={1.9} />
            </View>
            <Text style={[styles.quickActionLabel, { color: theme.colors.text }]}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[styles.clipRow, { borderTopColor: theme.colors.border }]}>
        <Icon name="clipboard" size={15} color={theme.colors.textMuted} strokeWidth={2} />
        <Text style={[styles.clipText, { color: theme.colors.textSecondary }]}>
          {liveClipboardEnabled ? 'Clipboard is syncing with this PC' : 'Clipboard sync is paused'}
        </Text>
      </View>
    </GlassCard>
  ) : (
    <GlassCard style={styles.connectionCard}>
      <View style={[styles.deviceTile, styles.deviceTileLarge, { backgroundColor: theme.colors.fill }]}>
        <Icon name="desktop" size={24} color={theme.colors.textSecondary} strokeWidth={1.8} />
      </View>
      <Text style={[styles.heroTitle, { color: theme.colors.text }]}>Connect to your PC</Text>
      <Text style={[styles.heroBody, { color: theme.colors.textSecondary }]}>
        Open Share Anywhere on your computer and scan the code it shows.
      </Text>
      <Button
        label="Scan QR code"
        icon="scan"
        onPress={() => setScannerModalVisible(true)}
        style={styles.heroButton}
        testID="scan-qr-button"
      />
      <Button
        label="Enter code instead"
        variant="plain"
        onPress={() => setScannerModalVisible(true)}
        style={styles.heroSecondary}
      />
    </GlassCard>
  );

  const nearbyCount = otherPeers.length;
  const header = (
    <View>
      <View style={styles.titleRow}>
        <View style={styles.titleCol}>
          <Text style={[styles.title, { color: theme.colors.text }]}>Devices</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {selfDevice.displayName ? `This phone: ${selfDevice.displayName}` : 'Ready to share'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <HeaderIconButton icon="qr" label="Show my code" onPress={() => setQrModalVisible(true)} testID="qr-code-button" />
          <HeaderIconButton
            icon="link"
            label="Connect a PC without Wi-Fi"
            onPress={() => setOfflinePcVisible(true)}
            testID="offline-pc-button"
          />
          <HeaderIconButton icon="plus" label="Add a device by IP" onPress={() => setManualModalVisible(true)} />
        </View>
      </View>

      {connectionCard}

      <View style={styles.sectionRow}>
        <View style={styles.sectionTitleRow}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            {isConnected ? 'Other devices' : 'Nearby'}
          </Text>
          {nearbyCount > 0 ? (
            <Text style={[styles.sectionCount, { color: theme.colors.textMuted }]}>{nearbyCount}</Text>
          ) : null}
          {isDiscovering ? (
            <ActivityIndicator size="small" color={theme.colors.textMuted} style={styles.sectionSpinner} />
          ) : null}
        </View>
        <View style={[styles.segmented, { backgroundColor: theme.colors.fill }]}>
          {[
            { mode: 'list', icon: 'devices', label: 'List view' },
            { mode: 'radar', icon: 'radar', label: 'Radar view' }
          ].map((opt) => {
            const active = viewMode === opt.mode;
            return (
              <TouchableOpacity
                key={opt.mode}
                style={[styles.segment, active && { backgroundColor: theme.colors.card }]}
                onPress={() => setViewMode(opt.mode)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={opt.label}
              >
                <Icon
                  name={opt.icon}
                  size={15}
                  color={active ? theme.colors.text : theme.colors.textMuted}
                  strokeWidth={2}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {viewMode === 'list' && otherPeers.length > 4 ? (
        <View style={[styles.searchBox, { backgroundColor: theme.colors.fill }]}>
          <Icon name="search" size={16} color={theme.colors.textMuted} strokeWidth={2} />
          <TextInput
            style={[styles.searchInput, { color: theme.colors.text }]}
            placeholder="Search devices" // justified: TextInput hint
            placeholderTextColor={theme.colors.textMuted} // justified: TextInput hint
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} accessibilityLabel="Clear search">
              <Icon name="close" size={14} color={theme.colors.textMuted} strokeWidth={2.4} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {viewMode === 'radar' ? (
        <View style={styles.radarContainer}>
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
          <Text style={[styles.radarHint, { color: theme.colors.textMuted }]}>
            {peers.length === 0
              ? 'Looking for devices on this Wi-Fi…'
              : `${peers.length} ${peers.length === 1 ? 'device' : 'devices'} nearby · Tap one to send`}
          </Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <AmbientBackground>
      <FlatList
        style={styles.list}
        contentContainerStyle={[styles.listContent, { paddingTop: insets.top + 12 }]}
        data={viewMode === 'radar' ? [] : filteredPeers}
        keyExtractor={(item) => item.deviceId}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        renderItem={({ item, index }) => (
          <PeerCard
            position={
              filteredPeers.length === 1 ? 'single'
                : index === 0 ? 'first'
                  : index === filteredPeers.length - 1 ? 'last' : 'middle'
            }
            peer={item}
            isTrusted={item.isTrusted}
            isLiveConnected={Boolean(connectedPeer && connectedPeer.deviceId === item.deviceId)}
            onPress={() => handleSelectPeer(item)}
            onBrowseFiles={() => handleBrowsePeer(item)}
            onConnect={() => {
              if (connectedPeer && connectedPeer.deviceId === item.deviceId) {
                disconnectLive();
              } else {
                connectSafely(item);
              }
            }}
          />
        )}
        ListEmptyComponent={
          viewMode === 'radar' ? null : searchQuery ? (
            <Text style={[styles.inlineEmpty, { color: theme.colors.textMuted }]}>
              No devices match "{searchQuery}".
            </Text>
          ) : (
            <EmptyState
              iconName="wifi"
              title={isDiscovering ? 'Looking for devices…' : 'No devices nearby'}
              description={
                isConnected
                  ? 'Only your PC is on this Wi-Fi right now.'
                  : 'Open LocalShare or LocalSend on your other devices and keep them on the same Wi-Fi.'
              }
              action={
                !isDiscovering ? (
                  <Button label="Search again" variant="secondary" icon="refresh" onPress={startDiscovery} />
                ) : null
              }
            />
          )
        }
      />

      {/* Connect: scan the PC's QR, or type its code / IP */}
      <Sheet
        visible={scannerModalVisible}
        onClose={closeScanner}
        title="Connect to your PC"
        subtitle="Scan the QR code in Share Anywhere on your computer."
      >
        {CameraComponent && cameraDevice ? (
          <View style={styles.viewfinder}>
            <CameraComponent
              style={StyleSheet.absoluteFill}
              device={cameraDevice}
              isActive={scannerModalVisible}
              codeScanner={codeScanner}
            />
            <View style={styles.viewfinderFrame} pointerEvents="none">
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
          </View>
        ) : (
          <View style={[styles.cameraFallback, { backgroundColor: theme.colors.fill }]}>
            <Icon name="scan" size={28} color={theme.colors.textMuted} strokeWidth={1.7} />
            <Text style={[styles.cameraFallbackText, { color: theme.colors.textSecondary }]}>
              Camera isn't available. Enter the code shown on your PC instead.
            </Text>
          </View>
        )}

        <View style={styles.orRow}>
          <View style={[styles.orLine, { backgroundColor: theme.colors.border }]} />
          <Text style={[styles.orText, { color: theme.colors.textMuted }]}>or enter the code</Text>
          <View style={[styles.orLine, { backgroundColor: theme.colors.border }]} />
        </View>

        <View style={styles.codeRow}>
          <TextInput
            style={[styles.codeInput, styles.mono, { backgroundColor: theme.colors.fill, color: theme.colors.text }]}
            placeholder="123 456 or 192.168.1.5" // justified: TextInput hint
            placeholderTextColor={theme.colors.textMuted} // justified: TextInput hint
            value={pairingInput}
            onChangeText={(text) => {
              setPairingInput(text);
              if (codeError) setCodeError('');
              if (codeTargets.length) setCodeTargets([]);
            }}
            onSubmitEditing={handleCodeSubmit}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
          />
          <Button label="Connect" onPress={handleCodeSubmit} disabled={!pairingInput.trim()} style={styles.codeButton} />
        </View>
        {codeError ? (
          <Text style={[styles.codeError, { color: theme.colors.danger }]}>{codeError}</Text>
        ) : null}

        {codeTargets.length > 0 ? (
          <View style={styles.targets}>
            <Text style={[styles.targetsTitle, { color: theme.colors.textSecondary }]}>
              Which PC is showing this code?
            </Text>
            {codeTargets.map((pc) => (
              <TouchableOpacity
                key={pc.deviceId}
                style={[styles.targetRow, { backgroundColor: theme.colors.fill }]}
                onPress={() => {
                  const code = pairingInput.replace(/\s+/g, '');
                  closeScanner();
                  connectSafely({ ...pc, pairingCode: code });
                }}
                accessibilityRole="button"
                accessibilityLabel={`Connect to ${pc.displayName}`}
              >
                <Icon name="desktop" size={17} color={theme.colors.textSecondary} strokeWidth={1.9} />
                <Text style={[styles.targetName, { color: theme.colors.text }]} numberOfLines={1}>
                  {pc.displayName || pc.address}
                </Text>
                <Icon name="chevron-right" size={16} color={theme.colors.textMuted} strokeWidth={2} />
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </Sheet>

      {/* This phone's own QR */}
      <Sheet
        visible={qrModalVisible}
        onClose={() => setQrModalVisible(false)}
        title="This phone's code"
        subtitle="Another LocalShare device can scan this to connect."
      >
        <View style={styles.qrWrap}>
          <View style={styles.qrBox}>
            <QRCode value={qrData} size={196} color="#111114" backgroundColor="#ffffff" />
          </View>
          <Text style={[styles.qrName, { color: theme.colors.text }]}>{selfDevice.displayName}</Text>
          {selfDevice.fingerprint ? (
            <Text style={[styles.qrFingerprint, styles.mono, { color: theme.colors.textMuted }]}>
              {shortFingerprint(selfDevice.fingerprint)}
            </Text>
          ) : null}
        </View>
      </Sheet>

      {/* Add by IP */}
      <Sheet
        visible={manualModalVisible}
        onClose={() => setManualModalVisible(false)}
        title="Add a device by IP"
        subtitle="Use this when a device doesn't show up on its own."
      >
        <Field label="IP address" value={manualIp} onChangeText={setManualIp} hint="192.168.1.45" keyboardType="numeric" />
        <Field label="Port" value={manualPort} onChangeText={setManualPort} hint="53318" keyboardType="numeric" />
        <Field
          label="Certificate fingerprint (optional)"
          value={manualFingerprint}
          onChangeText={setManualFingerprint}
          hint="SHA-256"
          mono
        />
        <View style={styles.sheetButtons}>
          <Button label="Cancel" variant="secondary" onPress={() => setManualModalVisible(false)} style={styles.flex1} />
          <Button label="Add device" onPress={handleManualAdd} disabled={!manualIp.trim()} style={styles.flex1} />
        </View>
      </Sheet>
      <OfflinePcSheet visible={offlinePcVisible} onClose={() => setOfflinePcVisible(false)} />
    </AmbientBackground>
  );
}

const CORNER = 26;

const styles = StyleSheet.create({
  list: {
    flex: 1
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    flexGrow: 1
  },
  flex1: {
    flex: 1
  },
  mono: {
    fontFamily: 'monospace',
    letterSpacing: 0.4
  },

  // Header
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    paddingHorizontal: 4
  },
  titleCol: {
    flex: 1,
    minWidth: 0
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.8
  },
  subtitle: {
    fontSize: 14,
    marginTop: 2
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },

  // Buttons
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderCurve: 'continuous'
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.1
  },
  smallPill: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8
  },
  smallPillText: {
    fontSize: 13,
    fontWeight: '600'
  },

  // Connection card
  connectionCard: {
    padding: 18,
    marginBottom: 28
  },
  deviceTile: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center'
  },
  deviceTileLarge: {
    width: 52,
    height: 52,
    marginBottom: 16
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4
  },
  heroBody: {
    fontSize: 15,
    lineHeight: 21,
    marginTop: 4
  },
  heroButton: {
    marginTop: 20
  },
  heroSecondary: {
    marginTop: 4,
    height: 40
  },
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  connectedInfo: {
    flex: 1,
    minWidth: 0,
    marginLeft: 14
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600'
  },
  connectedName: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: -0.3,
    marginTop: 2
  },
  connectedMeta: {
    fontSize: 13,
    marginTop: 1
  },
  quickActions: {
    flexDirection: 'row',
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    gap: 8
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center'
  },
  quickActionLabel: {
    fontSize: 13,
    fontWeight: '500'
  },
  clipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  clipText: {
    fontSize: 13
  },

  // Nearby section
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 4
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4
  },
  sectionCount: {
    fontSize: 17,
    fontWeight: '500'
  },
  sectionSpinner: {
    marginLeft: 2
  },
  segmented: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 10,
    borderCurve: 'continuous'
  },
  segment: {
    width: 36,
    height: 28,
    borderRadius: 7,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center'
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderCurve: 'continuous',
    marginBottom: 8
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0
  },
  inlineEmpty: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 32
  },
  radarContainer: {
    alignItems: 'center',
    paddingVertical: 12
  },
  radarHint: {
    fontSize: 13,
    marginTop: 16
  },

  // Sheets
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.45)'
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderCurve: 'continuous',
    paddingHorizontal: 20,
    paddingTop: 8
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    marginBottom: 14
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 18
  },
  sheetHeaderText: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4
  },
  sheetSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 3
  },
  sheetClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sheetButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8
  },
  field: {
    marginBottom: 14
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6
  },
  fieldInput: {
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderCurve: 'continuous',
    fontSize: 16
  },

  // Scanner
  viewfinder: {
    width: '100%',
    aspectRatio: 1,
    maxHeight: 320,
    alignSelf: 'center',
    borderRadius: 20,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: '#000000'
  },
  viewfinderFrame: {
    position: 'absolute',
    top: '18%',
    left: '18%',
    right: '18%',
    bottom: '18%'
  },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: '#ffffff'
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 10 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 10 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 10 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 10 },
  cameraFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 28,
    paddingHorizontal: 24,
    borderRadius: 18,
    borderCurve: 'continuous'
  },
  cameraFallbackText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center'
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 18
  },
  orLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth
  },
  orText: {
    fontSize: 13
  },
  codeRow: {
    flexDirection: 'row',
    gap: 8
  },
  codeInput: {
    flex: 1,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderCurve: 'continuous',
    fontSize: 17
  },
  codeButton: {
    paddingHorizontal: 18
  },
  codeError: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8
  },
  targets: {
    marginTop: 16,
    gap: 6
  },
  targetsTitle: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 2
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderCurve: 'continuous'
  },
  targetName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500'
  },

  // My QR
  qrWrap: {
    alignItems: 'center',
    paddingBottom: 8
  },
  qrBox: {
    padding: 14,
    borderRadius: 20,
    borderCurve: 'continuous',
    backgroundColor: '#ffffff'
  },
  qrName: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16
  },
  qrFingerprint: {
    fontSize: 13,
    marginTop: 4
  }
});
