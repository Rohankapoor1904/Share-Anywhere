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
import { NativeBridge } from '../native/NativeBridge';
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
  const {
    transfers,
    receivedFiles,
    cancelTransfer,
    retryTransfer,
    clipboardHistory,
    isLiveConnected,
    connectedPeer,
    pushClipboard,
    liveClipboardEnabled,
    showToast
  } = useLocalShare();
  const { theme } = useTheme();
  const [screenTab, setScreenTab] = useState('transfers'); // 'transfers' | 'received' | 'clipboard'
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

  const handleCopyClipToPhone = async (text) => {
    try {
      await NativeBridge.setClipboardText(text);
      if (showToast) showToast('Copied to phone clipboard');
    } catch (err) {
      logger.error('Copy to clipboard failed:', err);
      Alert.alert('Clipboard Error', err.message || 'Failed to copy to clipboard.');
    }
  };

  const handlePushCurrentPhoneClip = async () => {
    try {
      const text = await NativeBridge.getClipboardText();
      if (!text) {
        Alert.alert('Empty Clipboard', 'Phone clipboard is empty.');
        return;
      }
      if (pushClipboard) {
        await pushClipboard(text);
        if (showToast) showToast('Pushed phone clipboard to PC');
      } else {
        Alert.alert('Not Connected', 'Connect to a PC first to sync clipboard.');
      }
    } catch (err) {
      logger.error('Push current clipboard failed:', err);
      Alert.alert('Clipboard Error', err.message || 'Failed to push clipboard.');
    }
  };

  const handleSendClipToPC = async (text) => {
    try {
      if (pushClipboard) {
        await pushClipboard(text);
        if (showToast) showToast('Sent clip to PC');
      } else {
        Alert.alert('Not Connected', 'Connect to a PC first to sync clipboard.');
      }
    } catch (err) {
      logger.error('Send clip failed:', err);
      Alert.alert('Clipboard Error', err.message || 'Failed to send clip.');
    }
  };

  const formatTimestamp = (ts) => {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '';
    }
  };

  return (
    <AmbientBackground>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          {/* Segmented Top Switcher (3 Tabs) */}
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

            <TouchableOpacity
              style={[
                styles.segmentedTab,
                screenTab === 'clipboard' && { backgroundColor: theme.colors.primary }
              ]}
              onPress={() => setScreenTab('clipboard')}
            >
              <Icon
                name="clipboard"
                size={14}
                color={screenTab === 'clipboard' ? (theme.mode === 'light' ? '#ffffff' : '#000000') : theme.colors.textSecondary}
                strokeWidth={2.2}
              />
              <Text
                style={[
                  styles.segmentedTabText,
                  { color: screenTab === 'clipboard' ? (theme.mode === 'light' ? '#ffffff' : '#000000') : theme.colors.textSecondary }
                ]}
              >
                Clipboard ({clipboardHistory.length})
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
          ) : screenTab === 'received' ? (
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
                    placeholder="Search received files..."
                    placeholderTextColor={theme.colors.textMuted}
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
                keyExtractor={(item) => item.sessionId || item.name}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                  <GlassCard style={styles.fileCard}>
                    <View style={styles.fileRow}>
                      <View style={[styles.fileTypeBadge, { backgroundColor: theme.colors.primaryGlow, borderColor: theme.colors.primary }]}>
                        <Icon name={fileTypeIcon(item.name)} size={18} color={theme.colors.primary} strokeWidth={2} />
                      </View>
                      <View style={styles.fileInfo}>
                        <Text style={[styles.fileName, { color: theme.colors.text }]} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={[styles.fileMeta, { color: theme.colors.textSecondary }]}>
                          {formatBytes(item.size)} • Verified SHA-256
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.openBtn, { borderColor: theme.colors.borderHighlight, backgroundColor: theme.colors.cardSolid }]}
                        onPress={() => handleOpenFile(item)}
                      >
                        <Icon name="external-link" size={13} color={theme.colors.primary} strokeWidth={2.2} />
                        <Text style={[styles.openBtnText, { color: theme.colors.primary }]}>Open</Text>
                      </TouchableOpacity>
                    </View>
                  </GlassCard>
                )}
                ListEmptyComponent={
                  <EmptyState
                    title={category === 'all' ? 'No Received Files' : `No ${category} files`}
                    description="Files accepted and saved to device will appear here."
                  />
                }
              />
            </>
          ) : (
            /* Clipboard Sync View */
            <>
              <View style={styles.header}>
                <View style={styles.headerTitleRow}>
                  <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Live Clipboard</Text>
                  <View
                    style={[
                      styles.sessionBadge,
                      {
                        backgroundColor: isLiveConnected ? theme.colors.successGlow : theme.colors.primaryGlow,
                        borderColor: isLiveConnected ? theme.colors.success : theme.colors.primary
                      }
                    ]}
                  >
                    <Text style={[styles.sessionBadgeText, { color: isLiveConnected ? theme.colors.success : theme.colors.primary }]}>
                      {isLiveConnected ? 'Live Synced' : 'Ready'}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.headerSubtitle, { color: theme.colors.textSecondary }]}>
                  {isLiveConnected && connectedPeer
                    ? `Connected to ${connectedPeer.displayName}. Mirroring: ${liveClipboardEnabled ? 'Active' : 'Paused'}.`
                    : 'Connect to your PC from the Home tab to automatically mirror clipboard text.'}
                </Text>
              </View>

              {/* Push Current Clipboard Quick Action */}
              <GlassCard style={styles.pushClipCard}>
                <View style={styles.pushClipRow}>
                  <View style={styles.pushClipInfo}>
                    <Text style={[styles.pushClipTitle, { color: theme.colors.text }]}>Push Phone Clipboard</Text>
                    <Text style={[styles.pushClipDesc, { color: theme.colors.textSecondary }]}>
                      Send current phone copied text directly to connected device.
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.pushClipBtn, { backgroundColor: theme.colors.primary }]}
                    onPress={handlePushCurrentPhoneClip}
                  >
                    <Icon name="upload" size={14} color={theme.mode === 'light' ? '#ffffff' : '#000000'} strokeWidth={2.4} />
                    <Text style={[styles.pushClipBtnText, { color: theme.mode === 'light' ? '#ffffff' : '#000000' }]}>
                      Push Now
                    </Text>
                  </TouchableOpacity>
                </View>
              </GlassCard>

              {/* Clipboard History Feed */}
              <FlatList
                data={clipboardHistory}
                keyExtractor={(item, index) => `${item.hash || ''}-${index}`}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                  <GlassCard style={styles.clipItemCard}>
                    <View style={styles.clipItemHeader}>
                      <View style={[styles.clipOriginPill, { backgroundColor: theme.colors.primaryGlow, borderColor: theme.colors.primary }]}>
                        <Icon name="clipboard" size={11} color={theme.colors.primary} strokeWidth={2.4} />
                        <Text style={[styles.clipOriginText, { color: theme.colors.primary }]}>
                          {item.sender || 'LocalShare'}
                        </Text>
                      </View>
                      <Text style={[styles.clipItemTime, { color: theme.colors.textMuted }]}>
                        {formatTimestamp(item.timestamp)}
                      </Text>
                    </View>

                    <Text style={[styles.clipItemText, { color: theme.colors.text }]} numberOfLines={4}>
                      {item.text}
                    </Text>

                    <View style={styles.clipItemActions}>
                      <TouchableOpacity
                        style={[styles.clipActionBtn, { borderColor: theme.colors.border, backgroundColor: theme.colors.cardSolid }]}
                        onPress={() => handleCopyClipToPhone(item.text)}
                      >
                        <Icon name="copy" size={12} color={theme.colors.text} strokeWidth={2.2} />
                        <Text style={[styles.clipActionBtnText, { color: theme.colors.text }]}>Copy to Phone</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.clipActionBtn, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryGlow }]}
                        onPress={() => handleSendClipToPC(item.text)}
                      >
                        <Icon name="arrow-up" size={12} color={theme.colors.primary} strokeWidth={2.2} />
                        <Text style={[styles.clipActionBtnText, { color: theme.colors.primary }]}>Send to PC</Text>
                      </TouchableOpacity>
                    </View>
                  </GlassCard>
                )}
                ListEmptyComponent={
                  <EmptyState
                    title="No Synced Clips Yet"
                    description="Copy text on your phone or PC with Live Link active to automatically stream and sync here."
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
    padding: 4,
    marginBottom: 16
  },
  segmentedTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6
  },
  segmentedTabText: {
    fontSize: 12,
    fontWeight: '700'
  },
  header: {
    marginBottom: 14
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
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16
  },
  sessionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1
  },
  sessionBadgeText: {
    fontSize: 11,
    fontWeight: '700'
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
    width: 36,
    height: 36,
    borderRadius: 10,
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
    letterSpacing: 0.5
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
    flexGrow: 1,
    paddingBottom: 40
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
  },
  pushClipCard: {
    marginBottom: 12,
    padding: 12
  },
  pushClipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  pushClipInfo: {
    flex: 1,
    marginRight: 12
  },
  pushClipTitle: {
    fontSize: 13,
    fontWeight: '700'
  },
  pushClipDesc: {
    fontSize: 11,
    marginTop: 2
  },
  pushClipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6
  },
  pushClipBtnText: {
    fontSize: 12,
    fontWeight: '800'
  },
  clipItemCard: {
    marginBottom: 10,
    padding: 12
  },
  clipItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  clipOriginPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    gap: 4
  },
  clipOriginText: {
    fontSize: 10,
    fontWeight: '700'
  },
  clipItemTime: {
    fontSize: 10
  },
  clipItemText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'monospace',
    marginBottom: 10
  },
  clipItemActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8
  },
  clipActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4
  },
  clipActionBtnText: {
    fontSize: 11,
    fontWeight: '700'
  }
});
