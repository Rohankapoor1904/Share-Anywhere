import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import GlassCard from './GlassCard';
import { formatBytes, formatSpeed, formatEta } from '../utils/byteFormat';

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
  const {
    sessionId,
    fileName,
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
      case 'completed': return '#10b981';
      case 'failed': return '#ef4444';
      case 'cancelled': return '#f59e0b';
      case 'in_progress': return '#3b82f6';
      default: return '#94a3b8';
    }
  };

  return (
    <GlassCard style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.nameContainer}>
          <Text style={styles.directionLabel}>
            {direction === 'send' ? 'OUTGOING' : 'INCOMING'}
          </Text>
          <Text style={styles.fileName} numberOfLines={1}>
            {fileName}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor() }]}>
          <Text style={styles.statusText}>{status.replace('_', ' ')}</Text>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressBarTrack}>
        <View
          style={[
            styles.progressBarFill,
            { width: `${percent}%`, backgroundColor: getStatusColor() }
          ]}
        />
      </View>

      {/* Metrics Row */}
      <View style={styles.metricsRow}>
        <Text style={styles.metricText}>
          {formatBytes(transferredBytes)} / {formatBytes(totalBytes)} ({percent}%)
        </Text>
        {status === 'in_progress' ? (
          <Text style={styles.metricText}>
            {formatSpeed(speed)} • ETA {eta}
          </Text>
        ) : null}
      </View>

      {errorMessage ? (
        <Text style={styles.errorText} numberOfLines={2}>
          {errorMessage}
        </Text>
      ) : null}

      {/* Action Buttons */}
      <View style={styles.actionsRow}>
        {status === 'in_progress' || status === 'queued' ? (
          <TouchableOpacity
            style={[styles.btn, styles.cancelBtn]}
            onPress={() => onCancel && onCancel(sessionId)}
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        ) : null}

        {status === 'failed' || status === 'cancelled' ? (
          <TouchableOpacity
            style={[styles.btn, styles.retryBtn]}
            onPress={() => onRetry && onRetry(sessionId)}
          >
            <Text style={styles.retryBtnText}>Retry</Text>
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
  directionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.5,
    marginBottom: 2
  },
  fileName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f8fafc'
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
    textTransform: 'uppercase'
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  metricText: {
    fontSize: 12,
    color: '#94a3b8'
  },
  errorText: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 6
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
    marginLeft: 8
  },
  cancelBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: '#ef4444'
  },
  cancelBtnText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600'
  },
  retryBtn: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderWidth: 1,
    borderColor: '#3b82f6'
  },
  retryBtnText: {
    color: '#3b82f6',
    fontSize: 12,
    fontWeight: '600'
  }
});
