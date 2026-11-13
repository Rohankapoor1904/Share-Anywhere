import React from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import GlassCard from './GlassCard';
import { formatBytes } from '../utils/byteFormat';

/**
 * Renders staged files selected for sending.
 * @param {object} props
 * @param {Array<{ id: string, name: string, size: number, path: string }>} props.files
 * @param {(id: string) => void} props.onRemove
 */
export default function QueueList({ files, onRemove }) {
  if (!files || files.length === 0) {
    return null;
  }

  const totalSize = files.reduce((acc, f) => acc + (f.size || 0), 0);

  return (
    <GlassCard style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Staged Files ({files.length})</Text>
        <Text style={styles.totalSize}>{formatBytes(totalSize)}</Text>
      </View>

      <FlatList
        data={files}
        keyExtractor={(item) => item.id || item.path || item.name}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <View style={styles.fileRow}>
            <View style={styles.fileInfo}>
              <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.fileSize}>{formatBytes(item.size || 0)}</Text>
            </View>
            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => onRemove(item.id || item.path)}
            >
              <Text style={styles.removeBtnText}>✕</Text>
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
    fontWeight: '700',
    color: '#f8fafc'
  },
  totalSize: {
    fontSize: 13,
    color: '#38bdf8',
    fontWeight: '600'
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)'
  },
  fileInfo: {
    flex: 1,
    marginRight: 10
  },
  fileName: {
    fontSize: 14,
    color: '#e2e8f0',
    fontWeight: '500'
  },
  fileSize: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2
  },
  removeBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.15)'
  },
  removeBtnText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '700'
  }
});
