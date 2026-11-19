import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, TouchableOpacity, StyleSheet } from 'react-native';
import GlassCard from './GlassCard';
import Icon from './Icon';
import { useTheme } from '../theme';

const AnimatedView = /** @type {any} */ (Animated.View);

/**
 * Platform metadata: vector icon name plus friendly label.
 * @param {string} platform
 * @returns {{ label: string, icon: string }}
 */
function getPlatformMeta(platform) {
  switch (platform) {
    case 'android':
      return { label: 'Android', icon: 'android' };
    case 'ios':
      return { label: 'iOS', icon: 'ios' };
    case 'desktop':
      return { label: 'Desktop', icon: 'desktop' };
    case 'localsend':
    case 'localsend-https':
      return { label: 'LocalSend', icon: 'localsend' };
    default:
      return { label: 'Device', icon: 'devices' };
  }
}

/**
 * Map a discovery channel to its short badge label.
 * @param {object} peer
 * @returns {string}
 */
function getChannelBadge(peer) {
  const channel = String(peer.discoveryChannel || peer.channel || '').toLowerCase();
  if (channel.includes('ble') || channel.includes('bluetooth')) return 'BLE';
  if (channel.includes('mdns') || channel.includes('bonjour') || channel.includes('zeroconf')) return 'mDNS';
  if (channel.includes('manual')) return 'MANUAL';
  if (channel.includes('localsend') || channel.includes('udp') || channel.includes('lan') || channel.includes('probe')) return 'LAN';
  return 'LAN';
}

/**
 * Live-pulsing presence indicator for a discovered peer.
 */
function PresenceDot() {
  const { theme } = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, useNativeDriver: true })
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    <View style={styles.presenceWrapper}>
      <AnimatedView
        style={[
          styles.presenceHalo,
          {
            backgroundColor: theme.colors.success,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }]
          }
        ]}
      />
      <View style={[styles.presenceDot, { backgroundColor: theme.colors.success }]} />
    </View>
  );
}

/**
 * Peer display card: dual-layer platform avatar, live presence, metadata and
 * quick actions.
 * @param {object} props
 * @param {object} props.peer - Peer information object.
 * @param {string} props.peer.deviceId - Peer unique ID.
 * @param {string} props.peer.displayName - Peer friendly name.
 * @param {string} props.peer.platform - Peer platform (android/ios/desktop/localsend).
 * @param {string} props.peer.address - Peer IP address.
 * @param {number} props.peer.port - Peer port number.
 * @param {boolean} [props.isTrusted] - Whether peer is trusted in TOFU store.
 * @param {boolean} [props.isLiveConnected] - Whether a live bi-directional session is active.
 * @param {() => void} [props.onPress] - Press handler (send files).
 * @param {() => void} [props.onBrowseFiles] - Handler to open the remote file explorer.
 * @param {() => void} [props.onConnect] - Handler to establish or drop live connection.
 */
