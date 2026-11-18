import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import GlassCard from './GlassCard';
import { useTheme } from '../theme';

/**
 * Peer display card for discovered devices with platform avatar and trust badges.
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
  const { theme } = useTheme();

  const getPlatformMeta = (platform) => {
    switch (platform) {
      case 'android':
        return { label: 'Android', glyph: '🤖' };
      case 'ios':
        return { label: 'iOS', glyph: '🍏' };
      case 'desktop':
        return { label: 'Desktop', glyph: '💻' };
      case 'localsend':
      case 'localsend-https':
        return { label: 'LocalSend', glyph: '⚡' };
      default:
        return { label: 'Device', glyph: '📱' };
    }
  };

  const meta = getPlatformMeta(peer.platform);
  const initials = (peer.displayName || 'P').slice(0, 2).toUpperCase();

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      disabled={!onPress}
      testID={`peer-card-${peer.deviceId}`}
    >
      <GlassCard
        style={[
          styles.card,
          isTrusted ? { borderColor: theme.colors.borderHighlight } : null
        ]}
        variant={isTrusted ? 'highlighted' : 'default'}
      >
        <View style={styles.cardContent}>
          {/* Avatar Icon */}
          <View
            style={[
              styles.avatarContainer,
              {
                backgroundColor: theme.colors.primaryGlow,
                borderColor: theme.colors.primary
              }
            ]}
          >
            <Text style={[styles.avatarText, { color: theme.colors.primary }]}>
              {initials}
            </Text>
          </View>

          {/* Peer Details */}
          <View style={styles.infoCol}>
            <View style={styles.headerRow}>
              <Text
                style={[styles.name, { color: theme.colors.text }]}
                numberOfLines={1}
              >
                {peer.displayName || 'Unknown Peer'}
              </Text>
              <View style={styles.badgeRow}>
                {isTrusted ? (
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor: theme.colors.successGlow,
                        borderColor: theme.colors.success
                      }
                    ]}
                  >
                    <Text style={[styles.badgeText, { color: theme.colors.success }]}>
                      🔒 Trusted
                    </Text>
                  </View>
                ) : null}
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: theme.colors.primaryGlow,
                      borderColor: theme.colors.primary
                    }
                  ]}
                >
                  <Text style={[styles.badgeText, { color: theme.colors.primary }]}>
                    {meta.glyph} {meta.label}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.footerRow}>
              <Text style={[styles.address, { color: theme.colors.textSecondary }]}>
                {peer.address}:{peer.port}
              </Text>
              <Text style={[styles.arrowHint, { color: theme.colors.primary }]}>
                Send Files →
              </Text>
            </View>
          </View>
        </View>
      </GlassCard>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginVertical: 6
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '800'
  },
  infoCol: {
    flex: 1
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginRight: 8
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    marginLeft: 6
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2
  },
  address: {
    fontSize: 12,
    fontWeight: '500'
  },
  arrowHint: {
    fontSize: 12,
    fontWeight: '700'
  }
});
