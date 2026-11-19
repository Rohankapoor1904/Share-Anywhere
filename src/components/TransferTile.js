import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
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
 * @param {string} props.transfer.fileName
 * @param {number} props.transfer.totalBytes
 * @param {number} props.transfer.transferredBytes
 * @param {number} props.transfer.speed - Bytes per second.
 * @param {string} props.transfer.status - 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
 * @param {'send' | 'receive'} props.transfer.direction
 * @param {string} [props.transfer.sha256]
 * @param {string} [props.transfer.errorMessage]
 * @param {(sessionId: string) => void} [props.onCancel]
 * @param {(sessionId: string) => void} [props.onRetry]
 */
export default function TransferTile({ transfer, onCancel, onRetry }) {
  const { theme } = useTheme();

  const {
    sessionId,
    fileName = 'Unnamed Transfer',
    totalBytes = 0,
    transferredBytes = 0,
    speed = 0,
    status = 'queued',
    direction = 'send',
    sha256,
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

  const getStatusColor = () => {
    switch (status) {
      case 'completed': return theme.colors.success;
      case 'failed': return theme.colors.danger;
      case 'cancelled': return theme.colors.warning;
      case 'in_progress': return theme.colors.primary;
      default: return theme.colors.textMuted;
    }
  };

  const statusColor = getStatusColor();
  const iconName = fileTypeIcon(fileName);
  const isVerified = status === 'completed' && Boolean(sha256);

  return (
    <GlassCard style={styles.card} variant={status === 'in_progress' ? 'interactive' : 'default'}>
      {/* Telemetry header */}
      <View style={styles.topRow}>
        <View style={[styles.fileTypeBadge, { backgroundColor: theme.colors.primaryGlow, borderColor: theme.colors.primary }]}>
          <Icon name={iconName} size={19} color={theme.colors.primary} strokeWidth={1.9} />
        </View>

        <View style={styles.nameContainer}>
          <View style={styles.directionRow}>
            <Icon
              name={direction === 'send' ? 'upload' : 'download'}
              size={11}
              color={theme.colors.textMuted}
              strokeWidth={2.4}
            />
            <Text style={[styles.directionLabel, { color: theme.colors.textMuted }]}>
              {direction === 'send' ? 'OUTGOING' : 'INCOMING'}
            </Text>
          </View>
          <Text style={[styles.fileName, { color: theme.colors.text }]} numberOfLines={1}>
            {fileName}
          </Text>
        </View>

        <View style={[styles.statusBadge, { backgroundColor: statusColor + '25', borderColor: statusColor }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {status.replace('_', ' ')}
          </Text>
        </View>
      </View>

      {/* Smooth animated progress bar */}
      <View style={[styles.progressBarTrack, { backgroundColor: theme.colors.border }]}>
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

      {/* Telemetry metrics */}
      <View style={styles.metricsRow}>
        <Text style={[styles.metricText, { color: theme.colors.textSecondary }]}>
          {formatBytes(transferredBytes)} / {formatBytes(totalBytes)} ({percent}%)
        </Text>

        <View style={styles.metricPills}>
          {status === 'in_progress' ? (
            <>
              <View style={[styles.metricPill, { backgroundColor: theme.colors.primaryGlow, borderColor: theme.colors.primary }]}>
                <Icon name="activity" size={11} color={theme.colors.primary} strokeWidth={2.4} />
                <Text style={[styles.metricPillText, { color: theme.colors.primary }]}>
                  {formatSpeed(speed)}
                </Text>
              </View>
              <View style={[styles.metricPill, { backgroundColor: theme.colors.cardSolid, borderColor: theme.colors.border }]}>
                <Text style={[styles.metricPillText, { color: theme.colors.textSecondary }]}>
                  ETA {eta}
                </Text>
              </View>
            </>
          ) : null}

          {isVerified ? (
            <View style={[styles.metricPill, { backgroundColor: theme.colors.successGlow, borderColor: theme.colors.success }]}>
              <Icon name="check" size={11} color={theme.colors.success} strokeWidth={2.6} />
              <Text style={[styles.metricPillText, { color: theme.colors.success }]}>SHA-256</Text>
            </View>
          ) : null}
        </View>
      </View>

      {errorMessage ? (
        <View style={[styles.errorBox, { backgroundColor: theme.colors.dangerGlow, borderColor: theme.colors.danger }]}>
          <Icon name="alert" size={13} color={theme.colors.danger} strokeWidth={2.2} />
          <Text style={[styles.errorText, { color: theme.colors.danger }]} numberOfLines={2}>
            {errorMessage}
          </Text>
        </View>
      ) : null}

      {/* Actions */}
      <View style={styles.actionsRow}>
        {status === 'in_progress' || status === 'queued' ? (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: theme.colors.dangerGlow, borderColor: theme.colors.danger }]}
            onPress={() => onCancel && onCancel(sessionId)}
          >
            <Icon name="close" size={12} color={theme.colors.danger} strokeWidth={2.6} />
            <Text style={[styles.btnText, { color: theme.colors.danger }]}>Cancel</Text>
          </TouchableOpacity>
        ) : null}

        {status === 'failed' || status === 'cancelled' ? (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: theme.colors.primaryGlow, borderColor: theme.colors.primary }]}
            onPress={() => onRetry && onRetry(sessionId)}
          >
            <Icon name="refresh" size={12} color={theme.colors.primary} strokeWidth={2.4} />
            <Text style={[styles.btnText, { color: theme.colors.primary }]}>Retry Transfer</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginVertical: 6
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  fileTypeBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  nameContainer: {
    flex: 1,
    marginRight: 10
  },
  directionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2
  },
  directionLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginLeft: 4
  },
  fileName: {
    fontSize: 15,
    fontWeight: '700'
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1
  },
  statusText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4
  },
  progressBarTrack: {
    height: 7,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 10
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap'
  },
  metricText: {
    fontSize: 12,
    fontWeight: '500'
  },
  metricPills: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap'
  },
  metricPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    marginLeft: 6,
    marginTop: 2
  },
  metricPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
    marginLeft: 3
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
    flex: 1
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginLeft: 8
  },
  btnText: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 5
  }
});
