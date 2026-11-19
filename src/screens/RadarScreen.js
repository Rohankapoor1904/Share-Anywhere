import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  SafeAreaView
} from 'react-native';
import { useLocalShare } from '../engine/providers';
import { useTheme } from '../theme';
import RadarView from '../components/RadarView';
import GlassCard from '../components/GlassCard';
import Icon from '../components/Icon';
import AmbientBackground from '../components/AmbientBackground';

const AnimatedView = /** @type {any} */ (Animated.View);

/**
 * Platform -> vector icon name for radar blips.
 * @param {string} platform
 * @returns {string}
 */
function platformIcon(platform) {
  switch (platform) {
    case 'android': return 'android';
    case 'ios': return 'ios';
    case 'desktop': return 'desktop';
    case 'localsend':
    case 'localsend-https': return 'localsend';
    default: return 'devices';
  }
}

/**
 * Radar blip: floating glass pill with a pulsing aura, platform icon and IP badge.
 * @param {object} props
 * @param {object} props.peer
 * @param {{x: number, y: number}} props.position
 * @param {() => void} props.onPress
 */
export function PeerBlip({ peer, position, onPress }) {
  const { theme } = useTheme();
  const aura = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(aura, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(aura, { toValue: 0, duration: 1400, useNativeDriver: true })
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [aura]);

  return (
    <TouchableOpacity
      style={[styles.peerNode, { transform: [{ translateX: position.x }, { translateY: position.y }] }]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`Open ${peer.displayName || 'peer'}`}
    >
      <View style={styles.blipIconWrapper}>
        <AnimatedView
          pointerEvents="none"
          style={[
            styles.blipAura,
            {
              backgroundColor: theme.colors.primaryGlow,
              borderColor: theme.colors.primary,
              opacity: aura.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0.15] }),
              transform: [{ scale: aura.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }]
            }
          ]}
        />
        <View style={[styles.blipIcon, { backgroundColor: theme.colors.primaryGlow, borderColor: theme.colors.primary }]}>
          <Icon name={platformIcon(peer.platform)} size={17} color={theme.colors.primary} strokeWidth={1.9} />
        </View>
      </View>

      <View style={[styles.blipPill, { backgroundColor: theme.colors.cardSolid, borderColor: theme.colors.borderHighlight }]}>
        <Text style={[styles.blipName, { color: theme.colors.text }]} numberOfLines={1}>
          {peer.displayName || 'Peer'}
        </Text>
        <Text style={[styles.blipIp, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {peer.address}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export const getPositionForPeer = (index, total) => {
  const angle = (index / Math.max(1, total)) * 2 * Math.PI - Math.PI / 2;
  const radius = 92;
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius;
  return { x, y };
};

/**
 * @param {object} props
 * @param {{navigate: Function}} props.navigation
 */
export default function RadarScreen({ navigation }) {
  const { peers, isDiscovering, startDiscovery, stopDiscovery } = useLocalShare();
  const { theme } = useTheme();
  const [radarActive, setRadarActive] = useState(true);

  useEffect(() => {
    startDiscovery();
  }, [startDiscovery]);

  const handleSelectPeer = (peer) => {
    navigation.navigate('ShareHub', { targetPeer: peer });
  };

  const getPositionForPeer = (index, total) => {
    const angle = (index / Math.max(1, total)) * 2 * Math.PI - Math.PI / 2;
    const radius = 92;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    return { x, y };
  };

  return (
    <AmbientBackground intense>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Radar Discovery</Text>
            <Text style={[styles.headerSubtitle, { color: theme.colors.textSecondary }]}>
              Live sonar sweep across your local Wi-Fi subnet.
            </Text>
          </View>

          <View style={styles.radarWrapper}>
            <RadarView active={radarActive && isDiscovering} size={288}>
              {peers.map((peer, idx) => (
                <PeerBlip
                  key={peer.deviceId}
                  peer={peer}
                  position={getPositionForPeer(idx, peers.length)}
                  onPress={() => handleSelectPeer(peer)}
                />
              ))}
            </RadarView>
          </View>

          <GlassCard style={styles.summaryCard} variant="interactive">
            <View style={styles.summaryRow}>
              <View style={styles.summaryInfo}>
                <View style={styles.summaryTitleRow}>
                  <Icon
                    name={isDiscovering ? 'wifi' : 'pause'}
                    size={15}
                    color={isDiscovering ? theme.colors.primary : theme.colors.textMuted}
                    strokeWidth={2.2}
                  />
                  <Text style={[styles.summaryTitle, { color: theme.colors.text }]}>
                    {isDiscovering ? 'Scanning Subnet' : 'Radar Standby'}
                  </Text>
                </View>
                <Text style={[styles.summaryDesc, { color: theme.colors.textSecondary }]}>
                  {peers.length} {peers.length === 1 ? 'peer detected' : 'peers detected'} in range
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.toggleBtn,
                  isDiscovering
                    ? { backgroundColor: theme.colors.dangerGlow, borderColor: theme.colors.danger, borderWidth: 1 }
                    : { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary, borderWidth: 1 }
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
                <Icon
                  name={isDiscovering ? 'pause' : 'play'}
                  size={13}
                  color={isDiscovering ? theme.colors.danger : theme.mode === 'light' ? '#ffffff' : '#000000'}
                  strokeWidth={2.4}
                />
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
    </AmbientBackground>
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
    width: 96,
    marginLeft: -48,
    marginTop: -20
  },
  blipIconWrapper: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center'
  },
  blipAura: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1
  },
  blipIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center'
  },
  blipPill: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    maxWidth: 96
  },
  blipName: {
    fontSize: 10,
    fontWeight: '800'
  },
  blipIp: {
    fontSize: 8,
    fontWeight: '600',
    marginTop: 1
  },
  summaryCard: {
    marginTop: 16
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  summaryInfo: {
    flex: 1,
    marginRight: 10
  },
  summaryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginLeft: 7
  },
  summaryDesc: {
    fontSize: 13,
    marginTop: 3
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 10
  },
  toggleBtnText: {
    fontSize: 13,
    fontWeight: '800',
    marginLeft: 6
  }
});
