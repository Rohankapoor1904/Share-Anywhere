import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Platform
} from 'react-native';
import GlassCard from '../components/GlassCard';

export default function PermissionsScreen({ navigation }) {
  const [nearbyGranted, setNearbyGranted] = useState(Platform.OS !== 'android');
  const [bluetoothGranted, setBluetoothGranted] = useState(false);
  const [storageGranted, setStorageGranted] = useState(false);

  const handleGrantNearby = () => {
    setNearbyGranted(true);
  };

  const handleGrantBluetooth = () => {
    setBluetoothGranted(true);
  };

  const handleGrantStorage = () => {
    setStorageGranted(true);
  };

  const handleContinue = () => {
    navigation.replace('Main');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.badge}>SETUP</Text>
          <Text style={styles.title}>Network & Device Permissions</Text>
          <Text style={styles.subtitle}>
            LocalShare operates strictly peer-to-peer on your local Wi-Fi. We never access the internet or external servers.
          </Text>
        </View>

        <GlassCard style={styles.card}>
          <View style={styles.permRow}>
            <View style={styles.permInfo}>
              <Text style={styles.permTitle}>Nearby Wi-Fi Discovery</Text>
              <Text style={styles.permDesc}>
                Discovers peer devices on the same Wi-Fi subnet using mDNS and direct sockets.
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.permBtn, nearbyGranted ? styles.grantedBtn : null]}
              onPress={handleGrantNearby}
            >
              <Text style={[styles.permBtnText, nearbyGranted ? styles.grantedBtnText : null]}>
                {nearbyGranted ? 'Granted' : 'Allow'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.permRow, styles.borderTop]}>
            <View style={styles.permInfo}>
              <Text style={styles.permTitle}>Bluetooth Low Energy (BLE)</Text>
              <Text style={styles.permDesc}>
                Allows fast zero-configuration beaconing and beacon discovery when Wi-Fi multicast is restricted.
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.permBtn, bluetoothGranted ? styles.grantedBtn : null]}
              onPress={handleGrantBluetooth}
            >
              <Text style={[styles.permBtnText, bluetoothGranted ? styles.grantedBtnText : null]}>
                {bluetoothGranted ? 'Granted' : 'Allow'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.permRow, styles.borderTop]}>
            <View style={styles.permInfo}>
              <Text style={styles.permTitle}>File & Storage Access</Text>
              <Text style={styles.permDesc}>
                Required to read files selected for sharing and save incoming files.
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.permBtn, storageGranted ? styles.grantedBtn : null]}
              onPress={handleGrantStorage}
            >
              <Text style={[styles.permBtnText, storageGranted ? styles.grantedBtnText : null]}>
                {storageGranted ? 'Granted' : 'Allow'}
              </Text>
            </TouchableOpacity>
          </View>
        </GlassCard>

        <TouchableOpacity
          style={styles.continueBtn}
          onPress={handleContinue}
        >
          <Text style={styles.continueBtnText}>Continue to LocalShare</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a'
  },
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center'
  },
  header: {
    marginBottom: 24,
    alignItems: 'center'
  },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#38bdf8',
    letterSpacing: 1,
    marginBottom: 6
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#f8fafc',
    textAlign: 'center',
    marginBottom: 8
  },
  subtitle: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 20
  },
  card: {
    marginBottom: 24
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12
  },
  borderTop: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)'
  },
  permInfo: {
    flex: 1,
    marginRight: 14
  },
  permTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f8fafc'
  },
  permDesc: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
    lineHeight: 18
  },
  permBtn: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8
  },
  grantedBtn: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: '#10b981'
  },
  permBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600'
  },
  grantedBtnText: {
    color: '#10b981'
  },
  continueBtn: {
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center'
  },
  continueBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700'
  }
});
