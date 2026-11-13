import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert
} from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import { useLocalShare } from '../engine/providers';
import GlassCard from '../components/GlassCard';
import QueueList from '../components/QueueList';
import EmptyState from '../components/EmptyState';
import { defaultLogger } from '../utils/logger';

const logger = defaultLogger;

export default function ShareHubScreen({ route, navigation }) {
  const { peers, sendFiles } = useLocalShare();
  const [stagedFiles, setStagedFiles] = useState([]);
  const [selectedPeer, setSelectedPeer] = useState(route?.params?.targetPeer || null);

  useEffect(() => {
    if (route?.params?.targetPeer) {
      setSelectedPeer(route.params.targetPeer);
    }
  }, [route?.params?.targetPeer]);

  const handlePickFiles = async () => {
    try {
      const results = await DocumentPicker.pick({
        allowMultiSelection: true,
        type: [DocumentPicker.types.allFiles]
      });

      const newFiles = results.map((file) => ({
        id: file.uri,
        name: file.name || 'unnamed_file',
        size: file.size || 0,
        path: file.uri,
        type: file.type || 'application/octet-stream'
      }));

      setStagedFiles((prev) => [...prev, ...newFiles]);
    } catch (err) {
      if (!DocumentPicker.isCancel(err)) {
        logger.error('DocumentPicker error:', err);
        Alert.alert('File Picker Error', err.message || 'Failed to select files.');
      }
    }
  };

  const handleRemoveFile = (fileId) => {
    setStagedFiles((prev) => prev.filter((f) => (f.id || f.path) !== fileId));
  };

  const handleSend = async () => {
    if (!selectedPeer) {
      Alert.alert('No Peer Selected', 'Please choose a target device to send files to.');
      return;
    }
    if (stagedFiles.length === 0) {
      Alert.alert('No Files Selected', 'Please select at least one file to send.');
      return;
    }

    try {
      await sendFiles(selectedPeer, stagedFiles);
      setStagedFiles([]);
      navigation.navigate('Transfers');
    } catch (err) {
      logger.error('Send files initiation failed:', err);
      Alert.alert('Send Error', err.message || 'Failed to start file transfer.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Destination Peer Selector */}
        <GlassCard style={styles.card}>
          <Text style={styles.sectionTitle}>Recipient Device</Text>
          {selectedPeer ? (
            <View style={styles.peerSelectedRow}>
              <View style={styles.peerDetails}>
                <Text style={styles.peerName}>{selectedPeer.displayName}</Text>
                <Text style={styles.peerAddress}>{selectedPeer.address}:{selectedPeer.port}</Text>
              </View>
              <TouchableOpacity
                style={styles.changePeerBtn}
                onPress={() => setSelectedPeer(null)}
              >
                <Text style={styles.changePeerBtnText}>Change</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.peerPickerContainer}>
              <Text style={styles.subtext}>Select a device to receive your files:</Text>
              {peers.length > 0 ? (
                <View style={styles.peerChipsRow}>
                  {peers.map((p) => (
                    <TouchableOpacity
                      key={p.deviceId}
                      style={styles.peerChip}
                      onPress={() => setSelectedPeer(p)}
                    >
                      <Text style={styles.peerChipText} numberOfLines={1}>{p.displayName}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.findDevicesBtn}
                  onPress={() => navigation.navigate('Devices')}
                >
                  <Text style={styles.findDevicesBtnText}>Find Devices on Network</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </GlassCard>

        {/* File Picker Section */}
        <TouchableOpacity
          style={styles.pickButton}
          onPress={handlePickFiles}
        >
          <Text style={styles.pickButtonText}>+ Add Files to Send</Text>
        </TouchableOpacity>

        {/* Staging Queue List */}
        {stagedFiles.length > 0 ? (
          <QueueList files={stagedFiles} onRemove={handleRemoveFile} />
        ) : (
          <EmptyState
            title="No files staged"
            description="Tap '+ Add Files to Send' to select documents, photos, or media from your device."
          />
        )}

        {/* Send Action Button */}
        {stagedFiles.length > 0 ? (
          <TouchableOpacity
            style={[styles.sendButton, !selectedPeer ? styles.disabledBtn : null]}
            onPress={handleSend}
            disabled={!selectedPeer}
          >
            <Text style={styles.sendButtonText}>
              Send {stagedFiles.length} {stagedFiles.length === 1 ? 'File' : 'Files'}
            </Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a'
  },
  container: {
    padding: 16,
    flexGrow: 1
  },
  card: {
    marginBottom: 16
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10
  },
  peerSelectedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  peerDetails: {
    flex: 1,
    marginRight: 10
  },
  peerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc'
  },
  peerAddress: {
    fontSize: 13,
    color: '#38bdf8',
    marginTop: 2
  },
  changePeerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)'
  },
  changePeerBtnText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600'
  },
  peerPickerContainer: {
    paddingVertical: 4
  },
  subtext: {
    fontSize: 13,
    color: '#94a3b8',
    marginBottom: 10
  },
  peerChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap'
  },
  peerChip: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: '#38bdf8',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
    maxWidth: 180
  },
  peerChipText: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '600'
  },
  findDevicesBtn: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3b82f6'
  },
  findDevicesBtnText: {
    color: '#3b82f6',
    fontWeight: '600',
    fontSize: 13
  },
  pickButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16
  },
  pickButtonText: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '600'
  },
  sendButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16
  },
  disabledBtn: {
    opacity: 0.5
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700'
  }
});
