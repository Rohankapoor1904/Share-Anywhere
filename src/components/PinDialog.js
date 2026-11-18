import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import GlassCard from './GlassCard';
import { useTheme } from '../theme';

/**
 * 6-Digit PIN challenge confirmation dialog for unknown peers.
 * @param {object} props
 * @param {boolean} props.visible
 * @param {object} props.challenge - Challenge info { deviceId, displayName, expectedPin, mode: 'enter' | 'display' }
 * @param {(pin: string) => void} props.onConfirm
 * @param {() => void} props.onReject
 * @param {string} [props.error]
 */
export default function PinDialog({ visible, challenge, onConfirm, onReject, error }) {
  const { theme } = useTheme();
  const [enteredPin, setEnteredPin] = useState('');

  if (!visible || !challenge) {
    return null;
  }

  const { displayName = 'Unknown Peer', expectedPin, mode = 'enter' } = challenge;

  const handleConfirm = () => {
    if (mode === 'display') {
      onConfirm(expectedPin);
    } else {
      onConfirm(enteredPin);
      setEnteredPin('');
    }
  };

  const handleCancel = () => {
    setEnteredPin('');
    onReject();
  };

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={handleCancel}
    >
      <View style={styles.overlay}>
        <GlassCard
          style={[styles.dialogCard, { borderColor: theme.colors.borderHighlight }]}
          variant="highlighted"
        >
          <View style={[styles.shieldIconContainer, { backgroundColor: theme.colors.primaryGlow }]}>
            <Text style={styles.shieldIcon}>🔐</Text>
          </View>

          <Text style={[styles.title, { color: theme.colors.text }]}>Pairing Security Check</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
            Device <Text style={[styles.peerHighlight, { color: theme.colors.primary }]}>{displayName}</Text> is requesting connection.
          </Text>

          {mode === 'display' ? (
            <View style={[styles.pinDisplayBox, { backgroundColor: theme.colors.inputBg, borderColor: theme.colors.border }]}>
              <Text style={[styles.pinLabel, { color: theme.colors.textSecondary }]}>
                Confirm this PIN on the other device:
              </Text>
              <Text style={[styles.pinValue, { color: theme.colors.primary }]}>{expectedPin}</Text>
            </View>
          ) : (
            <View style={styles.pinInputBox}>
              <Text style={[styles.pinLabel, { color: theme.colors.textSecondary }]}>
                Enter the 6-digit PIN shown on the other device:
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.colors.inputBg,
                    borderColor: theme.colors.borderHighlight,
                    color: theme.colors.text
                  }
                ]}
                keyboardType="number-pad"
                maxLength={6}
                value={enteredPin}
                onChangeText={setEnteredPin}
                placeholder="000000" // justified: TextInput hint
                placeholderTextColor={theme.colors.textMuted} // justified: TextInput hint
                autoFocus
              />
            </View>
          )}

          {error ? (
            <Text style={[styles.errorText, { color: theme.colors.danger }]}>{error}</Text>
          ) : null}

          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: theme.colors.dangerGlow, borderColor: theme.colors.danger }]}
              onPress={handleCancel}
            >
              <Text style={[styles.cancelBtnText, { color: theme.colors.danger }]}>Decline</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.btn,
                { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
                mode === 'enter' && enteredPin.length !== 6 ? styles.disabledBtn : null
              ]}
              disabled={mode === 'enter' && enteredPin.length !== 6}
              onPress={handleConfirm}
            >
              <Text style={[styles.confirmBtnText, { color: theme.mode === 'light' ? '#ffffff' : '#000000' }]}>
                {mode === 'display' ? 'Authorize' : 'Verify & Connect'}
              </Text>
            </TouchableOpacity>
          </View>
        </GlassCard>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  dialogCard: {
    width: '100%',
    maxWidth: 400,
    padding: 24,
    alignItems: 'center'
  },
  shieldIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12
  },
  shieldIcon: {
    fontSize: 26
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center'
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20
  },
  peerHighlight: {
    fontWeight: '700'
  },
  pinDisplayBox: {
    alignItems: 'center',
    marginVertical: 14,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    width: '100%'
  },
  pinInputBox: {
    marginVertical: 14,
    width: '100%'
  },
  pinLabel: {
    fontSize: 13,
    marginBottom: 10,
    textAlign: 'center',
    fontWeight: '500'
  },
  pinValue: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 8
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 14,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 8,
    textAlign: 'center'
  },
  errorText: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
    fontWeight: '600'
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    width: '100%'
  },
  btn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 1
  },
  cancelBtnText: {
    fontWeight: '700',
    fontSize: 14
  },
  disabledBtn: {
    opacity: 0.4
  },
  confirmBtnText: {
    fontWeight: '800',
    fontSize: 14
  }
});
