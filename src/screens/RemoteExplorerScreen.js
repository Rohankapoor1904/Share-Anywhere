import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { RemoteFsClient, getPeerAccessToken } from '../engine/remoteFs';
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

/** Tabs: id is the screen's key, type is what /v1/fs/categories expects. */
const CATEGORIES = [
  { id: 'recent', type: 'recent', label: 'Recent', icon: 'activity', empty: 'No recent files' },
  { id: 'photos', type: 'photos', label: 'Photos', icon: 'image', empty: 'No photos' },
  { id: 'videos', type: 'videos', label: 'Videos', icon: 'video', empty: 'No videos' },
  { id: 'audio', type: 'audio', label: 'Music', icon: 'audio', empty: 'No music or audio' },
  { id: 'docs', type: 'documents', label: 'Docs', icon: 'document', empty: 'No documents' },
  { id: 'downloads', type: 'downloads', label: 'Downloads', icon: 'download', empty: 'Downloads is empty' },
  { id: 'storage', type: null, label: 'All files', icon: 'folder', empty: 'Empty folder' }
];

/**
 * Plain-language reason a request to the other device failed.
 * @param {any} err
 * @param {string} name
 */
function describeLoadError(err, name) {
  const message = err && err.message ? String(err.message) : '';
  if (/HTTP 401/.test(message)) return `Not paired with ${name} anymore. Connect again from Home.`;
  if (/HTTP 403/.test(message)) return `${name} doesn't share this folder.`;
  if (/HTTP 404/.test(message)) return `${name} can't open this location.`;
  return `Couldn't reach ${name}. Check that both devices are on the same Wi-Fi.`;
}

/**
 * True when a peer is this phone itself (seen through its own mDNS or subnet echo).
 * @param {any} peer
 * @param {any} self
 */
function isSelfPeer(peer, self) {
  if (!peer || !self) return false;
  if (self.deviceId && peer.deviceId === self.deviceId) return true;
  if (self.fingerprint && peer.fingerprint && peer.fingerprint === self.fingerprint) return true;
  return Boolean(self.address) && self.address !== '127.0.0.1' && peer.address === self.address;
}

/**
 * Whether the Files tab can browse a peer: another device that speaks LocalShare's
 * /v1/fs API (LocalSend apps don't) and has given this phone an access token.
 * @param {any} peer
 * @param {any} self
 */
function canBrowsePeer(peer, self) {
  if (!peer || !peer.address || isSelfPeer(peer, self)) return false;
  if (peer.platform === 'localsend' || peer.platform === 'localsend-https') return false;
  return Boolean(getPeerAccessToken(peer));
}

const peerKeyOf = (p) => (p ? `${p.deviceId || ''}|${p.address}:${p.port || 53318}` : '');

/**
 * Files tab. Always shows the connected device's files (never this phone's own),
 * unless the user explicitly picked another paired device. Remounts the browser
 * whenever the target changes so no path or listing from one device leaks into another.
 */
export default function RemoteExplorerScreen({ route, navigation }) {
  const { peers, connectedPeer, selfDevice } = useLocalShare();
  const routePeer = route?.params?.targetPeer || null;
  const [pickedPeer, setPickedPeer] = useState(routePeer);

  // "Browse PC" from Home passes the device explicitly.
  useEffect(() => {
    if (routePeer) setPickedPeer(routePeer);
  }, [routePeer]);

  // A new connection, or a disconnect, replaces any earlier pick.
  const connectionKey = peerKeyOf(connectedPeer);
  const lastConnectionKey = useRef(connectionKey);
  useEffect(() => {
    if (lastConnectionKey.current !== connectionKey) {
      lastConnectionKey.current = connectionKey;
      setPickedPeer(null);
    }
  }, [connectionKey]);

  const targetPeer = useMemo(() => {
    if (pickedPeer && canBrowsePeer(pickedPeer, selfDevice)) return pickedPeer;
    if (connectedPeer && canBrowsePeer(connectedPeer, selfDevice)) return connectedPeer;
    return null;
  }, [pickedPeer, connectedPeer, selfDevice]);

  const eligiblePeers = useMemo(() => {
    const list = peers.filter((p) => canBrowsePeer(p, selfDevice));
    if (connectedPeer && canBrowsePeer(connectedPeer, selfDevice) &&
        !list.some((p) => peerKeyOf(p) === peerKeyOf(connectedPeer) || p.deviceId === connectedPeer.deviceId)) {
      list.unshift(connectedPeer);
    }
    return list;
  }, [peers, connectedPeer, selfDevice]);

  return (
    <FilesBrowser
      key={peerKeyOf(targetPeer) || 'none'}
      targetPeer={targetPeer}
      eligiblePeers={eligiblePeers}
      onPickPeer={setPickedPeer}
      navigation={navigation}
    />
  );
}

