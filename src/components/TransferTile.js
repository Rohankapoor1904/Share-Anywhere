import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import GlassCard from './GlassCard';
import { formatBytes, formatSpeed, formatEta } from '../utils/byteFormat';
import { useTheme } from '../theme';

/**
 * Renders an active or finished file transfer tile with progress, speed, ETA, and actions.
 * @param {object} props
 * @param {object} props.transfer
 * @param {string} props.transfer.sessionId
 * @param {string} props.transfer.fileName
 * @param {number} props.transfer.totalBytes
 * @param {number} props.transfer.transferredBytes
 * @param {number} props.transfer.speed - Bytes per second.
 * @param {string} props.transfer.status - 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
 * @param {'send' | 'receive'} props.transfer.direction
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
    errorMessage
  } = transfer;

  const percent = totalBytes > 0
    ? Math.min(100, Math.max(0, Math.round((transferredBytes / totalBytes) * 100)))
    : 0;

  const remainingBytes = Math.max(0, totalBytes - transferredBytes);
  const eta = status === 'in_progress' ? formatEta(remainingBytes, speed) : '--';

  const getStatusColor = () => {
    switch (status) {
      case 'completed': return theme.colors.success;
      case 'failed': return theme.colors.danger;
      case 'cancelled': return theme.colors.warning;
      case 'in_progress': return theme.colors.primary;
      default: return theme.colors.textMuted;
    }
  };

  const getFileGlyph = (name) => {
    const ext = (name || '').split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'webp': return '🖼️';
      case 'mp4':
      case 'mkv':
      case 'mov':
      case 'avi': return '🎬';
      case 'mp3':
      case 'wav':
      case 'flac':
      case 'm4a': return '🎵';
      case 'pdf': return '📕';
      case 'zip':
      case 'rar':
      case 'tar':
      case 'gz':
      case '7z': return '📦';
      case 'apk': return '🤖';
      case 'txt':
      case 'md':
      case 'doc':
      case 'docx': return '📄';
      default: return '📁';
    }
  };

  const statusColor = getStatusColor();

  return (
    <GlassCard style={styles.card} variant={status === 'in_progress' ? 'interactive' : 'default'}>
      <View style={styles.topRow}>
        <View style={styles.nameContainer}>
          <View style={styles.directionRow}>
            <Text style={[styles.directionGlyph]}>
              {direction === 'send' ? '📤' : '📥'}
            </Text>
            <Text style={[styles.directionLabel, { color: theme.colors.textMuted }]}>
              {direction === 'send' ? 'OUTGOING' : 'INCOMING'}
            </Text>
          </View>
          <View style={styles.fileNameRow}>
            <Text style={styles.fileGlyph}>{getFileGlyph(fileName)}</Text>
            <Text style={[styles.fileName, { color: theme.colors.text }]} numberOfLines={1}>
              {fileName}
            </Text>
          </View>
        </View>

        <View style={[styles.statusBadge, { backgroundColor: statusColor + '25', borderColor: statusColor }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {status.replace('_', ' ')}
          </Text>
        </View>
      </View>

      {/* Progress Bar Track */}
      <View style={[styles.progressBarTrack, { backgroundColor: theme.colors.border }]}>
        <View
          style={[
            styles.progressBarFill,
            { width: `${percent}%`, backgroundColor: statusColor }
          ]}
        />
      </View>

      {/* Metrics Row */}
      <View style={styles.metricsRow}>
        <Text style={[styles.metricText, { color: theme.colors.textSecondary }]}>
          {formatBytes(transferredBytes)} / {formatBytes(totalBytes)} ({percent}%)
        </Text>
        {status === 'in_progress' ? (
          <Text style={[styles.speedText, { color: theme.colors.primary }]}>
            ⚡ {formatSpeed(speed)} • ETA {eta}
          </Text>
        ) : null}
      </View>

      {errorMessage ? (
        <View style={[styles.errorBox, { backgroundColor: theme.colors.dangerGlow, borderColor: theme.colors.danger }]}>
          <Text style={[styles.errorText, { color: theme.colors.danger }]} numberOfLines={2}>
            ⚠️ {errorMessage}
          </Text>
        </View>
      ) : null}

      {/* Action Buttons */}
      <View style={styles.actionsRow}>
        {status === 'in_progress' || status === 'queued' ? (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: theme.colors.dangerGlow, borderColor: theme.colors.danger }]}
            onPress={() => onCancel && onCancel(sessionId)}
          >
            <Text style={[styles.btnText, { color: theme.colors.danger }]}>✕ Cancel</Text>
          </TouchableOpacity>
        ) : null}

        {status === 'failed' || status === 'cancelled' ? (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: theme.colors.primaryGlow, borderColor: theme.colors.primary }]}
            onPress={() => onRetry && onRetry(sessionId)}
          >
            <Text style={[styles.btnText, { color: theme.colors.primary }]}>🔄 Retry Transfer</Text>
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
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10
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
  directionGlyph: {
    fontSize: 11,
    marginRight: 4
  },
  directionLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  fileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2
  },
  fileGlyph: {
    fontSize: 16,
    marginRight: 6
  },
  fileName: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3
  },
  progressBarTrack: {
    height: 7,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  metricText: {
    fontSize: 12,
    fontWeight: '500'
  },
  speedText: {
    fontSize: 12,
    fontWeight: '700'
  },
  errorBox: {
    marginTop: 8,
    padding: 8,
    borderRadius: 6,
    borderWidth: 1
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600'
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10
  },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginLeft: 8
  },
  btnText: {
    fontSize: 12,
    fontWeight: '700'
  }
});
