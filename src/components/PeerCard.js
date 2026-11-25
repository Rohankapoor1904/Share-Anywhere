import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from './Icon';
import { useTheme } from '../theme';

/**
 * Platform metadata: vector icon name plus friendly label.
 * @param {string} platform
 * @returns {{ label: string, icon: string, localsend: boolean }}
 */
function getPlatformMeta(platform) {
  switch (platform) {
    case 'android':
      return { label: 'Android', icon: 'android', localsend: false };
    case 'ios':
      return { label: 'iPhone', icon: 'ios', localsend: false };
    case 'desktop':
      return { label: 'Computer', icon: 'desktop', localsend: false };
    case 'localsend':
    case 'localsend-https':
      return { label: 'LocalSend', icon: 'localsend', localsend: true };
    default:
      return { label: 'Device', icon: 'devices', localsend: false };
  }
}

/**
 * One device row in a grouped list. Tapping the row sends files; the trailing
 * pill connects (or opens files once connected).
 * @param {object} props
 * @param {object} props.peer - Peer information object.
 * @param {string} props.peer.deviceId - Peer unique ID.
 * @param {string} props.peer.displayName - Peer friendly name.
 * @param {string} props.peer.platform - Peer platform (android/ios/desktop/localsend).
 * @param {string} props.peer.address - Peer IP address.
 * @param {number} props.peer.port - Peer port number.
 * @param {string} [props.peer.transport] - 'lan' or 'nearby' (reachable without shared Wi-Fi).
 * @param {string} [props.peer.nearbyBandwidth] - '' | 'LOW' | 'HIGH' measured over Nearby.
 * @param {boolean} [props.isTrusted] - Whether peer is trusted in TOFU store.
 * @param {boolean} [props.isLiveConnected] - Whether a live bi-directional session is active.
 * @param {() => void} [props.onPress] - Press handler (send files).
 * @param {() => void} [props.onBrowseFiles] - Opens the remote file explorer (shown once connected).
 * @param {() => void} [props.onConnect] - Establishes or drops the live connection.
 * @param {'single' | 'first' | 'middle' | 'last'} [props.position='single'] - Place in the group.
 */
export default function PeerCard({
  peer,
  isTrusted,
  isLiveConnected,
  onPress,
  onBrowseFiles,
  onConnect,
  position = 'single'
}) {
  const { theme } = useTheme();
  const meta = getPlatformMeta(peer.platform);
  const name = peer.displayName || 'Unknown device';
  const isFirst = position === 'single' || position === 'first';
  const isLast = position === 'single' || position === 'last';

  // Nearby-only peers are reachable over Bluetooth / Wi-Fi Direct without a shared network.
  const nearbyOnly = peer.transport === 'nearby';
  const slowLink = nearbyOnly && peer.nearbyBandwidth === 'LOW';

  let status = meta.label;
  if (isLiveConnected) status = `${meta.label} · Connected`;
  else if (nearbyOnly) status = `${meta.label} · No Wi-Fi needed`;
  else if (isTrusted) status = `${meta.label} · Trusted`;

  // Browsing needs a paired connection, so "Files" only appears once connected.
  // The live link runs over HTTP, so Nearby-only peers offer sending but not Connect.
  let trailing = null;
  if (isLiveConnected && onBrowseFiles) {
    trailing = { label: 'Files', onPress: onBrowseFiles, testID: `peer-browse-${peer.deviceId}`, a11y: `Browse files on ${name}` };
  } else if (onConnect && !meta.localsend && !nearbyOnly) {
    trailing = { label: 'Connect', onPress: onConnect, testID: `peer-connect-${peer.deviceId}`, a11y: `Connect to ${name}` };
  }

  return (
    <TouchableOpacity
      testID={`peer-card-${peer.deviceId}`}
      activeOpacity={0.6}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`Send files to ${name}, ${status}`}
      style={[
        styles.row,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          borderTopWidth: isFirst ? StyleSheet.hairlineWidth : 0,
          borderBottomWidth: isLast ? StyleSheet.hairlineWidth : 0,
          borderTopLeftRadius: isFirst ? 16 : 0,
          borderTopRightRadius: isFirst ? 16 : 0,
          borderBottomLeftRadius: isLast ? 16 : 0,
          borderBottomRightRadius: isLast ? 16 : 0
        }
      ]}
    >
      {!isFirst ? <View style={[styles.separator, { backgroundColor: theme.colors.border }]} /> : null}

      <View style={[styles.tile, { backgroundColor: isLiveConnected ? theme.colors.successGlow : theme.colors.fill }]}>
        <Icon
          name={meta.icon}
          size={19}
          color={isLiveConnected ? theme.colors.success : theme.colors.textSecondary}
          strokeWidth={1.9}
        />
      </View>

      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
            {name}
          </Text>
          {isTrusted && !isLiveConnected ? (
            <Icon name="shield" size={13} color={theme.colors.textMuted} strokeWidth={2} />
          ) : null}
          {slowLink ? (
            <View
              testID={`peer-slow-${peer.deviceId}`}
              style={[styles.badge, { backgroundColor: theme.colors.warningGlow }]}
            >
              <Text style={[styles.badgeText, { color: theme.colors.warning }]}>Slow</Text>
            </View>
          ) : null}
        </View>
        <Text
          testID={nearbyOnly ? `peer-nearby-${peer.deviceId}` : undefined}
          style={[
            styles.status,
            {
              color: isLiveConnected ? theme.colors.success : nearbyOnly ? theme.colors.primary : theme.colors.textMuted
            }
          ]}
          numberOfLines={1}
        >
          {status}
        </Text>
      </View>

      {trailing ? (
        <TouchableOpacity
          style={[styles.pill, { backgroundColor: theme.colors.fill }]}
          onPress={trailing.onPress}
          activeOpacity={0.7}
          testID={trailing.testID}
          accessibilityRole="button"
          accessibilityLabel={trailing.a11y}
          hitSlop={{ top: 8, bottom: 8 }}
        >
          <Text style={[styles.pillText, { color: theme.colors.text }]}>{trailing.label}</Text>
        </TouchableOpacity>
      ) : null}

      <View style={[styles.sendIcon, { backgroundColor: theme.colors.text }]}>
        <Icon name="share" size={15} color={theme.colors.background} strokeWidth={2.1} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 68,
    paddingLeft: 14,
    paddingRight: 12,
    paddingVertical: 12,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous'
  },
  separator: {
    position: 'absolute',
    top: 0,
    left: 68,
    right: 0,
    height: StyleSheet.hairlineWidth
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: 11,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14
  },
  info: {
    flex: 1,
    minWidth: 0,
    marginRight: 8
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
    flexShrink: 1
  },
  status: {
    fontSize: 13,
    marginTop: 2
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    borderCurve: 'continuous'
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700'
  },
  pill: {
    height: 32,
    paddingHorizontal: 13,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600'
  },
  sendIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center'
  }
});
