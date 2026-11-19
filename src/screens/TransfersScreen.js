import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  SafeAreaView,
  Linking,
  Alert
} from 'react-native';
import { useLocalShare } from '../engine/providers';
import { useTheme } from '../theme';
import TransferTile from '../components/TransferTile';
import GlassCard from '../components/GlassCard';
import EmptyState from '../components/EmptyState';
import Icon from '../components/Icon';
import AmbientBackground from '../components/AmbientBackground';
import { fileTypeIcon } from '../components/iconPaths';
import { formatBytes, formatSpeed } from '../utils/byteFormat';
import { defaultLogger } from '../utils/logger';

const logger = defaultLogger;

export default function TransfersScreen() {
  const { transfers, receivedFiles, cancelTransfer, retryTransfer } = useLocalShare();
  const { theme } = useTheme();
  const [screenTab, setScreenTab] = useState('transfers');
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState('all');

  const filteredTransfers = useMemo(() => {
    switch (filter) {
      case 'active':
        return transfers.filter((t) => t.status === 'in_progress' || t.status === 'queued');
      case 'completed':
        return transfers.filter((t) => t.status === 'completed');
      case 'failed':
        return transfers.filter((t) => t.status === 'failed' || t.status === 'cancelled');
      case 'all':
      default:
        return transfers;
    }
  }, [transfers, filter]);

  const getFileCategory = (name) => {
    const ext = (name || '').split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'webp':
      case 'mp4':
      case 'mkv':
      case 'mov':
      case 'mp3':
      case 'wav':
        return 'media';
      case 'zip':
      case 'rar':
      case 'tar':
      case 'gz':
      case '7z':
      case 'apk':
        return 'archive';
      case 'pdf':
      case 'txt':
      case 'doc':
      case 'docx':
      case 'json':
      case 'csv':
        return 'doc';
      default:
        return 'other';
    }
  };

  const filteredFiles = useMemo(() => {
    let result = receivedFiles;
    if (category !== 'all') {
      result = result.filter((f) => getFileCategory(f.name) === category);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((f) => f.name && f.name.toLowerCase().includes(q));
    }
    return result;
  }, [receivedFiles, category, searchQuery]);

  const activeTransfers = transfers.filter((t) => t.status === 'in_progress');
  const aggregateSpeed = activeTransfers.reduce((acc, t) => acc + (t.speed || 0), 0);

  const handleOpenFile = async (file) => {
    try {
      const url = file.path.startsWith('file://') ? file.path : `file://${file.path}`;
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Cannot Open File', `No app available on device to open ${file.name}.`);
      }
    } catch (err) {
      logger.error('Failed to open received file:', err);
      Alert.alert('Open Error', err.message || 'Could not open file.');
    }
  };

  return (
    <AmbientBackground>
      <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Segmented Top Switcher */}
        <View style={[styles.segmentedBar, { backgroundColor: theme.colors.cardSolid, borderColor: theme.colors.border }]}>
          <TouchableOpacity
            style={[
              styles.segmentedTab,
              screenTab === 'transfers' && { backgroundColor: theme.colors.primary }
            ]}
            onPress={() => setScreenTab('transfers')}
          >
            <Icon
              name="transfers"
              size={14}
              color={screenTab === 'transfers' ? (theme.mode === 'light' ? '#ffffff' : '#000000') : theme.colors.textSecondary}
              strokeWidth={2.2}
            />
            <Text
              style={[
                styles.segmentedTabText,
                { color: screenTab === 'transfers' ? (theme.mode === 'light' ? '#ffffff' : '#000000') : theme.colors.textSecondary }
              ]}
            >
              Transfers ({transfers.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.segmentedTab,
              screenTab === 'received' && { backgroundColor: theme.colors.primary }
            ]}
            onPress={() => setScreenTab('received')}
          >
            <Icon
              name="received"
              size={14}
              color={screenTab === 'received' ? (theme.mode === 'light' ? '#ffffff' : '#000000') : theme.colors.textSecondary}
              strokeWidth={2.2}
            />
            <Text
              style={[
                styles.segmentedTabText,
                { color: screenTab === 'received' ? (theme.mode === 'light' ? '#ffffff' : '#000000') : theme.colors.textSecondary }
              ]}
            >
              Received ({receivedFiles.length})
            </Text>
          </TouchableOpacity>
        </View>

        {screenTab === 'transfers' ? (
          <>
            <View style={styles.header}>
              <View style={styles.headerTitleRow}>
                <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Transfers</Text>
                <View style={[styles.sessionBadge, { backgroundColor: theme.colors.primaryGlow, borderColor: theme.colors.primary }]}>
                  <Text style={[styles.sessionBadgeText, { color: theme.colors.primary }]}>
                    {transfers.length} {transfers.length === 1 ? 'session' : 'sessions'}
                  </Text>
                </View>
              </View>
              <Text style={[styles.headerSubtitle, { color: theme.colors.textSecondary }]}>
                Real-time streaming TLS transfer sessions with chunk verification.
              </Text>
            </View>

            {/* Live Bandwidth Banner when active transfers exist */}
            {activeTransfers.length > 0 ? (
              <View
                style={[
                  styles.bandwidthBanner,
                  { backgroundColor: theme.colors.card, borderColor: theme.colors.borderHighlight }
                ]}
              >
                <View style={[styles.speedIconBadge, { backgroundColor: theme.colors.primaryGlow, borderColor: theme.colors.primary }]}>
                  <Icon name="activity" size={17} color={theme.colors.primary} strokeWidth={2.2} />
                </View>
                <View style={styles.speedInfo}>
                  <Text style={[styles.speedLabel, { color: theme.colors.textMuted }]}>COMBINED LAN THROUGHPUT</Text>
                  <Text style={[styles.speedVal, { color: theme.colors.primary }]}>
                    {formatSpeed(aggregateSpeed)} ({activeTransfers.length} active)
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Filter Chips Bar */}
            <View style={styles.filterBar}>
              {[
                { id: 'all', label: `All (${transfers.length})` },
                { id: 'active', label: `Active (${transfers.filter((t) => t.status === 'in_progress' || t.status === 'queued').length})` },
                { id: 'completed', label: `Completed (${transfers.filter((t) => t.status === 'completed').length})` },
                { id: 'failed', label: `Failed (${transfers.filter((t) => t.status === 'failed' || t.status === 'cancelled').length})` }
              ].map((item) => {
                const isSelected = filter === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: isSelected ? theme.colors.primary : theme.colors.cardSolid,
                        borderColor: isSelected ? theme.colors.primary : theme.colors.border
                      }
                    ]}
                    onPress={() => setFilter(item.id)}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        { color: isSelected && theme.mode === 'light' ? '#ffffff' : isSelected ? '#000000' : theme.colors.textSecondary }
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <FlatList
              data={filteredTransfers}
              keyExtractor={(item) => item.sessionId}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <TransferTile
                  transfer={item}
                  onCancel={cancelTransfer}
                  onRetry={retryTransfer}
                />
              )}
              ListEmptyComponent={
                <EmptyState
                  title={filter === 'all' ? 'No Active Transfers' : `No ${filter} transfers`}
                  description="Transfers will stream here in real time with progress, speed, and SHA-256 verification."
                />
              }
            />
          </>
        ) : (
          <>
            <View style={styles.header}>
              <View style={styles.headerTitleRow}>
                <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Received Files</Text>
                <View style={[styles.sessionBadge, { backgroundColor: theme.colors.primaryGlow, borderColor: theme.colors.primary }]}>
                  <Text style={[styles.sessionBadgeText, { color: theme.colors.primary }]}>
                    {receivedFiles.length} {receivedFiles.length === 1 ? 'file' : 'files'}
                  </Text>
                </View>
              </View>
              <Text style={[styles.headerSubtitle, { color: theme.colors.textSecondary }]}>
                Files securely transferred and SHA-256 verified over direct LAN.
              </Text>
            </View>

            {receivedFiles.length > 2 ? (
              <View style={[styles.searchBox, { backgroundColor: theme.colors.inputBg, borderColor: theme.colors.border }]}>
                <Icon name="search" size={15} color={theme.colors.textMuted} style={styles.searchIcon} strokeWidth={2.2} />
                <TextInput
                  style={[styles.searchInput, { color: theme.colors.text }]}
                  placeholder="Search received files..." // justified: TextInput hint
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

            {receivedFiles.length > 0 ? (
              <View style={styles.filterBar}>
                {[
                  { id: 'all', label: 'All Files' },
                  { id: 'media', label: 'Media' },
                  { id: 'doc', label: 'Documents' },
                  { id: 'archive', label: 'Archives' }
                ].map((item) => {
                  const isSelected = category === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[
                        styles.filterChip,
                        {
                          backgroundColor: isSelected ? theme.colors.primary : theme.colors.cardSolid,
                          borderColor: isSelected ? theme.colors.primary : theme.colors.border
                        }
                      ]}
                      onPress={() => setCategory(item.id)}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          { color: isSelected && theme.mode === 'light' ? '#ffffff' : isSelected ? '#000000' : theme.colors.textSecondary }
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}

            <FlatList
              data={filteredFiles}
              keyExtractor={(item) => item.id || item.path}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <GlassCard style={styles.fileCard} variant="interactive">
                  <View style={styles.fileRow}>
                    <View style={[styles.fileTypeBadge, { backgroundColor: theme.colors.primaryGlow, borderColor: theme.colors.primary }]}>
                      <Icon name={fileTypeIcon(item.name)} size={19} color={theme.colors.primary} strokeWidth={1.9} />
                    </View>
                    <View style={styles.fileInfo}>
                      <Text style={[styles.fileName, { color: theme.colors.text }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={[styles.fileMeta, { color: theme.colors.textSecondary }]}>
                        {formatBytes(item.size)} • {item.receivedAt ? new Date(item.receivedAt).toLocaleTimeString() : 'Just now'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.openBtn, { backgroundColor: theme.colors.primaryGlow, borderColor: theme.colors.primary }]}
                      onPress={() => handleOpenFile(item)}
                    >
                      <Icon name="eye" size={12} color={theme.colors.primary} strokeWidth={2.4} />
                      <Text style={[styles.openBtnText, { color: theme.colors.primary }]}>Open</Text>
                    </TouchableOpacity>
                  </View>
                </GlassCard>
              )}
              ListEmptyComponent={
                <EmptyState
                  title="No Received Files"
                  description="Files received from other devices on the LAN will be listed and accessible here."
                />
              }
            />
          </>
        )}
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
  header: {
    marginBottom: 12
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800'
  },
  sessionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1
  },
  sessionBadgeText: {
    fontSize: 11,
    fontWeight: '800'
  },
  headerSubtitle: {
    fontSize: 13,
    marginTop: 2
  },
  bandwidthBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12
  },
  speedIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  speedInfo: {
    flex: 1
  },
  speedLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6
  },
  speedVal: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 1
  },
  filterBar: {
    flexDirection: 'row',
    marginBottom: 12
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    marginRight: 6
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '700'
  },
  listContent: {
    flexGrow: 1
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
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
  fileCard: {
    marginBottom: 8,
    padding: 12
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  fileTypeBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12
  },
  fileInfo: {
    flex: 1
  },
  fileName: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2
  },
  fileMeta: {
    fontSize: 11
  },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginLeft: 8,
    gap: 4
  },
  openBtnText: {
    fontSize: 12,
    fontWeight: '700'
  }
});
