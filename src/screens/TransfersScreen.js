import React from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  SafeAreaView
} from 'react-native';
import { useLocalShare } from '../engine/providers';
import TransferTile from '../components/TransferTile';
import EmptyState from '../components/EmptyState';

export default function TransfersScreen() {
  const { transfers, cancelTransfer, retryTransfer } = useLocalShare();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Active Transfers</Text>
          <Text style={styles.headerSubtitle}>
            {transfers.length} {transfers.length === 1 ? 'session' : 'sessions'}
          </Text>
        </View>

        <FlatList
          data={transfers}
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
              title="No Active Transfers"
              description="Transfers will appear here in real time with progress, speed, and resume controls."
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
  }
});