export default function PeerCard({ peer, isTrusted, isLiveConnected, onPress, onBrowseFiles, onConnect }) {
  const { theme } = useTheme();
  const meta = getPlatformMeta(peer.platform);
  const channel = getChannelBadge(peer);

  return (
    <TouchableOpacity
      testID={`peer-card-${peer.deviceId}`}
      activeOpacity={0.75}
      onPress={onPress}
      disabled={!onPress}
    >
      <GlassCard
        style={[styles.card, (isTrusted || isLiveConnected) ? { borderColor: isLiveConnected ? theme.colors.success : theme.colors.borderHighlight } : null]}
        variant={isLiveConnected ? 'highlighted' : (isTrusted ? 'highlighted' : 'default')}
      >
        <View style={styles.cardContent}>
          {/* Dual-layer avatar: glowing ring + inner tinted disc */}
          <View
            style={[
              styles.avatarOuter,
              {
                borderColor: isLiveConnected ? theme.colors.success : theme.colors.primary,
                backgroundColor: isLiveConnected ? theme.colors.successGlow : theme.colors.primaryGlow
              }
            ]}
          >
            <View style={[styles.avatarInner, { backgroundColor: theme.colors.cardSolid }]}>
              <Icon name={meta.icon} size={21} color={isLiveConnected ? theme.colors.success : theme.colors.primary} />
            </View>
            <PresenceDot />
          </View>

          {/* Peer details */}
          <View style={styles.infoCol}>
            <View style={styles.headerRow}>
              <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
                {peer.displayName || 'Unknown Peer'}
              </Text>
              {isLiveConnected ? (
                <View
                  style={[
                    styles.trustBadge,
                    { backgroundColor: theme.colors.successGlow, borderColor: theme.colors.success }
                  ]}
                >
                  <Icon name="link" size={11} color={theme.colors.success} strokeWidth={2.4} />
                  <Text style={[styles.trustBadgeText, { color: theme.colors.success }]}>Live</Text>
                </View>
              ) : isTrusted ? (
                <View
                  style={[
                    styles.trustBadge,
                    { backgroundColor: theme.colors.successGlow, borderColor: theme.colors.success }
                  ]}
                >
                  <Icon name="shield" size={11} color={theme.colors.success} strokeWidth={2.4} />
                  <Text style={[styles.trustBadgeText, { color: theme.colors.success }]}>Trusted</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.metaRow}>
              <Text style={[styles.address, { color: theme.colors.textSecondary }]}>
                {peer.address}:{peer.port}
              </Text>
              <View style={[styles.channelBadge, { backgroundColor: theme.colors.cardSolid, borderColor: theme.colors.border }]}>
                <Text style={[styles.channelText, { color: theme.colors.textSecondary }]}>{channel}</Text>
              </View>
              <View style={[styles.channelBadge, { backgroundColor: theme.colors.primaryGlow, borderColor: theme.colors.primary }]}>
                <Text style={[styles.channelText, { color: theme.colors.primary }]}>{meta.label}</Text>
              </View>
            </View>

            <View style={styles.actionRow}>
              {onConnect ? (
                <TouchableOpacity
                  style={[
                    styles.actionPill,
                    isLiveConnected
                      ? { backgroundColor: theme.colors.successGlow, borderColor: theme.colors.success }
                      : { backgroundColor: theme.colors.cardSolid, borderColor: theme.colors.border }
                  ]}
                  onPress={onConnect}
                  accessibilityRole="button"
                  accessibilityLabel={isLiveConnected ? 'Disconnect live link' : `Connect live link with ${peer.displayName || 'peer'}`}
                >
                  <Icon name="link" size={13} color={isLiveConnected ? theme.colors.success : theme.colors.textSecondary} strokeWidth={2.2} />
                  <Text style={[styles.actionText, { color: isLiveConnected ? theme.colors.success : theme.colors.textSecondary }]}>
                    {isLiveConnected ? 'Connected' : 'Connect'}
                  </Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[
                  styles.actionPill,
                  { backgroundColor: theme.colors.primaryGlow, borderColor: theme.colors.primary }
                ]}
                onPress={onPress}
                disabled={!onPress}
                accessibilityRole="button"
                accessibilityLabel={`Send files to ${peer.displayName || 'peer'}`}
              >
                <Icon name="share" size={13} color={theme.colors.primary} strokeWidth={2.2} />
                <Text style={[styles.actionText, { color: theme.colors.primary }]}>Send</Text>
              </TouchableOpacity>
              {onBrowseFiles ? (
                <TouchableOpacity
                  style={[
                    styles.actionPill,
                    { backgroundColor: theme.colors.cardSolid, borderColor: theme.colors.borderHighlight }
                  ]}
                  onPress={onBrowseFiles}
                  testID={`peer-browse-${peer.deviceId}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Browse files on ${peer.displayName || 'peer'}`}
                >
                  <Icon name="files" size={13} color={theme.colors.accent} strokeWidth={2.2} />
                  <Text style={[styles.actionText, { color: theme.colors.accent }]}>Files</Text>
                </TouchableOpacity>
              ) : null}
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
  avatarOuter: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14
  },
  avatarInner: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center'
  },
  presenceWrapper: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  presenceHalo: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6
  },
  presenceDot: {
    width: 11,
    height: 11,
    borderRadius: 5.5,
    borderWidth: 2,
    borderColor: '#00000000'
  },
  infoCol: {
    flex: 1
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginRight: 8
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1
  },
  trustBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginLeft: 4
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 8
  },
  address: {
    fontSize: 12,
    fontWeight: '500',
    marginRight: 8
  },
  channelBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    marginRight: 6,
    marginTop: 2
  },
  channelText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase'
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 8
  },
  actionText: {
    fontSize: 11,
    fontWeight: '800',
    marginLeft: 5,
    letterSpacing: 0.2
  }
});
