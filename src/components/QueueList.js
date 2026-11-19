import React from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import GlassCard from './GlassCard';
import Icon from './Icon';
import { fileTypeIcon } from './iconPaths';
import { formatBytes } from '../utils/byteFormat';
import { useTheme } from '../theme';

/**
 * Renders staged files selected for sending with themed file chips and remove actions.
 * @param {object} props
 * @param {Array<{ id: string, name: string, size: number, path: string }>} props.files
 * @param {(id: string) => void} props.onRemove
 */
export default function QueueList({ files, onRemove }) {
  const { theme } = useTheme();

  if (!files || files.length === 0) {
    return null;
  }

  const totalSize = files.reduce((acc, f) => acc + (f.size || 0), 0);

  return (
    <GlassCard style={styles.card} variant="interactive">
      <View style={styles.headerRow}>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
          Staged Files ({files.length})
        </Text>
        <View style={[styles.totalPill, { backgroundColor: theme.colors.primaryGlow, borderColor: theme.colors.primary }]}>
          <Text style={[styles.totalSize, { color: theme.colors.primary }]}>
            {formatBytes(totalSize)}
          </Text>
        </View>
      </View>

      <FlatList
        data={files}
        keyExtractor={(item) => item.id || item.path || item.name}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <View style={[styles.fileRow, { borderBottomColor: theme.colors.border }]}>
            <View style={styles.fileGlyph}>
              <Icon name={fileTypeIcon(item.name)} size={19} color={theme.colors.primary} strokeWidth={1.9} />
            </View>
            <View style={styles.fileInfo}>
              <Text style={[styles.fileName, { color: theme.colors.text }]} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={[styles.fileSize, { color: theme.colors.textSecondary }]}>
                {formatBytes(item.size || 0)}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.removeBtn, { backgroundColor: theme.colors.dangerGlow }]}
              onPress={() => onRemove(item.id || item.path)}
              accessibilityLabel={`Remove ${item.name}`}
            >
              <Icon name="close" size={13} color={theme.colors.danger} strokeWidth={2.8} />
            </TouchableOpacity>
          </View>
        )}
      />
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginVertical: 10
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '800'
  },
  totalPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1
  },
  totalSize: {
    fontSize: 12,
    fontWeight: '800'
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1
  },
  fileGlyph: {
    width: 22,
    alignItems: 'center',
    marginRight: 10
  },
  fileInfo: {
    flex: 1,
    marginRight: 10
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600'
  },
  fileSize: {
    fontSize: 12,
    marginTop: 2
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
});
