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
import { useTheme } from '../theme';
import GlassCard from '../components/GlassCard';
import QueueList from '../components/QueueList';
import EmptyState from '../components/EmptyState';
import { defaultLogger } from '../utils/logger';

const logger = defaultLogger;

export default function ShareHubScreen({ route, navigation }) {
  const { peers, sendFiles } = useLocalShare();
  const { theme } = useTheme();
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
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Destination Peer Selector */}
        <GlassCard style={styles.card} variant={selectedPeer ? 'highlighted' : 'default'}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Recipient Device</Text>
          {selectedPeer ? (
            <View style={styles.peerSelectedRow}>
              <View style={styles.peerInfoRow}>
                <View style={[styles.peerAvatar, { backgroundColor: theme.colors.primaryGlow }]}>
                  <Text style={[styles.peerAvatarText, { color: theme.colors.primary }]}>
                    {(selectedPeer.displayName || 'P').slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.peerDetails}>
                  <Text style={[styles.peerName, { color: theme.colors.text }]}>{selectedPeer.displayName}</Text>
                  <Text style={[styles.peerAddress, { color: theme.colors.textSecondary }]}>
                    {selectedPeer.address}:{selectedPeer.port}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.changePeerBtn, { backgroundColor: theme.colors.cardSolid, borderColor: theme.colors.border }]}
                onPress={() => setSelectedPeer(null)}
              >
                <Text style={[styles.changePeerBtnText, { color: theme.colors.textSecondary }]}>Change</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.peerPickerContainer}>
              <Text style={[styles.subtext, { color: theme.colors.textSecondary }]}>
                Select a target device to receive your files:
              </Text>
              {peers.length > 0 ? (
                <View style={styles.peerChipsRow}>
                  {peers.map((p) => (
                    <TouchableOpacity
                      key={p.deviceId}
                      style={[
                        styles.peerChip,
                        { backgroundColor: theme.colors.primaryGlow, borderColor: theme.colors.primary }
                      ]}
                      onPress={() => setSelectedPeer(p)}
                    >
                      <Text style={[styles.peerChipText, { color: theme.colors.primary }]} numberOfLines={1}>
                        📱 {p.displayName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.findDevicesBtn,
                    { backgroundColor: theme.colors.primaryGlow, borderColor: theme.colors.primary }
                  ]}
                  onPress={() => navigation.navigate('Devices')}
                >
                  <Text style={[styles.findDevicesBtnText, { color: theme.colors.primary }]}>
                    🔍 Find Devices on Network
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </GlassCard>

        {/* File Picker Section */}
        <TouchableOpacity
          style={[
            styles.pickButton,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.borderHighlight
            }
          ]}
          onPress={handlePickFiles}
          activeOpacity={0.7}
        >
          <View style={[styles.uploadIconBadge, { backgroundColor: theme.colors.primaryGlow }]}>
            <Text style={styles.uploadIcon}>📁</Text>
          </View>
          <Text style={[styles.pickButtonText, { color: theme.colors.text }]}>+ Add Files to Send</Text>
          <Text style={[styles.pickButtonSub, { color: theme.colors.textMuted }]}>
            Select documents, photos, videos, or archives
          </Text>
        </TouchableOpacity>

        {/* Staging Queue List */}
        {stagedFiles.length > 0 ? (
          <QueueList files={stagedFiles} onRemove={handleRemoveFile} />
        ) : (
          <EmptyState
            title="No files staged"
            description="Tap '+ Add Files to Send' above to select documents, photos, or media from your device."
          />
        )}

        {/* Send Action Button */}
        {stagedFiles.length > 0 ? (
          <TouchableOpacity
            style={[
              styles.sendButton,
              { backgroundColor: theme.colors.primary },
              !selectedPeer ? styles.disabledBtn : null
            ]}
            onPress={handleSend}
            disabled={!selectedPeer}
          >
            <Text style={[styles.sendButtonText, { color: theme.mode === 'light' ? '#ffffff' : '#000000' }]}>
              🚀 Send {stagedFiles.length} {stagedFiles.length === 1 ? 'File' : 'Files'} {selectedPeer ? `to ${selectedPeer.displayName}` : ''}
            </Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1
  },
  container: {
    padding: 16,
    flexGrow: 1
  },
  card: {
    marginBottom: 16
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10
  },
  peerSelectedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  peerInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10
  },
  peerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  peerAvatarText: {
    fontSize: 15,
    fontWeight: '800'
  },
  peerDetails: {
    flex: 1
  },
  peerName: {
    fontSize: 16,
    fontWeight: '700'
  },
  peerAddress: {
    fontSize: 12,
    marginTop: 2
  },
  changePeerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1
  },
  changePeerBtnText: {
    fontSize: 12,
    fontWeight: '700'
  },
  peerPickerContainer: {
    paddingVertical: 4
  },
  subtext: {
    fontSize: 13,
    marginBottom: 10
  },
  peerChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap'
  },
  peerChip: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
    maxWidth: 200
  },
  peerChipText: {
    fontSize: 13,
    fontWeight: '700'
  },
  findDevicesBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1
  },
  findDevicesBtnText: {
    fontWeight: '700',
    fontSize: 13
  },
  pickButton: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 20,
    alignItems: 'center',
    marginBottom: 16
  },
  uploadIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8
  },
  uploadIcon: {
    fontSize: 22
  },
  pickButtonText: {
    fontSize: 16,
    fontWeight: '700'
  },
  pickButtonSub: {
    fontSize: 12,
    marginTop: 3
  },
  sendButton: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 16
  },
  disabledBtn: {
    opacity: 0.45
  },
  sendButtonText: {
    fontSize: 16,
    fontWeight: '800'
  }
});
