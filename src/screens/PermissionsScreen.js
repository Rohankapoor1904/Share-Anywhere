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
import Icon from '../components/Icon';
import AmbientBackground from '../components/AmbientBackground';
import { useTheme } from '../theme';
import { requestDiscoveryPermissions } from '../utils/permissions';

export default function PermissionsScreen({ navigation }) {
  const { theme } = useTheme();
  const [nearbyGranted, setNearbyGranted] = useState(Platform.OS !== 'android');
  const [bluetoothGranted, setBluetoothGranted] = useState(false);
  const [storageGranted, setStorageGranted] = useState(false);

  const handleGrantNearby = async () => {
    await requestDiscoveryPermissions();
    setNearbyGranted(true);
  };

  const handleGrantBluetooth = async () => {
    await requestDiscoveryPermissions();
    setBluetoothGranted(true);
  };

  const handleGrantStorage = async () => {
    await requestDiscoveryPermissions();
    setStorageGranted(true);
  };

  const handleContinue = async () => {
    await requestDiscoveryPermissions();
    navigation.replace('Main');
  };

  return (
    <AmbientBackground intense>
      <SafeAreaView style={styles.safeArea}>
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
            <View style={[styles.permGlyph, { backgroundColor: theme.colors.primaryGlow, borderColor: theme.colors.primary }]}>
              <Icon name="wifi" size={18} color={theme.colors.primary} strokeWidth={2.1} />
            </View>
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
              {nearbyGranted ? (
                <>
                  <Icon name="check" size={11} color={theme.colors.success} strokeWidth={3} />
                  <Text style={[styles.permBtnText, { color: theme.colors.success }]}>Granted</Text>
                </>
              ) : (
                <Text style={[styles.permBtnText, { color: theme.mode === 'light' ? '#ffffff' : '#000000' }]}>
                  Allow
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={[styles.permRow, styles.borderTop, { borderTopColor: theme.colors.border }]}>
            <View style={[styles.permGlyph, { backgroundColor: theme.colors.primaryGlow, borderColor: theme.colors.primary }]}>
              <Icon name="radar" size={18} color={theme.colors.primary} strokeWidth={2.1} />
            </View>
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
              {bluetoothGranted ? (
                <>
                  <Icon name="check" size={11} color={theme.colors.success} strokeWidth={3} />
                  <Text style={[styles.permBtnText, { color: theme.colors.success }]}>Granted</Text>
                </>
              ) : (
                <Text style={[styles.permBtnText, { color: theme.mode === 'light' ? '#ffffff' : '#000000' }]}>
                  Allow
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={[styles.permRow, styles.borderTop, { borderTopColor: theme.colors.border }]}>
            <View style={[styles.permGlyph, { backgroundColor: theme.colors.primaryGlow, borderColor: theme.colors.primary }]}>
              <Icon name="folder" size={18} color={theme.colors.primary} strokeWidth={2.1} />
            </View>
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
              {storageGranted ? (
                <>
                  <Icon name="check" size={11} color={theme.colors.success} strokeWidth={3} />
                  <Text style={[styles.permBtnText, { color: theme.colors.success }]}>Granted</Text>
                </>
              ) : (
                <Text style={[styles.permBtnText, { color: theme.mode === 'light' ? '#ffffff' : '#000000' }]}>
                  Allow
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </GlassCard>

        <TouchableOpacity
          style={[styles.continueBtn, { backgroundColor: theme.colors.primary }]}
          onPress={handleContinue}
        >
          <Text style={[styles.continueBtnText, { color: theme.mode === 'light' ? '#ffffff' : '#000000' }]}>
            Continue to LocalShare
          </Text>
          <Icon name="arrow-right" size={15} color={theme.mode === 'light' ? '#ffffff' : '#000000'} strokeWidth={2.4} />
        </TouchableOpacity>
      </View>
      </SafeAreaView>
    </AmbientBackground>
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
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8
  },
  permBtnText: {
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 4
  },
  continueBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center'
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '800',
    marginRight: 8
  }
});
