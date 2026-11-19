import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  SafeAreaView,
  Modal,
  Image,
  ScrollView,
  Alert,
  ActivityIndicator
} from 'react-native';
import { useLocalShare } from '../engine/providers';
import { useTheme } from '../theme';
import { NativeBridge } from '../native/NativeBridge';
import { RemoteFsClient } from '../engine/remoteFs';
import GlassCard from '../components/GlassCard';
import EmptyState from '../components/EmptyState';
import Icon from '../components/Icon';
import AmbientBackground from '../components/AmbientBackground';
import { mimeTypeIcon } from '../components/iconPaths';
import { defaultLogger } from '../utils/logger';

const logger = defaultLogger;

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Resolve the vector icon for a remote filesystem entry.
 * @param {{isDirectory?: boolean, mimeType?: string}} entry
 * @returns {string}
 */
function fileIconName(entry) {
  if (entry.isDirectory) return 'folder';
  return mimeTypeIcon(entry.mimeType);
}

export default function RemoteExplorerScreen({ route }) {
  const { peers } = useLocalShare();
  const { theme } = useTheme();

  const [targetPeer, setTargetPeer] = useState(route?.params?.targetPeer || null);
  const [currentPath, setCurrentPath] = useState('');
  const [parentPath, setParentPath] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [allFilesGranted, setAllFilesGranted] = useState(true);

  const [preview, setPreview] = useState(null);
  const [previewText, setPreviewText] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (route?.params?.targetPeer) {
      setTargetPeer(route.params.targetPeer);
    }
  }, [route?.params?.targetPeer]);

  useEffect(() => {
    let mounted = true;
    NativeBridge.hasAllFilesAccess()
      .then((granted) => {
        if (mounted) setAllFilesGranted(granted !== false);
      })
      .catch((err) => logger.debug('All-files access check failed:', err.message));
    return () => {
      mounted = false;
    };
  }, []);

  const load = useCallback(async (path) => {
    if (!targetPeer) return;
    setLoading(true);
    try {
      const client = new RemoteFsClient(targetPeer);
      const listing = await client.list(path);
      setCurrentPath(listing.currentPath);
      setParentPath(listing.parentPath);
      setEntries(listing.entries || []);
    } catch (err) {
      logger.error('Remote listing failed:', err);
      Alert.alert('Browse Error', err.message || 'Failed to list remote directory.');
    } finally {
      setLoading(false);
    }
  }, [targetPeer]);

  useEffect(() => {
    if (targetPeer) {
      load('');
    }
  }, [targetPeer, load]);

  const handleRefresh = () => load(currentPath);
  const handleUp = () => {
    if (parentPath) load(parentPath);
  };

  const handleOpenEntry = (entry) => {
    if (entry.isDirectory) {
      load(entry.path);
    }
  };

  const handlePreview = async (entry) => {
    if (!targetPeer) return;
    const client = new RemoteFsClient(targetPeer);
    const mime = entry.mimeType || '';
    if (mime.startsWith('video/') || mime.startsWith('audio/')) {
      try {
        await NativeBridge.openRemoteStreamUrl(client.streamUrl(entry.path), mime);
      } catch (err) {
        logger.error('Open stream failed:', err);
        Alert.alert('Stream Error', err.message || 'Unable to open native player.');
      }
      return;
    }
    setPreview({ entry, client });
    setPreviewText('');
    if (mime.startsWith('text/') || mime === 'application/json') {
      setPreviewLoading(true);
      try {
        const res = await fetch(client.streamUrl(entry.path));
        const text = await res.text();
        setPreviewText(text.slice(0, 20000));
      } catch (err) {
        logger.error('Preview fetch failed:', err);
        setPreviewText(`Failed to load preview: ${err.message}`);
      } finally {
        setPreviewLoading(false);
      }
    }
  };

  const handleDownload = async (entry) => {
    if (!targetPeer) return;
    try {
      const client = new RemoteFsClient(targetPeer);
      const result = await client.downloadToDevice(entry.path, entry.name);
      Alert.alert('Saved', `${entry.name} saved to ${result.savedPath}`);
    } catch (err) {
      logger.error('Download failed:', err);
      Alert.alert('Download Error', err.message || 'Failed to copy file to phone.');
    }
  };

  const handleDuplicate = async (entry) => {
    if (!targetPeer) return;
    try {
      const client = new RemoteFsClient(targetPeer);
      await client.copy(entry.path);
      handleRefresh();
    } catch (err) {
      logger.error('Duplicate failed:', err);
      Alert.alert('Duplicate Error', err.message || 'Failed to duplicate on remote device.');
    }
  };

  const handleDelete = (entry) => {
    if (!targetPeer) return;
    Alert.alert(
      'Delete Remote Item',
      `Delete "${entry.name}" on ${targetPeer.displayName}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const client = new RemoteFsClient(targetPeer);
              await client.remove(entry.path);
              handleRefresh();
            } catch (err) {
              logger.error('Delete failed:', err);
              Alert.alert('Delete Error', err.message || 'Failed to delete on remote device.');
            }
          }
        }
      ]
    );
  };

  const handlePushClipboard = async () => {
    if (!targetPeer) return;
    try {
      const text = await NativeBridge.getClipboardText();
      const client = new RemoteFsClient(targetPeer);
      await client.setClipboard(text, 'LocalShare');
      Alert.alert('Clipboard Sent', 'Your clipboard was pushed to the remote device.');
    } catch (err) {
      logger.error('Clipboard push failed:', err);
      Alert.alert('Clipboard Error', err.message || 'Failed to push clipboard.');
    }
  };

  const handlePullClipboard = async () => {
    if (!targetPeer) return;
    try {
      const client = new RemoteFsClient(targetPeer);
      const text = await client.getClipboard();
      await NativeBridge.setClipboardText(text);
      Alert.alert('Clipboard Received', text ? `Copied: ${text.slice(0, 120)}` : 'Remote clipboard was empty.');
    } catch (err) {
      logger.error('Clipboard pull failed:', err);
      Alert.alert('Clipboard Error', err.message || 'Failed to pull clipboard.');
    }
  };

  const handleGrantAccess = async () => {
    try {
      await NativeBridge.requestAllFilesAccess();
      Alert.alert('Grant Access', 'Enable "Allow management of all files" for LocalShare, then return and refresh.');
    } catch (err) {
      logger.error('Request all-files access failed:', err);
    }
  };

  const renderEntry = ({ item }) => (
    <GlassCard style={styles.entryCard}>
      <View style={styles.entryRow}>
        <TouchableOpacity
          style={styles.entryMain}
          onPress={() => handleOpenEntry(item)}
          disabled={!item.isDirectory}
        >
          <View style={[styles.entryGlyph, { backgroundColor: theme.colors.primaryGlow, borderColor: theme.colors.primary }]}>
            <Icon name={fileIconName(item)} size={18} color={theme.colors.primary} strokeWidth={1.9} />
          </View>
          <View style={styles.entryInfo}>
            <Text style={[styles.entryName, { color: theme.colors.text }]} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={[styles.entryMeta, { color: theme.colors.textSecondary }]}>
              {item.isDirectory ? 'Folder' : formatBytes(item.size)}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.entryActions}>
          {!item.isDirectory ? (
            <TouchableOpacity
              style={[styles.iconBtn, { borderColor: theme.colors.border }]}
              onPress={() => handlePreview(item)}
            >
              <Icon name="eye" size={15} color={theme.colors.text} strokeWidth={2.1} />
            </TouchableOpacity>
          ) : null}
          {!item.isDirectory ? (
            <TouchableOpacity
              style={[styles.iconBtn, { borderColor: theme.colors.border }]}
              onPress={() => handleDownload(item)}
            >
              <Icon name="download" size={15} color={theme.colors.text} strokeWidth={2.1} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.iconBtn, { borderColor: theme.colors.border }]}
            onPress={() => handleDuplicate(item)}
          >
            <Icon name="copy" size={15} color={theme.colors.text} strokeWidth={2.1} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, { borderColor: theme.colors.border }]}
            onPress={() => handleDelete(item)}
          >
            <Icon name="trash" size={15} color={theme.colors.danger} strokeWidth={2.1} />
          </TouchableOpacity>
        </View>
      </View>
    </GlassCard>
  );

  const previewMime = preview?.entry?.mimeType || '';
  const previewIsImage = previewMime.startsWith('image/');

  return (
    <AmbientBackground>
      <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Peer selector */}
        <GlassCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Target Device</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipRow}>
              {peers.length === 0 ? (
                <Text style={[styles.subtext, { color: theme.colors.textSecondary }]}>
                  No peers discovered. Open Devices and scan first.
                </Text>
              ) : (
                peers.map((p) => (
                  <TouchableOpacity
                    key={p.deviceId}
                    style={[
                      styles.peerChip,
                      {
                        backgroundColor: targetPeer?.deviceId === p.deviceId ? theme.colors.primary : theme.colors.primaryGlow,
                        borderColor: theme.colors.primary
                      }
                    ]}
                    onPress={() => setTargetPeer(p)}
                  >
                    <Text
                      style={[
                        styles.peerChipText,
                        { color: targetPeer?.deviceId === p.deviceId && theme.mode !== 'light' ? '#000000' : theme.colors.primary }
                      ]}
                      numberOfLines={1}
                    >
                      {p.displayName}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </ScrollView>
        </GlassCard>

        {/* Clipboard sync bar */}
        <View style={styles.clipboardRow}>
          <TouchableOpacity
            style={[styles.clipboardBtn, { backgroundColor: theme.colors.cardSolid, borderColor: theme.colors.border }]}
            onPress={handlePushClipboard}
            disabled={!targetPeer}
          >
            <Icon name="clipboard" size={13} color={theme.colors.text} strokeWidth={2.2} />
            <Text style={[styles.clipboardBtnText, { color: theme.colors.text }]}>Push Clipboard</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.clipboardBtn, { backgroundColor: theme.colors.cardSolid, borderColor: theme.colors.border }]}
            onPress={handlePullClipboard}
            disabled={!targetPeer}
          >
            <Icon name="download" size={13} color={theme.colors.text} strokeWidth={2.2} />
            <Text style={[styles.clipboardBtnText, { color: theme.colors.text }]}>Pull Clipboard</Text>
          </TouchableOpacity>
        </View>

        {/* All-files access banner */}
        {!allFilesGranted ? (
          <TouchableOpacity
            style={[styles.grantBanner, { backgroundColor: theme.colors.dangerGlow, borderColor: theme.colors.danger }]}
            onPress={handleGrantAccess}
          >
            <Icon name="lock" size={14} color={theme.colors.danger} strokeWidth={2.2} />
            <Text style={[styles.grantText, { color: theme.colors.danger }]}>
              Grant All-Files Access (allow a PC to browse this phone)
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* Path bar */}
        <View style={styles.pathRow}>
          <TouchableOpacity
            style={[styles.pathBtn, { backgroundColor: theme.colors.cardSolid, borderColor: theme.colors.border }]}
            onPress={handleUp}
            disabled={!parentPath}
          >
            <Icon name="arrow-up" size={13} color={theme.colors.text} strokeWidth={2.3} style={{ transform: [{ rotate: '-90deg' }] }} />
            <Text style={[styles.pathBtnText, { color: theme.colors.text }]}>Up</Text>
          </TouchableOpacity>
          <Text style={[styles.pathText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
            {currentPath || (targetPeer ? 'Select a device' : 'No device')}
          </Text>
          <TouchableOpacity
            style={[styles.pathBtn, { backgroundColor: theme.colors.cardSolid, borderColor: theme.colors.border }]}
            onPress={handleRefresh}
            disabled={!targetPeer}
          >
            <Icon name="refresh" size={13} color={theme.colors.text} strokeWidth={2.3} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator style={styles.loader} color={theme.colors.primary} />
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(item) => item.path}
            renderItem={renderEntry}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <EmptyState
                title={targetPeer ? 'Empty folder' : 'No device selected'}
                description={targetPeer ? 'This remote directory has no entries.' : 'Pick a discovered device above to browse its files.'}
              />
            }
          />
        )}
      </View>

      {/* Preview modal */}
      <Modal
        visible={!!preview}
        transparent
        animationType="fade"
        onRequestClose={() => setPreview(null)}
      >
        <View style={styles.modalOverlay}>
          <GlassCard style={styles.modalCard} variant="highlighted">
            <Text style={[styles.modalTitle, { color: theme.colors.text }]} numberOfLines={1}>
              {preview?.entry?.name}
            </Text>
            {previewLoading ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : previewIsImage ? (
              <Image
                source={{ uri: preview?.client?.streamUrl(preview.entry.path) }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            ) : (
              <ScrollView style={styles.previewTextScroll}>
                <Text style={[styles.previewText, { color: theme.colors.textSecondary }]}>
                  {previewText || 'No preview available.'}
                </Text>
              </ScrollView>
            )}
            <TouchableOpacity
              style={[styles.closeModalBtn, { backgroundColor: theme.colors.primary }]}
              onPress={() => setPreview(null)}
            >
              <Text style={[styles.closeModalBtnText, { color: theme.mode === 'light' ? '#ffffff' : '#000000' }]}>
                Close
              </Text>
            </TouchableOpacity>
          </GlassCard>
        </View>
      </Modal>
      </SafeAreaView>
    </AmbientBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1, padding: 12 },
  card: { marginBottom: 10 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8
  },
  chipRow: { flexDirection: 'row', flexWrap: 'nowrap' },
  peerChip: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8
  },
  peerChipText: { fontSize: 13, fontWeight: '700' },
  subtext: { fontSize: 12 },
  clipboardRow: { flexDirection: 'row', marginBottom: 10 },
  clipboardBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 3
  },
  clipboardBtnText: { fontSize: 12, fontWeight: '700', marginLeft: 5 },
  grantBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10
  },
  grantText: { fontSize: 12, fontWeight: '700', textAlign: 'center', marginLeft: 6 },
  pathRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  pathBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginHorizontal: 3
  },
  pathBtnText: { fontSize: 12, fontWeight: '700', marginLeft: 4 },
  pathText: { flex: 1, fontSize: 11, marginHorizontal: 6 },
  loader: { marginTop: 24 },
  listContent: { flexGrow: 1 },
  entryCard: { marginVertical: 4 },
  entryRow: { flexDirection: 'row', alignItems: 'center' },
  entryMain: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  entryGlyph: {
    width: 36,
    height: 36,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  entryInfo: { flex: 1 },
  entryName: { fontSize: 14, fontWeight: '700' },
  entryMeta: { fontSize: 11, marginTop: 2 },
  entryActions: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 6,
    marginLeft: 4
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalCard: { width: '100%', maxWidth: 420, padding: 18, alignItems: 'center' },
  modalTitle: { fontSize: 16, fontWeight: '800', marginBottom: 12 },
  previewImage: { width: '100%', height: 260, marginBottom: 12 },
  previewTextScroll: { maxHeight: 300, width: '100%', marginBottom: 12 },
  previewText: { fontSize: 12, fontFamily: 'monospace' },
  closeModalBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center'
  },
  closeModalBtnText: { fontWeight: '800', fontSize: 14 }
});
