import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView
} from 'react-native';
import { useLocalShare } from '../engine/providers';
import RadarView from '../components/RadarView';
import GlassCard from '../components/GlassCard';

export default function RadarScreen({ navigation }) {
  const { peers, isDiscovering, startDiscovery, stopDiscovery } = useLocalShare();
  const [radarActive, setRadarActive] = useState(true);

  const handleSelectPeer = (peer) => {
    navigation.navigate('ShareHub', { targetPeer: peer });
  };

  const getPositionForPeer = (index, total) => {
    const angle = (index / Math.max(1, total)) * 2 * Math.PI - Math.PI / 2;
    const radius = 80;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    return { x, y };
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Radar Discovery</Text>
          <Text style={styles.headerSubtitle}>
            Visualizing nearby peers broadcasting on your local network.
          </Text>
        </View>

        {/* Radar View Container */}
        <View style={styles.radarWrapper}>
          <RadarView active={radarActive && isDiscovering} size={280}>
            {peers.map((peer, idx) => {
              const pos = getPositionForPeer(idx, peers.length);
              return (
                <TouchableOpacity
                  key={peer.deviceId}
                  style={[
                    styles.peerNode,
                    { transform: [{ translateX: pos.x }, { translateY: pos.y }] }
                  ]}
                  onPress={() => handleSelectPeer(peer)}
                >
                  <View style={styles.peerDot} />
                  <Text style={styles.peerNodeLabel} numberOfLines={1}>
                    {peer.displayName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </RadarView>
        </View>

        {/* Discovery Summary Card */}
        <GlassCard style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View>
              <Text style={styles.summaryTitle}>Active Network Radar</Text>
              <Text style={styles.summaryDesc}>
                {peers.length} {peers.length === 1 ? 'peer detected' : 'peers detected'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.toggleBtn, isDiscovering ? styles.activeBtn : styles.idleBtn]}
              onPress={() => {
                if (isDiscovering) {
                  stopDiscovery();
                  setRadarActive(false);
                } else {
                  startDiscovery();
                  setRadarActive(true);
                }
              }}
            >
              <Text style={styles.toggleBtnText}>
                {isDiscovering ? 'Pause Radar' : 'Resume Radar'}
              </Text>
            </TouchableOpacity>
          </View>
        </GlassCard>
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
    padding: 16,
    justifyContent: 'space-between'
  },
  header: {
    marginBottom: 8
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
  radarWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  peerNode: {
    position: 'absolute',
    alignItems: 'center',
    width: 80,
    marginLeft: -40,
    marginTop: -40
  },
  peerDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#38bdf8',
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6
  },
  peerNodeLabel: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6
  },
  summaryCard: {
    marginTop: 16
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc'
  },
  summaryDesc: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 2
  },
  toggleBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8
  },
  activeBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: '#ef4444'
  },
  idleBtn: {
    backgroundColor: '#3b82f6'
  },
  toggleBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600'
  }
});
