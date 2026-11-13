import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import GlassCard from './GlassCard';

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
        <GlassCard style={styles.dialogCard}>
          <Text style={styles.title}>Pairing Request</Text>
          <Text style={styles.subtitle}>
            Device <Text style={styles.peerHighlight}>{displayName}</Text> wants to connect.
          </Text>

          {mode === 'display' ? (
            <View style={styles.pinDisplayBox}>
              <Text style={styles.pinLabel}>Confirm this PIN on the other device:</Text>
              <Text style={styles.pinValue}>{expectedPin}</Text>
            </View>
          ) : (
            <View style={styles.pinInputBox}>
              <Text style={styles.pinLabel}>Enter the 6-digit PIN shown on the other device:</Text>
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                maxLength={6}
                value={enteredPin}
                onChangeText={setEnteredPin}
                placeholder="000000"
                placeholderTextColor="#64748b"
                autoFocus
              />
            </View>
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.btnRow}>
            <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={handleCancel}>
              <Text style={styles.cancelBtnText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.btn,
                styles.confirmBtn,
                mode === 'enter' && enteredPin.length !== 6 ? styles.disabledBtn : null
              ]}
              disabled={mode === 'enter' && enteredPin.length !== 6}
              onPress={handleConfirm}
            >
              <Text style={styles.confirmBtnText}>
                {mode === 'display' ? 'Authorize' : 'Verify & Accept'}
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
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  dialogCard: {
    width: '100%',
    maxWidth: 400,
    padding: 24
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 8,
    textAlign: 'center'
  },
  subtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 20
  },
  peerHighlight: {
    color: '#38bdf8',
    fontWeight: '600'
  },
  pinDisplayBox: {
    alignItems: 'center',
    marginVertical: 16,
    padding: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderRadius: 12
  },
  pinInputBox: {
    marginVertical: 16
  },
  pinLabel: {
    fontSize: 13,
    color: '#cbd5e1',
    marginBottom: 10,
    textAlign: 'center'
  },
  pinValue: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 8,
    color: '#38bdf8'
  },
  input: {
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 12,
    padding: 14,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 6,
    color: '#f8fafc',
    textAlign: 'center'
  },
  errorText: {
    color: '#ef4444',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginHorizontal: 4
  },
  cancelBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: '#ef4444'
  },
  cancelBtnText: {
    color: '#ef4444',
    fontWeight: '600',
    fontSize: 14
  },
  confirmBtn: {
    backgroundColor: '#3b82f6'
  },
  disabledBtn: {
    opacity: 0.5
  },
  confirmBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14
  }
});
