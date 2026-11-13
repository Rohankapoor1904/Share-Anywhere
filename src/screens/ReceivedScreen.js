import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Linking,
  Alert
} from 'react-native';
import { useLocalShare } from '../engine/providers';
import GlassCard from '../components/GlassCard';
import EmptyState from '../components/EmptyState';
import { formatBytes } from '../utils/byteFormat';
import { defaultLogger } from '../utils/logger';

const logger = defaultLogger;

export default function ReceivedScreen() {
  const { receivedFiles } = useLocalShare();

  const handleOpenFile = async (file) => {
    try {
      const url = file.path.startsWith('file://') ? file.path : `file://${file.path}`;
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Cannot Open File', `No app available to open ${file.name}.`);
      }
    } catch (err) {
      logger.error('Failed to open received file:', err);
      Alert.alert('Open Error', err.message || 'Could not open file.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Received Files</Text>
          <Text style={styles.headerSubtitle}>
            Files securely transferred and verified over direct LAN.
          </Text>
        </View>

        <FlatList
          data={receivedFiles}
          keyExtractor={(item) => item.id || item.path}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <GlassCard style={styles.fileCard}>
              <View style={styles.fileInfo}>
                <Text style={styles.fileName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.fileMeta}>
                  {formatBytes(item.size)} • {item.receivedAt ? new Date(item.receivedAt).toLocaleTimeString() : 'Just now'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.openBtn}
                onPress={() => handleOpenFile(item)}
              >
                <Text style={styles.openBtnText}>Open</Text>
              </TouchableOpacity>
            </GlassCard>
          )}
          ListEmptyComponent={
            <EmptyState
              title="No Received Files"
              description="Files received from other devices on the LAN will be listed here."
            />
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a'
  },
  container: {
    flex: 1,
    padding: 16
  },
  header: {
    marginBottom: 16
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#f8fafc'
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 2
  },
  listContent: {
    flexGrow: 1
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 6
  },
  fileInfo: {
    flex: 1,
    marginRight: 12
  },
  fileName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f8fafc'
  },
  fileMeta: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2
  },
  openBtn: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8
  },
  openBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13
  }
});
