import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView
} from 'react-native';
import { useLocalShare } from '../engine/providers';
import { useTheme } from '../theme';
import TransferTile from '../components/TransferTile';
import EmptyState from '../components/EmptyState';
import { formatSpeed } from '../utils/byteFormat';

export default function TransfersScreen() {
  const { transfers, cancelTransfer, retryTransfer } = useLocalShare();
  const { theme } = useTheme();
  const [filter, setFilter] = useState('all');

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

  const activeTransfers = transfers.filter((t) => t.status === 'in_progress');
  const aggregateSpeed = activeTransfers.reduce((acc, t) => acc + (t.speed || 0), 0);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <View style={styles.container}>
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
            <Text style={styles.speedIcon}>⚡</Text>
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
  speedIcon: {
    fontSize: 20,
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
  }
});
