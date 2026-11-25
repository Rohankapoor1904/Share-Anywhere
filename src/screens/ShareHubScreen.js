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
import Icon from '../components/Icon';
import AmbientBackground from '../components/AmbientBackground';
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
        type: [DocumentPicker.types.allFiles],
        copyTo: 'cachesDirectory'
      });

      const newFiles = results.map((file) => ({
        id: file.uri,
        name: file.name || 'unnamed_file',
        size: file.size || 0,
        path: file.fileCopyUri || file.uri,
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

  const handleSend = () => {
    if (!selectedPeer) {
      Alert.alert('No Peer Selected', 'Please choose a target device to send files to.');
      return;
    }
    if (stagedFiles.length === 0) {
      Alert.alert('No Files Selected', 'Please select at least one file to send.');
      return;
    }

    const filesToSend = [...stagedFiles];
    setStagedFiles([]);
    navigation.navigate('Transfers');

    sendFiles(selectedPeer, filesToSend).catch((err) => {
      logger.error('Send files initiation failed:', err);
      Alert.alert('Send Error', err.message || 'Failed during file transfer.');
    });
  };

  return (
    <AmbientBackground>
      <SafeAreaView style={styles.safeArea}>
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
                        { backgroundColor: theme.colors.primaryGlow, borderColor: 'transparent' }
                      ]}
                      onPress={() => setSelectedPeer(p)}
                    >
                      <Icon name="devices" size={13} color={theme.colors.primary} strokeWidth={2.2} />
                      <Text style={[styles.peerChipText, { color: theme.colors.primary }]} numberOfLines={1}>
                        {p.displayName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.findDevicesBtn,
                    { backgroundColor: theme.colors.primaryGlow, borderColor: 'transparent' }
                  ]}
                  onPress={() => navigation.navigate('Devices')}
                >
                  <Icon name="search" size={14} color={theme.colors.primary} strokeWidth={2.3} />
                  <Text style={[styles.findDevicesBtnText, { color: theme.colors.primary }]}>
                    Find Devices on Network
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
          <View style={[styles.uploadIconBadge, { backgroundColor: theme.colors.primaryGlow, borderColor: 'transparent' }]}>
            <Icon name="upload" size={21} color={theme.colors.primary} strokeWidth={2} />
          </View>
          <Text style={[styles.pickButtonText, { color: theme.colors.text }]}>Add Files to Send</Text>
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
            <Icon name="share" size={16} color={theme.mode === 'light' ? '#ffffff' : '#000000'} strokeWidth={2.2} />
            <Text style={[styles.sendButtonText, { color: theme.mode === 'light' ? '#ffffff' : '#000000' }]}>
              Send {stagedFiles.length} {stagedFiles.length === 1 ? 'File' : 'Files'}{selectedPeer ? ` to ${selectedPeer.displayName}` : ''}
            </Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
      </SafeAreaView>
    </AmbientBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1
  },
  container: {
    padding: 16,
    paddingBottom: 40,
    flexGrow: 1
  },
  card: {
    marginBottom: 16
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
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
    fontWeight: '700'
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
    borderRadius: 10,
    borderCurve: 'continuous',
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
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderCurve: 'continuous',
    marginRight: 8,
    marginBottom: 8,
    maxWidth: 200
  },
  peerChipText: {
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 6
  },
  findDevicesBtn: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1
  },
  findDevicesBtnText: {
    fontWeight: '700',
    fontSize: 13,
    marginLeft: 7
  },
  pickButton: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 16,
    borderCurve: 'continuous',
    paddingVertical: 20,
    alignItems: 'center',
    marginBottom: 16
  },
  uploadIconBadge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8
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
    flexDirection: 'row',
    borderRadius: 16,
    borderCurve: 'continuous',
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16
  },
  disabledBtn: {
    opacity: 0.45
  },
  sendButtonText: {
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8
  }
});
