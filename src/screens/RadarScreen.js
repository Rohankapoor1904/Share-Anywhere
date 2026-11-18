import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView
} from 'react-native';
import { useLocalShare } from '../engine/providers';
import { useTheme } from '../theme';
import RadarView from '../components/RadarView';
import GlassCard from '../components/GlassCard';

export default function RadarScreen({ navigation }) {
  const { peers, isDiscovering, startDiscovery, stopDiscovery } = useLocalShare();
  const { theme } = useTheme();
  const [radarActive, setRadarActive] = useState(true);

  const handleSelectPeer = (peer) => {
    navigation.navigate('ShareHub', { targetPeer: peer });
  };

  const getPositionForPeer = (index, total) => {
    const angle = (index / Math.max(1, total)) * 2 * Math.PI - Math.PI / 2;
    const radius = 90;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    return { x, y };
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Radar Discovery</Text>
          <Text style={[styles.headerSubtitle, { color: theme.colors.textSecondary }]}>
            Visualizing nearby peers broadcasting on your local Wi-Fi subnet.
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
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.peerDot,
                      {
                        backgroundColor: theme.colors.primary,
                        shadowColor: theme.colors.primary,
                        borderColor: '#ffffff'
                      }
                    ]}
                  />
                  <Text
                    style={[
                      styles.peerNodeLabel,
                      {
                        color: theme.colors.text,
                        backgroundColor: theme.colors.cardSolid,
                        borderColor: theme.colors.borderHighlight
                      }
                    ]}
                    numberOfLines={1}
                  >
                    {peer.displayName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </RadarView>
        </View>

        {/* Discovery Summary Card */}
        <GlassCard style={styles.summaryCard} variant="interactive">
          <View style={styles.summaryRow}>
            <View>
              <Text style={[styles.summaryTitle, { color: theme.colors.text }]}>
                {isDiscovering ? 'Scanning Subnet...' : 'Radar Standby'}
              </Text>
              <Text style={[styles.summaryDesc, { color: theme.colors.textSecondary }]}>
                {peers.length} {peers.length === 1 ? 'peer detected' : 'peers detected'} in range
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.toggleBtn,
                isDiscovering
                  ? { backgroundColor: theme.colors.dangerGlow, borderColor: theme.colors.danger, borderWidth: 1 }
                  : { backgroundColor: theme.colors.primary }
              ]}
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
              <Text
                style={[
                  styles.toggleBtnText,
                  {
                    color: isDiscovering
                      ? theme.colors.danger
                      : theme.mode === 'light'
                      ? '#ffffff'
                      : '#000000'
                  }
                ]}
              >
                {isDiscovering ? 'Pause Sweep' : 'Start Sweep'}
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
    flex: 1
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
    fontWeight: '800'
  },
  headerSubtitle: {
    fontSize: 13,
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
    width: 90,
    marginLeft: -45,
    marginTop: -45
  },
  peerDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6
  },
  peerNodeLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 5,
    textAlign: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1
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
    fontWeight: '800'
  },
  summaryDesc: {
    fontSize: 13,
    marginTop: 2
  },
  toggleBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10
  },
  toggleBtnText: {
    fontSize: 13,
    fontWeight: '800'
  }
});
