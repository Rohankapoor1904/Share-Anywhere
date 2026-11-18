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
import { useTheme } from '../theme';

export default function PermissionsScreen({ navigation }) {
  const { theme } = useTheme();
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
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.badge, { color: theme.colors.primary }]}>SETUP & PERMISSIONS</Text>
          <Text style={[styles.title, { color: theme.colors.text }]}>Local Network & Discovery</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
            LocalShare operates strictly peer-to-peer on your local Wi-Fi. We never access the internet or external servers.
          </Text>
        </View>

        <GlassCard style={styles.card} variant="interactive">
          <View style={styles.permRow}>
            <Text style={styles.permGlyph}>📡</Text>
            <View style={styles.permInfo}>
              <Text style={[styles.permTitle, { color: theme.colors.text }]}>Nearby Wi-Fi Discovery</Text>
              <Text style={[styles.permDesc, { color: theme.colors.textSecondary }]}>
                Discovers peer devices on the same Wi-Fi subnet using mDNS and direct sockets.
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.permBtn,
                nearbyGranted
                  ? { backgroundColor: theme.colors.successGlow, borderColor: theme.colors.success, borderWidth: 1 }
                  : { backgroundColor: theme.colors.primary }
              ]}
              onPress={handleGrantNearby}
            >
              <Text
                style={[
                  styles.permBtnText,
                  {
                    color: nearbyGranted
                      ? theme.colors.success
                      : theme.mode === 'light'
                      ? '#ffffff'
                      : '#000000'
                  }
                ]}
              >
                {nearbyGranted ? 'Granted ✓' : 'Allow'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.permRow, styles.borderTop, { borderTopColor: theme.colors.border }]}>
            <Text style={styles.permGlyph}>📶</Text>
            <View style={styles.permInfo}>
              <Text style={[styles.permTitle, { color: theme.colors.text }]}>Bluetooth Low Energy (BLE)</Text>
              <Text style={[styles.permDesc, { color: theme.colors.textSecondary }]}>
                Allows fast zero-configuration beacon discovery when Wi-Fi multicast is restricted.
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.permBtn,
                bluetoothGranted
                  ? { backgroundColor: theme.colors.successGlow, borderColor: theme.colors.success, borderWidth: 1 }
                  : { backgroundColor: theme.colors.primary }
              ]}
              onPress={handleGrantBluetooth}
            >
              <Text
                style={[
                  styles.permBtnText,
                  {
                    color: bluetoothGranted
                      ? theme.colors.success
                      : theme.mode === 'light'
                      ? '#ffffff'
                      : '#000000'
                  }
                ]}
              >
                {bluetoothGranted ? 'Granted ✓' : 'Allow'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.permRow, styles.borderTop, { borderTopColor: theme.colors.border }]}>
            <Text style={styles.permGlyph}>📂</Text>
            <View style={styles.permInfo}>
              <Text style={[styles.permTitle, { color: theme.colors.text }]}>File & Storage Access</Text>
              <Text style={[styles.permDesc, { color: theme.colors.textSecondary }]}>
                Required to read files selected for sharing and save incoming files.
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.permBtn,
                storageGranted
                  ? { backgroundColor: theme.colors.successGlow, borderColor: theme.colors.success, borderWidth: 1 }
                  : { backgroundColor: theme.colors.primary }
              ]}
              onPress={handleGrantStorage}
            >
              <Text
                style={[
                  styles.permBtnText,
                  {
                    color: storageGranted
                      ? theme.colors.success
                      : theme.mode === 'light'
                      ? '#ffffff'
                      : '#000000'
                  }
                ]}
              >
                {storageGranted ? 'Granted ✓' : 'Allow'}
              </Text>
            </TouchableOpacity>
          </View>
        </GlassCard>

        <TouchableOpacity
          style={[styles.continueBtn, { backgroundColor: theme.colors.primary }]}
          onPress={handleContinue}
        >
          <Text style={[styles.continueBtnText, { color: theme.mode === 'light' ? '#ffffff' : '#000000' }]}>
            Continue to LocalShare →
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1
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
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 6
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8
  },
  subtitle: {
    fontSize: 13,
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
    paddingVertical: 14
  },
  borderTop: {
    borderTopWidth: 1
  },
  permGlyph: {
    fontSize: 22,
    marginRight: 12
  },
  permInfo: {
    flex: 1,
    marginRight: 14
  },
  permTitle: {
    fontSize: 15,
    fontWeight: '700'
  },
  permDesc: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 18
  },
  permBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8
  },
  permBtnText: {
    fontSize: 12,
    fontWeight: '800'
  },
  continueBtn: {
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center'
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '800'
  }
});
