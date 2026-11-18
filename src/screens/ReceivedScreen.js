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
import GlassCard from '../components/GlassCard';
import EmptyState from '../components/EmptyState';
import { formatBytes } from '../utils/byteFormat';
import { defaultLogger } from '../utils/logger';

const logger = defaultLogger;

export default function ReceivedScreen() {
  const { receivedFiles } = useLocalShare();
  const { theme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState('all');

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

  const getFileGlyph = (name) => {
    const cat = getFileCategory(name);
    switch (cat) {
      case 'media': return '🎬';
      case 'archive': return '📦';
      case 'doc': return '📄';
      default: return '📁';
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
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Received Files</Text>
            <View style={[styles.countBadge, { backgroundColor: theme.colors.primaryGlow, borderColor: theme.colors.primary }]}>
              <Text style={[styles.countBadgeText, { color: theme.colors.primary }]}>
                {receivedFiles.length} {receivedFiles.length === 1 ? 'file' : 'files'}
              </Text>
            </View>
          </View>
          <Text style={[styles.headerSubtitle, { color: theme.colors.textSecondary }]}>
            Files securely transferred and SHA-256 verified over direct LAN.
          </Text>
        </View>

        {/* Search bar when files exist */}
        {receivedFiles.length > 2 ? (
          <View style={[styles.searchBox, { backgroundColor: theme.colors.inputBg, borderColor: theme.colors.border }]}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={[styles.searchInput, { color: theme.colors.text }]}
              placeholder="Search received files..." // justified: TextInput hint
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

        {/* Categories Bar */}
        {receivedFiles.length > 0 ? (
          <View style={styles.categoryBar}>
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
                    styles.categoryChip,
                    {
                      backgroundColor: isSelected ? theme.colors.primary : theme.colors.cardSolid,
                      borderColor: isSelected ? theme.colors.primary : theme.colors.border
                    }
                  ]}
                  onPress={() => setCategory(item.id)}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
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
                <Text style={styles.fileGlyph}>{getFileGlyph(item.name)}</Text>
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
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '800'
  },
  headerSubtitle: {
    fontSize: 13,
    marginTop: 2
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10
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
  categoryBar: {
    flexDirection: 'row',
    marginBottom: 12
  },
  categoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    marginRight: 6
  },
  categoryChipText: {
    fontSize: 11,
    fontWeight: '700'
  },
  listContent: {
    flexGrow: 1
  },
  fileCard: {
    marginVertical: 5
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  fileGlyph: {
    fontSize: 22,
    marginRight: 12
  },
  fileInfo: {
    flex: 1,
    marginRight: 10
  },
  fileName: {
    fontSize: 15,
    fontWeight: '700'
  },
  fileMeta: {
    fontSize: 12,
    marginTop: 2
  },
  openBtn: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8
  },
  openBtnText: {
    fontSize: 12,
    fontWeight: '800'
  }
});
