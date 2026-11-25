import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import GlassCard from './GlassCard';
import Icon from './Icon';
import { useTheme } from '../theme';
import { useLocalShare } from '../engine/providers';

/**
 * "Connect a PC without Wi-Fi" sheet. Drives the offline PC session (BLE handshake +
 * phone hotspot) and shows the 6-digit code the PC also shows.
 * @param {object} props
 * @param {boolean} props.visible
 * @param {() => void} props.onClose
 */
export default function OfflinePcSheet({ visible, onClose }) {
  const { theme } = useTheme();
  const {
    offlinePcState,
    startOfflinePc,
    startOfflinePcManual,
    respondOfflinePc,
    stopOfflinePc
  } = useLocalShare();
  const state = offlinePcState || { phase: 'idle' };
  const phase = state.phase || 'idle';
  const pcName = (state.pc && state.pc.displayName) || 'your PC';
  const onPrimary = theme.mode === 'light' ? '#ffffff' : '#000000';

  const close = () => {
    // Waiting or confirming has no use once the sheet is gone; a connected session keeps running.
    if (phase === 'advertising' || phase === 'confirm' || phase === 'failed') {
      stopOfflinePc();
    }
    onClose();
  };

  const button = (label, onPress, variant = 'primary', testID) => (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles.btn,
        variant === 'primary'
          ? { backgroundColor: theme.colors.primary }
          : variant === 'danger'
            ? { backgroundColor: theme.colors.dangerGlow }
            : { backgroundColor: theme.colors.fill }
      ]}
    >
      <Text
        style={[
          styles.btnText,
          { color: variant === 'primary' ? onPrimary : variant === 'danger' ? theme.colors.danger : theme.colors.text }
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const detailRow = (label, value) => (
    <View style={[styles.detailRow, { borderBottomColor: theme.colors.border }]} key={label}>
      <Text style={[styles.detailLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text selectable style={[styles.detailValue, styles.tabular, { color: theme.colors.text }]}>{value}</Text>
    </View>
  );

  let title = 'Connect a PC without Wi-Fi';
  let body = null;

  if (phase === 'idle') {
    body = (
      <>
        <Text style={[styles.text, { color: theme.colors.textSecondary }]}>
          Your phone creates a private Wi-Fi hotspot just for your PC. Bluetooth is used to hand over its
          password safely. The PC has no internet while it is connected.
        </Text>
        {button('Start', startOfflinePc, 'primary', 'offline-pc-start')}
        {button('PC has no Bluetooth', startOfflinePcManual, 'secondary', 'offline-pc-manual')}
      </>
    );
  } else if (phase === 'advertising') {
    body = (
      <>
        <ActivityIndicator color={theme.colors.primary} style={styles.spinner} />
        <Text style={[styles.text, { color: theme.colors.textSecondary }]}>
          On the PC, open LocalShare and click "Connect without Wi-Fi", then pick this phone.
        </Text>
        {button('PC has no Bluetooth', startOfflinePcManual, 'secondary', 'offline-pc-manual')}
        {button('Cancel', close, 'secondary')}
      </>
    );
  } else if (phase === 'confirm') {
    title = 'Check the code';
    body = (
      <>
        <Text style={[styles.text, { color: theme.colors.textSecondary }]}>
          <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{pcName}</Text> wants to join this phone's hotspot.
          Allow it only if the PC shows the same code.
        </Text>
        <View style={[styles.codeBox, { backgroundColor: theme.colors.inputBg, borderColor: theme.colors.border }]}>
          <Text testID="offline-pc-code" style={[styles.code, styles.tabular, { color: theme.colors.primary }]}>
            {state.code}
          </Text>
        </View>
        <View style={styles.row}>
          <View style={styles.rowItem}>{button('Decline', () => respondOfflinePc(false), 'danger', 'offline-pc-decline')}</View>
          <View style={styles.rowItem}>{button('Allow', () => respondOfflinePc(true), 'primary', 'offline-pc-allow')}</View>
        </View>
      </>
    );
  } else if (phase === 'starting_hotspot') {
    body = (
      <>
        <ActivityIndicator color={theme.colors.primary} style={styles.spinner} />
        <Text style={[styles.text, { color: theme.colors.textSecondary }]}>Starting the phone hotspot…</Text>
      </>
    );
  } else if (phase === 'ready') {
    title = 'PC is joining';
    body = (
      <>
        <ActivityIndicator color={theme.colors.primary} style={styles.spinner} />
        <Text style={[styles.text, { color: theme.colors.textSecondary }]}>
          {pcName} received the hotspot details and is connecting to it. This takes a few seconds.
        </Text>
        {state.creds ? detailRow('Hotspot', state.creds.ssid) : null}
        {button('Stop', stopOfflinePc, 'secondary', 'offline-pc-stop')}
      </>
    );
  } else if (phase === 'manual') {
    title = 'Join from the PC';
    const creds = state.creds || {};
    body = (
      <>
        <Text style={[styles.text, { color: theme.colors.textSecondary }]}>
          On the PC, click "Connect without Wi-Fi" → "Enter details", and type these:
        </Text>
        <View style={styles.details}>
          {detailRow('Wi-Fi name', creds.ssid || '')}
          {detailRow('Password', creds.password || '(none)')}
          {detailRow('Phone address', `${creds.ip || ''}:${creds.port || ''}`)}
        </View>
        {button('Stop hotspot', stopOfflinePc, 'secondary', 'offline-pc-stop')}
      </>
    );
  } else if (phase === 'connected') {
    title = 'PC connected';
    body = (
      <>
        <View style={[styles.okGlyph, { backgroundColor: theme.colors.successGlow }]}>
          <Icon name="check" size={22} color={theme.colors.success} strokeWidth={2.6} />
        </View>
        <Text style={[styles.text, { color: theme.colors.textSecondary }]}>
          {pcName} is connected through this phone's hotspot. Send and browse files as usual.
        </Text>
        {button('Done', onClose, 'primary')}
        {button('Disconnect and turn off hotspot', stopOfflinePc, 'danger', 'offline-pc-stop')}
      </>
    );
  } else if (phase === 'failed') {
    title = "Couldn't connect";
    body = (
      <>
        <Text testID="offline-pc-error" style={[styles.text, { color: theme.colors.danger }]}>
          {state.error || 'Something went wrong.'}
        </Text>
        {button('Try again', startOfflinePc, 'primary')}
        {button('Close', close, 'secondary')}
      </>
    );
  }

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={close}>
      <View style={styles.overlay}>
        <GlassCard style={[styles.card, { borderColor: theme.colors.borderHighlight }]} variant="highlighted">
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
            <TouchableOpacity onPress={close} accessibilityLabel="Close" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Icon name="close" size={16} color={theme.colors.textMuted} strokeWidth={2.4} />
            </TouchableOpacity>
          </View>
          {body}
        </GlassCard>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    padding: 22
  },
  card: {
    padding: 22,
    borderRadius: 22,
    borderCurve: 'continuous'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    flex: 1,
    marginRight: 12
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14
  },
  spinner: {
    marginVertical: 12
  },
  codeBox: {
    borderWidth: 1,
    borderRadius: 14,
    borderCurve: 'continuous',
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16
  },
  code: {
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: 8
  },
  tabular: {
    fontVariant: ['tabular-nums']
  },
  details: {
    marginBottom: 14
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  detailLabel: {
    fontSize: 13
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: 12
  },
  row: {
    flexDirection: 'row',
    marginHorizontal: -4
  },
  rowItem: {
    flex: 1,
    marginHorizontal: 4
  },
  btn: {
    paddingVertical: 13,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    marginTop: 8
  },
  btnText: {
    fontSize: 15,
    fontWeight: '700'
  },
  okGlyph: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12
  }
});
