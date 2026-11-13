import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import GlassCard from './GlassCard';

/**
 * Peer display card for discovered devices.
 * @param {object} props
 * @param {object} props.peer - Peer information object.
 * @param {string} props.peer.deviceId - Peer unique ID.
 * @param {string} props.peer.displayName - Peer friendly name.
 * @param {string} props.peer.platform - Peer platform (android/ios/desktop/localsend).
 * @param {string} props.peer.address - Peer IP address.
 * @param {number} props.peer.port - Peer port number.
 * @param {boolean} [props.isTrusted] - Whether peer is trusted in TOFU store.
 * @param {() => void} [props.onPress] - Press handler.
 */
export default function PeerCard({ peer, isTrusted, onPress }) {
  const getPlatformLabel = (platform) => {
    switch (platform) {
      case 'android': return 'Android';
      case 'ios': return 'iOS';
      case 'desktop': return 'Desktop';
      case 'localsend':
      case 'localsend-https': return 'LocalSend';
      default: return 'Device';
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      disabled={!onPress}
      testID={`peer-card-${peer.deviceId}`}
    >
      <GlassCard style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.name} numberOfLines={1}>
            {peer.displayName || 'Unknown Peer'}
          </Text>
          <View style={styles.badgeRow}>
            {isTrusted ? (
              <View style={[styles.badge, styles.trustedBadge]}>
                <Text style={styles.badgeText}>Trusted</Text>
              </View>
            ) : null}
            <View style={[styles.badge, styles.platformBadge]}>
              <Text style={styles.badgeText}>{getPlatformLabel(peer.platform)}</Text>
            </View>
          </View>
        </View>
        <Text style={styles.address}>
          {peer.address}:{peer.port}
        </Text>
      </GlassCard>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginVertical: 6
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f8fafc',
    flex: 1,
    marginRight: 8
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 6
  },
  platformBadge: {
    backgroundColor: '#3b82f6'
  },
  trustedBadge: {
    backgroundColor: '#10b981'
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
    textTransform: 'uppercase'
  },
  address: {
    fontSize: 13,
    color: '#94a3b8'
  }
});
