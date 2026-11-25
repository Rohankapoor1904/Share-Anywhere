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
import Icon from '../components/Icon';
import AmbientBackground from '../components/AmbientBackground';
import { fileTypeIcon } from '../components/iconPaths';
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
    <AmbientBackground>
      <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Received Files</Text>
            <View style={[styles.countBadge, { backgroundColor: theme.colors.primaryGlow, borderColor: 'transparent' }]}>
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
                <View style={[styles.fileTypeBadge, { backgroundColor: theme.colors.primaryGlow, borderColor: 'transparent' }]}>
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
                  style={[styles.openBtn, { backgroundColor: theme.colors.primaryGlow, borderColor: 'transparent' }]}
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
    fontWeight: '700'
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '700'
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
    marginRight: 8
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0
  },
  clearSearch: {
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
  fileTypeBadge: {
    width: 40,
    height: 40,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8
  },
  openBtnText: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 5
  }
});
