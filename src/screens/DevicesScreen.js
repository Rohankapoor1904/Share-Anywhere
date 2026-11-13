import React, { useState } from 'react';
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

  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [manualIp, setManualIp] = useState('');
  const [manualPort, setManualPort] = useState('53318');
  const [manualFingerprint, setManualFingerprint] = useState('');

  const qrData = JSON.stringify({
    deviceId: selfDevice.deviceId,
    displayName: selfDevice.displayName,
    address: selfDevice.address,
    port: selfDevice.port,
    fingerprint: selfDevice.fingerprint,
    platform: selfDevice.platform
  });

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
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Self Device Header Card */}
        <GlassCard style={styles.selfCard}>
          <View style={styles.selfHeaderRow}>
            <View style={styles.selfInfo}>
              <Text style={styles.selfLabel}>THIS DEVICE</Text>
              <Text style={styles.selfName}>{selfDevice.displayName}</Text>
              <Text style={styles.selfDetails}>
                {selfDevice.address}:{selfDevice.port}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.qrButton}
              onPress={() => setQrModalVisible(true)}
              testID="qr-code-button"
            >
              <Text style={styles.qrButtonText}>QR</Text>
            </TouchableOpacity>
          </View>
        </GlassCard>

        {/* Discovery Controls Bar */}
        <View style={styles.controlsBar}>
          <TouchableOpacity
            style={[styles.actionBtn, isDiscovering ? styles.activeScanBtn : styles.idleScanBtn]}
            onPress={isDiscovering ? stopDiscovery : startDiscovery}
          >
            <Text style={styles.actionBtnText}>
              {isDiscovering ? 'Scanning for Peers...' : 'Start Scan'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.manualBtn]}
            onPress={() => setManualModalVisible(true)}
          >
            <Text style={styles.actionBtnText}>+ Manual IP</Text>
          </TouchableOpacity>
        </View>

        {/* Peer List */}
        <FlatList
          data={peers}
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
              description="Ensure other devices have LocalShare open on the same Wi-Fi network."
              action={
                !isDiscovering ? (
                  <TouchableOpacity style={styles.scanNowBtn} onPress={startDiscovery}>
                    <Text style={styles.scanNowBtnText}>Scan Now</Text>
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
            <GlassCard style={styles.modalCard}>
              <Text style={styles.modalTitle}>Device QR Identity</Text>
              <Text style={styles.modalSubtitle}>Scan with another LocalShare device to pair directly.</Text>

              <View style={styles.qrContainer}>
                <QRCode
                  value={qrData}
                  size={200}
                  color="#0f172a"
                  backgroundColor="#ffffff"
                />
              </View>

              <Text style={styles.fpText}>Fingerprint: {selfDevice.fingerprint || 'Pending'}</Text>

              <TouchableOpacity
                style={styles.closeModalBtn}
                onPress={() => setQrModalVisible(false)}
              >
                <Text style={styles.closeModalBtnText}>Close</Text>
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
            <GlassCard style={styles.modalCard}>
              <Text style={styles.modalTitle}>Add Peer Manually</Text>
              <Text style={styles.modalSubtitle}>Connect across subnets or when mDNS is blocked.</Text>

              <TextInput
                style={styles.input}
                placeholder="IP Address (e.g. 192.168.1.45)"
                placeholderTextColor="#64748b"
                value={manualIp}
                onChangeText={setManualIp}
                autoCapitalize="none"
              />

              <TextInput
                style={styles.input}
                placeholder="Port (default: 53318)"
                placeholderTextColor="#64748b"
                value={manualPort}
                onChangeText={setManualPort}
                keyboardType="numeric"
              />

              <TextInput
                style={styles.input}
                placeholder="Certificate SHA-256 (optional)"
                placeholderTextColor="#64748b"
                value={manualFingerprint}
                onChangeText={setManualFingerprint}
                autoCapitalize="none"
              />

              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.cancelModalBtn]}
                  onPress={() => setManualModalVisible(false)}
                >
                  <Text style={styles.cancelModalBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.confirmModalBtn]}
                  onPress={handleManualAdd}
                >
                  <Text style={styles.confirmModalBtnText}>Connect</Text>
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
    flex: 1,
    backgroundColor: '#0f172a'
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
  selfLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#38bdf8',
    letterSpacing: 0.8,
    marginBottom: 2
  },
  selfName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc'
  },
  selfDetails: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2
  },
  qrButton: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderWidth: 1,
    borderColor: '#38bdf8',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8
  },
  qrButtonText: {
    color: '#38bdf8',
    fontWeight: '700',
    fontSize: 13
  },
  controlsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginHorizontal: 4
  },
  idleScanBtn: {
    backgroundColor: '#3b82f6'
  },
  activeScanBtn: {
    backgroundColor: '#0284c7'
  },
  manualBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)'
  },
  actionBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13
  },
  listContent: {
    flexGrow: 1
  },
  scanNowBtn: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8
  },
  scanNowBtnText: {
    color: '#ffffff',
    fontWeight: '600',
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
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 6
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#94a3b8',
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
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 16
  },
  closeModalBtn: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center'
  },
  closeModalBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14
  },
  input: {
    width: '100%',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 12,
    color: '#f8fafc',
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
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4
  },
  cancelModalBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)'
  },
  cancelModalBtnText: {
    color: '#94a3b8',
    fontWeight: '600'
  },
  confirmModalBtn: {
    backgroundColor: '#3b82f6'
  },
  confirmModalBtnText: {
    color: '#ffffff',
    fontWeight: '600'
  }
});