/**
 * Browser for one device's files. Keyed by device in RemoteExplorerScreen, so all
 * state starts fresh for each device.
 * @param {object} props
 * @param {any} props.targetPeer - Device to browse, or null when none is connected.
 * @param {any[]} props.eligiblePeers - Paired devices the user can switch to.
 * @param {(peer: any) => void} props.onPickPeer
 * @param {any} [props.navigation]
 */
function FilesBrowser({ targetPeer, eligiblePeers, onPickPeer, navigation }) {
  const { theme } = useTheme();
  const peers = eligiblePeers;
  const targetName = targetPeer ? (targetPeer.displayName || targetPeer.address) : '';

  const [activeCategory, setActiveCategory] = useState('recent');
  const [loadError, setLoadError] = useState('');
  const [currentPath, setCurrentPath] = useState('');
  const [parentPath, setParentPath] = useState(null);
  const [entries, setEntries] = useState([]);
  const [categoryEntries, setCategoryEntries] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [allFilesGranted, setAllFilesGranted] = useState(true);

  // Device switcher modal
  const [peerPickerVisible, setPeerPickerVisible] = useState(false);

  // Multi-select state
  const [selectedMap, setSelectedMap] = useState({});
  const selectedCount = Object.keys(selectedMap).length;
  const isSelectMode = selectedCount > 0;

  // Lightbox Modal for photo/video previews
  const [lightboxItem, setLightboxItem] = useState(null);

  // Text/generic preview modal
  const [preview, setPreview] = useState(null);
  const [previewText, setPreviewText] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

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
    setLoadError('');
    try {
      const client = new RemoteFsClient(targetPeer);
      const listing = await client.list(path);
      setCurrentPath(listing.currentPath);
      setParentPath(listing.parentPath);
      setEntries(listing.entries || []);
    } catch (err) {
      logger.error('Remote listing failed:', err);
      setEntries([]);
      setLoadError(describeLoadError(err, targetName));
    } finally {
      setLoading(false);
    }
  }, [targetPeer, targetName]);

  const loadCategory = useCallback(async (cat) => {
    if (!targetPeer) return;
    setLoading(true);
    setLoadError('');
    try {
      const client = new RemoteFsClient(targetPeer);
      const def = CATEGORIES.find((c) => c.id === cat);
      const data = await client.categories(def && def.type ? def.type : cat, 90, 0);
      setCategoryEntries(data.entries || []);
    } catch (err) {
      logger.error(`Load category ${cat} failed:`, err);
      setCategoryEntries([]);
      setLoadError(describeLoadError(err, targetName));
    } finally {
      setLoading(false);
    }
  }, [targetPeer, targetName]);

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
      setSearchResults([]);
      setLoadError(describeLoadError(err, targetName));
    } finally {
      setLoading(false);
    }
  }, [targetPeer, targetName]);

  const handleClearSearch = () => {
    setLoadError('');
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
    setSelectedMap({});
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

  const toggleSelectItem = (item) => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (next[item.path]) {
        delete next[item.path];
      } else {
        next[item.path] = item;
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedMap({});

  const handleBatchDownload = async () => {
    if (!targetPeer) return;
    const items = Object.values(selectedMap).filter((item) => !item.isDirectory);
    if (items.length === 0) {
      Alert.alert('Notice', 'No files selected to save.');
      return;
    }
    setLoading(true);
    let successCount = 0;
    try {
      const client = new RemoteFsClient(targetPeer);
      for (const item of items) {
        try {
          await client.downloadToDevice(item.path, item.name);
          successCount++;
        } catch (downloadErr) {
          logger.error(`Batch download failed for ${item.name}:`, downloadErr);
        }
      }
      Alert.alert('Download Complete', `Saved ${successCount} of ${items.length} files to phone.`);
      setSelectedMap({});
    } catch (err) {
      logger.error('Batch download error:', err);
      Alert.alert('Batch Error', err.message || 'Failed during batch download.');
    } finally {
      setLoading(false);
    }
  };

  const handleBatchDelete = () => {
    if (!targetPeer) return;
    const items = Object.values(selectedMap);
    if (items.length === 0) return;
    Alert.alert(
      'Delete Selected Items',
      `Delete ${items.length} item(s) on ${targetPeer.displayName}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const client = new RemoteFsClient(targetPeer);
              for (const item of items) {
                try {
                  await client.remove(item.path);
                } catch (delErr) {
                  logger.error(`Batch delete failed for ${item.name}:`, delErr);
                }
              }
              setSelectedMap({});
              handleRefresh();
            } catch (err) {
              logger.error('Batch delete error:', err);
              Alert.alert('Delete Error', err.message || 'Failed during batch delete.');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
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
    const isSelected = Boolean(selectedMap[item.path]);

    return (
      <TouchableOpacity
        style={[
          styles.thumbnailCell,
          isSelected && { borderColor: theme.colors.primary, borderWidth: 2 }
        ]}
        activeOpacity={0.8}
        onPress={() => {
          if (isSelectMode) {
            toggleSelectItem(item);
          } else {
            setLightboxItem(item);
          }
        }}
        onLongPress={() => toggleSelectItem(item)}
      >
        <Image
          source={{ uri: thumbUri }}
          style={[styles.thumbnailImage, { backgroundColor: theme.colors.cardSolid }]}
          resizeMode="cover"
        />

        {/* Subtle dark gradient scrim overlay for 100% legibility */}
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

        {/* Multi-select indicator badge */}
        {isSelectMode ? (
          <View
            style={[
              styles.selectBadge,
              isSelected
                ? { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
                : { backgroundColor: 'rgba(0, 0, 0, 0.45)', borderColor: 'rgba(255, 255, 255, 0.7)' }
            ]}
          >
            {isSelected ? (
              <Icon name="check" size={11} color={theme.mode === 'light' ? '#ffffff' : '#000000'} strokeWidth={2.8} />
            ) : null}
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  // Render file row for documents or storage folder
  const renderEntry = ({ item }) => {
    const isSelected = Boolean(selectedMap[item.path]);

    return (
      <GlassCard
        style={[
          styles.entryCard,
          isSelected && { borderColor: theme.colors.primary, borderWidth: 1 }
        ]}
      >
        <View style={styles.entryRow}>
          {isSelectMode ? (
            <TouchableOpacity
              style={[
                styles.selectRowBadge,
                isSelected
                  ? { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
                  : { backgroundColor: 'transparent', borderColor: theme.colors.border }
              ]}
              onPress={() => toggleSelectItem(item)}
            >
              {isSelected ? (
                <Icon name="check" size={12} color={theme.mode === 'light' ? '#ffffff' : '#000000'} strokeWidth={2.8} />
              ) : null}
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={styles.entryMain}
            onPress={() => {
              if (isSelectMode) {
                toggleSelectItem(item);
              } else {
                handleOpenEntry(item);
              }
            }}
            onLongPress={() => toggleSelectItem(item)}
            disabled={!item.isDirectory && !isSelectMode}
          >
            <View style={[styles.entryGlyph, { backgroundColor: theme.colors.primaryGlow, borderColor: 'transparent' }]}>
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

          {!isSelectMode ? (
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
          ) : null}
        </View>
      </GlassCard>
    );
  };

  const previewMime = preview?.entry?.mimeType || '';
  const previewIsImage = previewMime.startsWith('image/');
  const clientForLightbox = targetPeer ? new RemoteFsClient(targetPeer) : null;

  return (
    <AmbientBackground>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          {/* Editorial Screen Header with Device Pill Switcher */}
          <View style={styles.editorialHeader}>
            <View style={styles.headerTitleRow}>
              <Text style={[styles.editorialTitle, { color: theme.colors.text }]}>Files</Text>
              <TouchableOpacity
                style={[
                  styles.deviceSwitcherPill,
                  { backgroundColor: theme.colors.cardSolid, borderColor: theme.colors.border }
                ]}
                onPress={() => setPeerPickerVisible(true)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Switch target device"
              >
                <View style={[styles.deviceDot, { backgroundColor: targetPeer ? theme.colors.success : theme.colors.textMuted }]} />
                <Text style={[styles.deviceSwitcherText, { color: theme.colors.text }]} numberOfLines={1}>
                  {targetPeer ? targetName : 'No device'}
                </Text>
                <Icon
                  name="chevron-right"
                  size={12}
                  color={theme.colors.textSecondary}
                  strokeWidth={2.4}
                  style={{ transform: [{ rotate: '90deg' }] }}
                />
              </TouchableOpacity>
            </View>

            {isSelectMode ? (
              <TouchableOpacity
                style={[styles.exitSelectBtn, { borderColor: theme.colors.border }]}
                onPress={clearSelection}
              >
                <Text style={[styles.exitSelectText, { color: theme.colors.primary }]}>Done</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.refreshIconBtn, { backgroundColor: theme.colors.cardSolid, borderColor: theme.colors.border }]}
                onPress={handleRefresh}
                accessibilityRole="button"
                accessibilityLabel="Refresh remote files"
              >
                <Icon name="refresh" size={15} color={theme.colors.text} strokeWidth={2.2} />
              </TouchableOpacity>
            )}
          </View>

          {/* Search bar */}
          <View style={[styles.searchContainer, { backgroundColor: theme.colors.cardSolid, borderColor: theme.colors.border }]}>
            <Icon name="search" size={16} color={theme.colors.textSecondary} strokeWidth={2.2} />
            <TextInput
              style={[styles.searchInput, { color: theme.colors.text }]}
              placeholder={targetPeer ? `Search ${targetName}` : 'Search'} // justified: TextInput hint
              placeholderTextColor={theme.colors.textMuted} // justified: TextInput hint
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
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categoryScroll}
              contentContainerStyle={styles.categoryPillsRow}
            >
              {CATEGORIES.map((cat) => {
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
                    onPress={() => {
                      setActiveCategory(cat.id);
                      setSelectedMap({});
                    }}
                    disabled={!targetPeer}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
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
            </ScrollView>
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
                {currentPath || (targetPeer ? 'Top level' : 'No device')}
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

          {/* All-files access banner */}
          {!allFilesGranted ? (
            <TouchableOpacity
              style={[styles.grantBanner, { backgroundColor: theme.colors.dangerGlow, borderColor: 'transparent' }]}
              onPress={handleGrantAccess}
            >
              <Icon name="lock" size={14} color={theme.colors.danger} strokeWidth={2.2} />
              <Text style={[styles.grantText, { color: theme.colors.danger }]}>
                Grant All-Files Access (allow a PC to browse this phone)
              </Text>
            </TouchableOpacity>
          ) : null}

          {/* Content Views */}
          {!targetPeer ? (
            <EmptyState
              iconName="desktop"
              title="Connect to your PC"
              description="Files from the connected device show up here. Connect from Home by scanning the code on your PC."
              action={navigation ? (
                <TouchableOpacity
                  style={[styles.emptyActionBtn, { backgroundColor: theme.colors.text }]}
                  onPress={() => navigation.navigate('Devices')}
                  accessibilityRole="button"
                  accessibilityLabel="Go to Home to connect"
                >
                  <Text style={[styles.emptyActionText, { color: theme.colors.background }]}>Go to Home</Text>
                </TouchableOpacity>
              ) : null}
            />
          ) : loading ? (
            <ActivityIndicator style={styles.loader} color={theme.colors.primary} />
          ) : loadError ? (
            <EmptyState
              iconName="alert"
              title="Couldn't load files"
              description={loadError}
              action={
                <TouchableOpacity
                  style={[styles.emptyActionBtn, { backgroundColor: theme.colors.fill }]}
                  onPress={handleRefresh}
                  accessibilityRole="button"
                  accessibilityLabel="Try again"
                >
                  <Text style={[styles.emptyActionText, { color: theme.colors.text }]}>Try again</Text>
                </TouchableOpacity>
              }
            />
          ) : isSearching ? (
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.path}
              renderItem={renderEntry}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <EmptyState
                  title="No Matching Files"
                  description={`Nothing on ${targetName} matches "${searchQuery}".`}
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
                  title={activeCategory === 'videos' ? 'No videos' : 'No photos'}
                  description={`None found in ${targetName}'s usual folders.`}
                />
              }
            />
          ) : activeCategory !== 'storage' ? (
            <FlatList
              data={categoryEntries}
              keyExtractor={(item) => item.path}
              renderItem={renderEntry}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <EmptyState
                  title={(CATEGORIES.find((c) => c.id === activeCategory) || CATEGORIES[0]).empty}
                  description={`Nothing here yet on ${targetName}.`}
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
                  iconName="folder"
                  title="Empty folder"
                  description="This folder has nothing in it."
                />
              }
            />
          )}

          {/* Floating Batch Action Bar */}
          {isSelectMode ? (
            <GlassCard style={styles.batchActionBar} variant="interactive">
              <View style={styles.batchBarLeft}>
                <Text style={[styles.batchCountText, { color: theme.colors.text }]}>
                  {selectedCount} selected
                </Text>
              </View>
              <View style={styles.batchBarActions}>
                <TouchableOpacity
                  style={[styles.batchBtn, { backgroundColor: theme.colors.primary }]}
                  onPress={handleBatchDownload}
                >
                  <Icon name="download" size={14} color={theme.mode === 'light' ? '#ffffff' : '#000000'} strokeWidth={2.2} />
                  <Text style={[styles.batchBtnText, { color: theme.mode === 'light' ? '#ffffff' : '#000000' }]}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.batchBtn, { backgroundColor: theme.colors.dangerGlow, borderColor: 'transparent', borderWidth: 1 }]}
                  onPress={handleBatchDelete}
                >
                  <Icon name="trash" size={14} color={theme.colors.danger} strokeWidth={2.2} />
                  <Text style={[styles.batchBtnText, { color: theme.colors.danger }]}>Delete</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.batchBtnCancel, { borderColor: theme.colors.border }]}
                  onPress={clearSelection}
                >
                  <Icon name="close" size={14} color={theme.colors.textSecondary} strokeWidth={2.2} />
                </TouchableOpacity>
              </View>
            </GlassCard>
          ) : null}
        </View>

        {/* Peer Picker Modal */}
        <Modal
          visible={peerPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setPeerPickerVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setPeerPickerVisible(false)}
          >
            <GlassCard style={styles.peerPickerCard} variant="highlighted">
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Browse files on</Text>
              {peers.length === 0 ? (
                <Text style={[styles.subtext, { color: theme.colors.textSecondary, marginVertical: 12 }]}>
                  No connected devices. Connect to your PC from Home first.
                </Text>
              ) : (
                <ScrollView style={styles.peerPickerScroll}>
                  {peers.map((p) => {
                    const isSelected = targetPeer?.deviceId === p.deviceId;
                    return (
                      <TouchableOpacity
                        key={p.deviceId}
                        style={[
                          styles.peerPickerRow,
                          {
                            backgroundColor: isSelected ? theme.colors.primaryGlow : theme.colors.cardSolid,
                            borderColor: isSelected ? theme.colors.primary : theme.colors.border
                          }
                        ]}
                        onPress={() => {
                          setPeerPickerVisible(false);
                          onPickPeer(p);
                        }}
                      >
                        <View style={[styles.deviceDot, { backgroundColor: isSelected ? theme.colors.primary : theme.colors.textMuted }]} />
                        <View style={styles.peerPickerInfo}>
                          <Text style={[styles.peerPickerName, { color: theme.colors.text }]} numberOfLines={1}>
                            {p.displayName}
                          </Text>
                          <Text style={[styles.peerPickerSub, { color: theme.colors.textSecondary }]}>
                            {p.address}
                          </Text>
                        </View>
                        {isSelected ? (
                          <Icon name="check" size={16} color={theme.colors.primary} strokeWidth={2.4} />
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
              <TouchableOpacity
                style={[styles.closeModalBtn, { backgroundColor: theme.colors.cardSolid, borderColor: theme.colors.border, borderWidth: 1, marginTop: 12 }]}
                onPress={() => setPeerPickerVisible(false)}
              >
                <Text style={[styles.closeModalBtnText, { color: theme.colors.text }]}>Cancel</Text>
              </TouchableOpacity>
            </GlassCard>
          </TouchableOpacity>
        </Modal>

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
                style={[styles.lightboxActionBtn, { backgroundColor: theme.colors.dangerGlow, borderColor: 'transparent', borderWidth: 1 }]}
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
  container: { flex: 1, padding: 14 },
  editorialHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingTop: 4
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10
  },
  editorialTitle: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginRight: 10
  },
  deviceSwitcherPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    borderCurve: 'continuous',
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: 180
  },
  deviceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6
  },
  deviceSwitcherText: {
    fontSize: 12,
    fontWeight: '700',
    marginRight: 4
  },
  refreshIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  exitSelectBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderCurve: 'continuous',
    borderWidth: 1
  },
  exitSelectText: {
    fontSize: 13,
    fontWeight: '700'
  },
  subtext: { fontSize: 12 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    borderCurve: 'continuous',
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
  categoryScroll: {
    flexGrow: 0,
    marginBottom: 10,
    marginHorizontal: -14
  },
  categoryPillsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14
  },
  emptyActionBtn: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyActionText: {
    fontSize: 15,
    fontWeight: '600'
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderCurve: 'continuous',
    borderWidth: 1
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
  grantBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 12,
    borderCurve: 'continuous',
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
    borderCurve: 'continuous',
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginHorizontal: 3
  },
  pathBtnText: { fontSize: 12, fontWeight: '700', marginLeft: 4 },
  pathText: { flex: 1, fontSize: 11, marginHorizontal: 6 },
  loader: { marginTop: 24 },
  listContent: { flexGrow: 1, paddingBottom: 32 },
  gridContent: { flexGrow: 1, paddingBottom: 32 },
  gridColumnWrapper: { justifyContent: 'flex-start' },
  thumbnailCell: {
    width: '31.3%',
    height: 110,
    margin: '1%',
    borderRadius: 12,
    borderCurve: 'continuous',
    overflow: 'hidden',
    position: 'relative'
  },
  thumbnailImage: { width: '100%', height: '100%' },
  thumbnailMetaOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
    paddingHorizontal: 6,
    paddingVertical: 4
  },
  thumbnailSizeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2
  },
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
  selectBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center'
  },
  entryCard: { marginVertical: 4 },
  entryRow: { flexDirection: 'row', alignItems: 'center' },
  selectRowBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8
  },
  entryMain: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  entryGlyph: {
    width: 36,
    height: 36,
    borderRadius: 11,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  entryInfo: { flex: 1 },
  entryName: { fontSize: 14, fontWeight: '700' },
  entryMeta: { fontSize: 11, marginTop: 2, fontVariant: ['tabular-nums'] },
  entryActions: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 8,
    borderCurve: 'continuous',
    paddingHorizontal: 7,
    paddingVertical: 6,
    marginLeft: 4
  },
  batchActionBar: {
    position: 'absolute',
    bottom: 84,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderCurve: 'continuous',
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10
  },
  batchBarLeft: { flexDirection: 'row', alignItems: 'center' },
  batchCountText: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  batchBarActions: { flexDirection: 'row', alignItems: 'center' },
  batchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderCurve: 'continuous',
    marginLeft: 8
  },
  batchBtnText: { fontSize: 12, fontWeight: '700', marginLeft: 4 },
  batchBtnCancel: {
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginLeft: 8
  },
  peerPickerCard: {
    width: '100%',
    maxWidth: 380,
    padding: 18,
    alignItems: 'center'
  },
  peerPickerScroll: {
    maxHeight: 240,
    width: '100%',
    marginVertical: 8
  },
  peerPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginVertical: 4
  },
  peerPickerInfo: { flex: 1, marginLeft: 8 },
  peerPickerName: { fontSize: 13, fontWeight: '700' },
  peerPickerSub: { fontSize: 11, marginTop: 2 },
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
  lightboxTitle: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
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
  lightboxActionText: { fontWeight: '700', fontSize: 14, marginLeft: 8 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalCard: { width: '100%', maxWidth: 420, padding: 18, alignItems: 'center' },
  modalTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
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
  closeModalBtnText: { fontWeight: '700', fontSize: 14 }
});
