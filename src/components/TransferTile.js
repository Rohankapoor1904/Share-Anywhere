import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet, Linking, Alert } from 'react-native';
import GlassCard from './GlassCard';
import Icon from './Icon';
import { fileTypeIcon } from './iconPaths';
import { formatBytes, formatSpeed, formatEta } from '../utils/byteFormat';
import { useTheme } from '../theme';

const AnimatedView = /** @type {any} */ (Animated.View);

/** @param {number} percent */
function clampPercent(percent) {
  return Math.min(100, Math.max(0, percent));
}

/**
 * Renders an active or finished file transfer tile with smooth progress,
 * live speed, ETA and verification status.
 * @param {object} props
 * @param {object} props.transfer
 * @param {string} props.transfer.sessionId
 * @param {string} [props.transfer.fileName]
 * @param {number} [props.transfer.totalBytes]
 * @param {number} [props.transfer.transferredBytes]
 * @param {number} [props.transfer.speed] - Bytes per second.
 * @param {string} [props.transfer.status] - 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
 * @param {'send' | 'receive'} [props.transfer.direction]
 * @param {string} [props.transfer.filePath]
 * @param {string} [props.transfer.path]
 * @param {string} [props.transfer.errorMessage]
 * @param {(sessionId: string) => void} [props.onCancel]
 * @param {(sessionId: string) => void} [props.onRetry]
 * @param {(transfer: object) => void} [props.onOpen]
 */
