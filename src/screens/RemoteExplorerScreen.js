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
  TextInput,
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
  const { peers, connectedPeer } = useLocalShare();
  const { theme } = useTheme();

  const [targetPeer, setTargetPeer] = useState(
    route?.params?.targetPeer || connectedPeer || (peers.length > 0 ? peers[0] : null)
  );
  const [activeCategory, setActiveCategory] = useState('photos'); // 'photos' | 'videos' | 'docs' | 'storage'
  const [currentPath, setCurrentPath] = useState('');
  const [parentPath, setParentPath] = useState(null);
  const [entries, setEntries] = useState([]);
  const [categoryEntries, setCategoryEntries] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [allFilesGranted, setAllFilesGranted] = useState(true);

  // Lightbox Modal for photo/video previews
  const [lightboxItem, setLightboxItem] = useState(null);

  // Text/generic preview modal
  const [preview, setPreview] = useState(null);
  const [previewText, setPreviewText] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (route?.params?.targetPeer) {
      setTargetPeer(route.params.targetPeer);
    } else if (connectedPeer && !targetPeer) {
      setTargetPeer(connectedPeer);
    }
  }, [route?.params?.targetPeer, connectedPeer, targetPeer]);

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

  const loadStorage = useCallback(async (path) => {
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

  const loadCategory = useCallback(async (cat) => {
    if (!targetPeer) return;
    setLoading(true);
    try {
      const client = new RemoteFsClient(targetPeer);
      const catType = cat === 'docs' ? 'documents' : cat;
      const data = await client.categories(catType, 90, 0);
      setCategoryEntries(data.entries || []);
    } catch (err) {
      logger.error(`Load category ${cat} failed:`, err);
      setCategoryEntries([]);
    } finally {
      setLoading(false);
    }
  }, [targetPeer]);

  const performSearch = useCallback(async (q) => {
    if (!targetPeer || !q.trim()) return;
    setIsSearching(true);
    setLoading(true);
    try {
      const client = new RemoteFsClient(targetPeer);
      const data = await client.search(q.trim());
      setSearchResults(data.entries || []);
    } catch (err) {
      logger.error('Remote search failed:', err);
      Alert.alert('Search Error', err.message || 'Failed to search files on device.');
    } finally {
      setLoading(false);
    }
  }, [targetPeer]);

  const handleClearSearch = () => {
    setSearchQuery('');
    setIsSearching(false);
    setSearchResults([]);
  };

  useEffect(() => {
    if (!targetPeer) return;
    if (activeCategory === 'storage') {
      loadStorage(currentPath || '');
    } else {
      loadCategory(activeCategory);
    }
  }, [targetPeer, activeCategory, loadStorage, loadCategory, currentPath]);

  const handleRefresh = () => {
    if (isSearching && searchQuery.trim()) {
      performSearch(searchQuery);
    } else if (activeCategory === 'storage') {
      loadStorage(currentPath);
    } else {
      loadCategory(activeCategory);
    }
  };

  const handleUp = () => {
    if (parentPath) loadStorage(parentPath);
  };

  const handleOpenEntry = (entry) => {
    if (entry.isDirectory) {
      loadStorage(entry.path);
    }
  };

  const handlePreview = async (entry) => {
    if (!targetPeer) return;
    const client = new RemoteFsClient(targetPeer);
    const mime = entry.mimeType || '';
    if (mime.startsWith('image/')) {
      setLightboxItem(entry);
      return;
    }
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
              if (lightboxItem && lightboxItem.path === entry.path) {
                setLightboxItem(null);
              }
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

  // Render 3-column media thumbnail cell (Photos/Videos)
  const renderMediaThumbnail = ({ item }) => {
    if (!targetPeer) return null;
    const client = new RemoteFsClient(targetPeer);
    const thumbUri = client.thumbnailUrl(item.path, 250);

    return (
      <TouchableOpacity
        style={styles.thumbnailCell}
        activeOpacity={0.8}
        onPress={() => setLightboxItem(item)}
      >
        <Image
          source={{ uri: thumbUri }}
          style={[styles.thumbnailImage, { backgroundColor: theme.colors.cardSolid }]}
          resizeMode="cover"
        />
        <View style={styles.thumbnailMetaOverlay}>
          <Text style={styles.thumbnailSizeText} numberOfLines={1}>
            {formatBytes(item.size)}
          </Text>
        </View>
        {activeCategory === 'videos' || item.name.match(/\.(mp4|mkv|mov|avi|webm)$/i) ? (
          <View style={styles.thumbnailPlayBadge}>
            <Icon name="video" size={12} color="#ffffff" strokeWidth={2.4} />
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  // Render file row for documents or storage folder
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
  const clientForLightbox = targetPeer ? new RemoteFsClient(targetPeer) : null;

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

          {/* Search bar */}
          <View style={[styles.searchContainer, { backgroundColor: theme.colors.cardSolid, borderColor: theme.colors.border }]}>
            <Icon name="search" size={16} color={theme.colors.textSecondary} strokeWidth={2.2} />
            <TextInput
              style={[styles.searchInput, { color: theme.colors.text }]}
              placeholder="Search files on remote device..."
              placeholderTextColor={theme.colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={() => performSearch(searchQuery)}
              returnKeyType="search"
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity onPress={handleClearSearch} style={styles.clearSearchBtn}>
                <Icon name="close" size={14} color={theme.colors.textSecondary} strokeWidth={2.4} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Category Tabs */}
          {!isSearching ? (
            <View style={styles.categoryPillsRow}>
              {[
                { id: 'photos', label: 'Photos', icon: 'image' },
                { id: 'videos', label: 'Videos', icon: 'video' },
                { id: 'docs', label: 'Docs', icon: 'document' },
                { id: 'storage', label: 'All Storage', icon: 'folder' }
              ].map((cat) => {
                const isActive = activeCategory === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.categoryPill,
                      {
                        backgroundColor: isActive ? theme.colors.primary : theme.colors.cardSolid,
                        borderColor: isActive ? theme.colors.primary : theme.colors.border
                      }
                    ]}
                    onPress={() => setActiveCategory(cat.id)}
                  >
                    <Icon
                      name={cat.icon}
                      size={13}
                      color={isActive ? (theme.mode === 'light' ? '#ffffff' : '#000000') : theme.colors.textSecondary}
                      strokeWidth={2.2}
                    />
                    <Text
                      style={[
                        styles.categoryPillText,
                        { color: isActive ? (theme.mode === 'light' ? '#ffffff' : '#000000') : theme.colors.textSecondary }
                      ]}
                    >
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={styles.searchHeader}>
              <Text style={[styles.searchHeaderText, { color: theme.colors.text }]}>
                Search results for &quot;{searchQuery}&quot; ({searchResults.length})
              </Text>
              <TouchableOpacity onPress={handleClearSearch}>
                <Text style={[styles.clearSearchText, { color: theme.colors.primary }]}>Clear</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Storage Breadcrumbs / Path Row */}
          {!isSearching && activeCategory === 'storage' ? (
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
                {currentPath || (targetPeer ? 'Root Storage' : 'No device')}
              </Text>
              <TouchableOpacity
                style={[styles.pathBtn, { backgroundColor: theme.colors.cardSolid, borderColor: theme.colors.border }]}
                onPress={handleRefresh}
                disabled={!targetPeer}
              >
                <Icon name="refresh" size={13} color={theme.colors.text} strokeWidth={2.3} />
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Clipboard Sync Quick Bar */}
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

          {/* Content Views */}
          {loading ? (
            <ActivityIndicator style={styles.loader} color={theme.colors.primary} />
          ) : isSearching ? (
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.path}
              renderItem={renderEntry}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <EmptyState
                  title="No Matching Files"
                  description={`No files matching "${searchQuery}" were found on ${targetPeer?.displayName || 'the device'}.`}
                />
              }
            />
          ) : activeCategory === 'photos' || activeCategory === 'videos' ? (
            <FlatList
              key="grid-3"
              data={categoryEntries}
              numColumns={3}
              keyExtractor={(item) => item.path}
              renderItem={renderMediaThumbnail}
              contentContainerStyle={styles.gridContent}
              columnWrapperStyle={styles.gridColumnWrapper}
              ListEmptyComponent={
                <EmptyState
                  title={targetPeer ? `No ${activeCategory}` : 'No device selected'}
                  description={targetPeer ? `No ${activeCategory} found on ${targetPeer.displayName}.` : 'Select a device above.'}
                />
              }
            />
          ) : activeCategory === 'docs' ? (
            <FlatList
              data={categoryEntries}
              keyExtractor={(item) => item.path}
              renderItem={renderEntry}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <EmptyState
                  title="No Documents"
                  description={targetPeer ? `No documents found on ${targetPeer.displayName}.` : 'Select a device above.'}
                />
              }
            />
          ) : (
            <FlatList
              data={entries}
              keyExtractor={(item) => item.path}
              renderItem={renderEntry}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <EmptyState
                  title={targetPeer ? 'Empty Folder' : 'No device selected'}
                  description={targetPeer ? 'This remote directory has no entries.' : 'Pick a discovered device above to browse its files.'}
                />
              }
            />
          )}
        </View>

        {/* Full-Screen Modal Lightbox for Photos & Videos */}
        <Modal
          visible={!!lightboxItem}
          transparent
          animationType="fade"
          onRequestClose={() => setLightboxItem(null)}
        >
          <View style={styles.lightboxOverlay}>
            <View style={styles.lightboxHeader}>
              <View style={styles.lightboxTitleBox}>
                <Text style={styles.lightboxTitle} numberOfLines={1}>
                  {lightboxItem?.name}
                </Text>
                <Text style={styles.lightboxSubtitle}>
                  {formatBytes(lightboxItem?.size)}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.lightboxCloseBtn}
                onPress={() => setLightboxItem(null)}
              >
                <Icon name="close" size={20} color="#ffffff" strokeWidth={2.4} />
              </TouchableOpacity>
            </View>

            <View style={styles.lightboxBody}>
              {lightboxItem && clientForLightbox ? (
                <Image
                  source={{ uri: clientForLightbox.streamUrl(lightboxItem.path) }}
                  style={styles.lightboxImage}
                  resizeMode="contain"
                />
              ) : null}
            </View>

            <View style={styles.lightboxActions}>
              <TouchableOpacity
                style={[styles.lightboxActionBtn, { backgroundColor: theme.colors.primary }]}
                onPress={() => lightboxItem && handleDownload(lightboxItem)}
              >
                <Icon name="download" size={16} color={theme.mode === 'light' ? '#ffffff' : '#000000'} strokeWidth={2.2} />
                <Text style={[styles.lightboxActionText, { color: theme.mode === 'light' ? '#ffffff' : '#000000' }]}>
                  Save to Phone
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.lightboxActionBtn, { backgroundColor: theme.colors.dangerGlow, borderColor: theme.colors.danger, borderWidth: 1 }]}
                onPress={() => lightboxItem && handleDelete(lightboxItem)}
              >
                <Icon name="trash" size={16} color={theme.colors.danger} strokeWidth={2.2} />
                <Text style={[styles.lightboxActionText, { color: theme.colors.danger }]}>
                  Delete
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Preview modal for code / text files */}
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
    marginLeft: 8
  },
  clearSearchBtn: { padding: 4 },
  categoryPillsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  categoryPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginHorizontal: 2
  },
  categoryPillText: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 5
  },
  searchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 4
  },
  searchHeaderText: { fontSize: 13, fontWeight: '700' },
  clearSearchText: { fontSize: 12, fontWeight: '700' },
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
  listContent: { flexGrow: 1, paddingBottom: 40 },
  gridContent: { flexGrow: 1, paddingBottom: 40 },
  gridColumnWrapper: { justifyContent: 'flex-start' },
  thumbnailCell: {
    width: '31.3%',
    height: 110,
    margin: '1%',
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative'
  },
  thumbnailImage: { width: '100%', height: '100%' },
  thumbnailMetaOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingHorizontal: 5,
    paddingVertical: 3
  },
  thumbnailSizeText: { color: '#ffffff', fontSize: 10, fontWeight: '600' },
  thumbnailPlayBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center'
  },
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
  lightboxOverlay: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'space-between',
    paddingTop: 40,
    paddingBottom: 24,
    paddingHorizontal: 16
  },
  lightboxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12
  },
  lightboxTitleBox: { flex: 1, marginRight: 12 },
  lightboxTitle: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  lightboxSubtitle: { color: 'rgba(255, 255, 255, 0.6)', fontSize: 12, marginTop: 2 },
  lightboxCloseBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)'
  },
  lightboxBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  lightboxImage: { width: '100%', height: '100%' },
  lightboxActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingTop: 16
  },
  lightboxActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12
  },
  lightboxActionText: { fontWeight: '800', fontSize: 14, marginLeft: 8 },
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
