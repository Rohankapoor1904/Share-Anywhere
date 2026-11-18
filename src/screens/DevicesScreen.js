import React, { useState, useMemo } from 'react';
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

export default function DevicesScreen({ navigation }) {
  const {
    selfDevice,
    peers,
    isDiscovering,
    startDiscovery,
    stopDiscovery,
    addManualPeer
  } = useLocalShare();

  const { theme } = useTheme();

  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [manualIp, setManualIp] = useState('');
  const [manualPort, setManualPort] = useState('53318');
  const [manualFingerprint, setManualFingerprint] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

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

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <View style={styles.container}>
        {/* Self Device Header Card */}
        <GlassCard style={styles.selfCard} variant="interactive">
          <View style={styles.selfHeaderRow}>
            <View style={styles.selfInfo}>
              <View style={styles.selfLabelRow}>
                <View style={[styles.statusDot, { backgroundColor: theme.colors.success }]} />
                <Text style={[styles.selfLabel, { color: theme.colors.primary }]}>THIS DEVICE</Text>
              </View>
              <Text style={[styles.selfName, { color: theme.colors.text }]}>{selfDevice.displayName}</Text>
              <Text style={[styles.selfDetails, { color: theme.colors.textSecondary }]}>
                {selfDevice.address}:{selfDevice.port}
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.qrButton,
                { backgroundColor: theme.colors.primaryGlow, borderColor: theme.colors.primary }
              ]}
              onPress={() => setQrModalVisible(true)}
              testID="qr-code-button"
            >
              <Text style={[styles.qrButtonText, { color: theme.colors.primary }]}>QR Code</Text>
            </TouchableOpacity>
          </View>
        </GlassCard>

        {/* Discovery Controls Bar */}
        <View style={styles.controlsBar}>
          <TouchableOpacity
            style={[
              styles.actionBtn,
              isDiscovering
                ? { backgroundColor: theme.colors.primary }
                : { backgroundColor: theme.colors.primaryGlow, borderColor: theme.colors.primary, borderWidth: 1 }
            ]}
            onPress={isDiscovering ? stopDiscovery : startDiscovery}
          >
            <Text
              style={[
                styles.actionBtnText,
                { color: isDiscovering && theme.mode === 'light' ? '#ffffff' : isDiscovering ? '#000000' : theme.colors.primary }
              ]}
            >
              {isDiscovering ? '● Scanning for Peers...' : '▶ Start Scan'}
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
            <Text style={[styles.actionBtnText, { color: theme.colors.text }]}>+ Manual IP</Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar when peers present */}
        {peers.length > 2 ? (
          <View style={[styles.searchBox, { backgroundColor: theme.colors.inputBg, borderColor: theme.colors.border }]}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={[styles.searchInput, { color: theme.colors.text }]}
              placeholder="Search discovered peers..." // justified: TextInput hint
              placeholderTextColor={theme.colors.textMuted} // justified: TextInput hint
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Text style={[styles.clearSearch, { color: theme.colors.textMuted }]}>✕</Text>
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
              onPress={() => handleSelectPeer(item)}
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
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10
  },
  qrButtonText: {
    fontWeight: '800',
    fontSize: 13
  },
  controlsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginHorizontal: 4
  },
  manualBtn: {
    borderWidth: 1
  },
  actionBtnText: {
    fontWeight: '700',
    fontSize: 13
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
    fontSize: 14,
    marginRight: 8
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0
  },
  clearSearch: {
    fontSize: 14,
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
  }
});