export default function TransferTile({ transfer, onCancel, onRetry, onOpen }) {
  const { theme } = useTheme();

  const {
    sessionId,
    fileName = 'Unnamed Transfer',
    totalBytes = 0,
    transferredBytes = 0,
    speed = 0,
    status = 'queued',
    direction = 'send',
    errorMessage
  } = transfer;

  const percent = totalBytes > 0
    ? clampPercent(Math.round((transferredBytes / totalBytes) * 100))
    : 0;

  const remainingBytes = Math.max(0, totalBytes - transferredBytes);
  const eta = status === 'in_progress' ? formatEta(remainingBytes, speed) : '--';

  // Animate the fill width so each progress tick glides instead of jumping.
  const progressAnim = useRef(new Animated.Value(percent)).current;
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: percent,
      duration: 250,
      useNativeDriver: false
    }).start();
  }, [percent, progressAnim]);

  const iconName = fileTypeIcon(fileName);

  const handleOpenFallback = async () => {
    const filePath = transfer.filePath || transfer.path;
    if (!filePath) return;
    try {
      const url = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Cannot Open', `No compatible app found to open ${fileName}.`);
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not open file.');
    }
  };

  // Completed transfer: Clean, quiet 1-row history item (No full progress bar, no loud pills)
  if (status === 'completed') {
    return (
      <GlassCard style={styles.completedCard}>
        <View style={styles.completedRow}>
          <View style={[styles.completedGlyph, { backgroundColor: theme.colors.fill }]}>
            <Icon name={iconName} size={18} color={theme.colors.textSecondary} strokeWidth={1.9} />
          </View>

          <View style={styles.completedInfo}>
            <Text style={[styles.fileName, { color: theme.colors.text }]} numberOfLines={1}>
              {fileName}
            </Text>
            <Text style={[styles.completedMeta, { color: theme.colors.textSecondary }]}>
              {direction === 'send' ? 'Sent' : 'Received'} · {formatBytes(totalBytes || transferredBytes)} · Verified
            </Text>
          </View>

          {direction === 'receive' ? (
            <TouchableOpacity
              style={[styles.openTileBtn, { backgroundColor: theme.colors.fill }]}
              onPress={() => (onOpen ? onOpen(transfer) : handleOpenFallback())}
              accessibilityRole="button"
              accessibilityLabel="Open received file"
            >
              <Text style={[styles.openTileBtnText, { color: theme.colors.text }]}>Open</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.completedCheck}>
              <Icon name="check" size={15} color={theme.colors.success} strokeWidth={2.4} />
            </View>
          )}
        </View>
      </GlassCard>
    );
  }

  // Active or Failed Transfer
  const isFailed = status === 'failed' || status === 'cancelled';
  const statusColor = isFailed ? theme.colors.danger : theme.colors.primary;

  return (
    <GlassCard style={styles.card}>
      {/* Top row */}
      <View style={styles.topRow}>
        <View style={[styles.activeGlyph, { backgroundColor: isFailed ? theme.colors.dangerGlow : theme.colors.primaryGlow }]}>
          <Icon name={iconName} size={18} color={isFailed ? theme.colors.danger : theme.colors.primary} strokeWidth={1.9} />
        </View>

        <View style={styles.nameContainer}>
          <Text style={[styles.fileName, { color: theme.colors.text }]} numberOfLines={1}>
            {fileName}
          </Text>
          <Text style={[styles.activeSubtitle, { color: theme.colors.textSecondary }]}>
            {isFailed ? (status === 'cancelled' ? 'Cancelled' : 'Failed') : direction === 'send' ? 'Sending' : 'Receiving'} · {formatBytes(transferredBytes)} of {formatBytes(totalBytes)}
          </Text>
        </View>

        {status === 'in_progress' || status === 'queued' ? (
          <TouchableOpacity
            style={[styles.cancelBtn, { backgroundColor: theme.colors.fill }]}
            onPress={() => onCancel && onCancel(sessionId)}
            accessibilityRole="button"
            accessibilityLabel="Cancel transfer"
          >
            <Icon name="close" size={14} color={theme.colors.textSecondary} strokeWidth={2.2} />
          </TouchableOpacity>
        ) : isFailed ? (
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: theme.colors.fill }]}
            onPress={() => onRetry && onRetry(sessionId)}
            accessibilityRole="button"
            accessibilityLabel="Retry transfer"
          >
            <Icon name="refresh" size={13} color={theme.colors.text} strokeWidth={2.2} />
            <Text style={[styles.retryBtnText, { color: theme.colors.text }]}>Retry</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Sleek thin animated progress bar (4px height) */}
      {!isFailed ? (
        <View style={[styles.progressBarTrack, { backgroundColor: theme.colors.fillStrong }]}>
          <AnimatedView
            style={[
              styles.progressBarFill,
              {
                backgroundColor: statusColor,
                width: progressAnim.interpolate({
                  inputRange: [0, 100],
                  outputRange: ['0%', '100%']
                })
              }
            ]}
          />
        </View>
      ) : null}

      {/* Speed & ETA for active transfers */}
      {status === 'in_progress' ? (
        <View style={styles.activeMetricsRow}>
          <Text style={[styles.activeMetricVal, { color: theme.colors.textSecondary }]}>
            {percent}% · {formatSpeed(speed)}
          </Text>
          <Text style={[styles.activeMetricVal, { color: theme.colors.textMuted }]}>
            {eta} left
          </Text>
        </View>
      ) : null}

      {errorMessage ? (
        <View style={[styles.errorBox, { backgroundColor: theme.colors.dangerGlow }]}>
          <Icon name="alert" size={13} color={theme.colors.danger} strokeWidth={2.2} />
          <Text style={[styles.errorText, { color: theme.colors.danger }]} numberOfLines={2}>
            {errorMessage}
          </Text>
        </View>
      ) : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginVertical: 4
  },
  completedCard: {
    marginVertical: 4
  },
  completedRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  completedGlyph: {
    width: 40,
    height: 40,
    borderRadius: 11,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  completedInfo: {
    flex: 1,
    marginRight: 10
  },
  completedMeta: {
    fontSize: 12.5,
    marginTop: 2,
    fontVariant: ['tabular-nums']
  },
  completedCheck: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center'
  },
  openTileBtn: {
    paddingHorizontal: 12,
    height: 30,
    justifyContent: 'center',
    borderRadius: 9,
    borderCurve: 'continuous'
  },
  openTileBtnText: {
    fontSize: 13,
    fontWeight: '600'
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  activeGlyph: {
    width: 40,
    height: 40,
    borderRadius: 11,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  nameContainer: {
    flex: 1,
    marginRight: 10
  },
  fileName: {
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: -0.1
  },
  activeSubtitle: {
    fontSize: 12.5,
    marginTop: 2,
    fontVariant: ['tabular-nums']
  },
  cancelBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center'
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    height: 30,
    borderRadius: 9,
    borderCurve: 'continuous'
  },
  retryBtnText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4
  },
  progressBarTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 10,
    marginBottom: 6
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2
  },
  activeMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4
  },
  activeMetricVal: {
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums']
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    borderCurve: 'continuous'
  },
  errorText: {
    fontSize: 12.5,
    fontWeight: '500',
    marginLeft: 6,
    flex: 1
  }
});
