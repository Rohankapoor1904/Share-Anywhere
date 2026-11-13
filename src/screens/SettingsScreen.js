import React from 'react';
import {
  View,
  Text,
  Switch,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView
} from 'react-native';
import { useLocalShare } from '../engine/providers';
import GlassCard from '../components/GlassCard';
import { formatBytes } from '../utils/byteFormat';

export default function SettingsScreen() {
  const { settings, updateSettings, selfDevice } = useLocalShare();

  const handleToggleAutoAcceptTrusted = (val) => {
    updateSettings({ autoAcceptTrusted: val });
  };

  const handleToggleAutoAcceptAll = (val) => {
    updateSettings({ autoAcceptAll: val });
  };

  const handleToggleLowPower = (val) => {
    updateSettings({ lowPowerMode: val });
  };

  const cycleChunkSize = () => {
    const sizes = [1024 * 1024, 2 * 1024 * 1024, 4 * 1024 * 1024, 8 * 1024 * 1024, 16 * 1024 * 1024];
    const currentIndex = sizes.indexOf(settings.chunkSize || 1024 * 1024);
    const nextIndex = (currentIndex + 1) % sizes.length;
    updateSettings({ chunkSize: sizes[nextIndex] });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settings</Text>
          <Text style={styles.headerSubtitle}>Configure security policies and network performance.</Text>
        </View>

        {/* Pairing & Security Card */}
        <GlassCard style={styles.card}>
          <Text style={styles.sectionTitle}>Security & Pairing</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingLabel}>Auto-Accept Trusted Devices</Text>
              <Text style={styles.settingDesc}>
                Accept transfers automatically from previously paired devices without PIN challenge.
              </Text>
            </View>
            <Switch
              value={!!settings.autoAcceptTrusted}
              onValueChange={handleToggleAutoAcceptTrusted}
              trackColor={{ false: '#334155', true: '#3b82f6' }}
              thumbColor={settings.autoAcceptTrusted ? '#ffffff' : '#94a3b8'}
            />
          </View>

          <View style={[styles.settingRow, styles.borderTop]}>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingLabel}>Auto-Accept All Nearby Devices</Text>
              <Text style={styles.settingDesc}>
                Allow any device on LAN to transfer files without PIN verification (Low Security).
              </Text>
            </View>
            <Switch
              value={!!settings.autoAcceptAll}
              onValueChange={handleToggleAutoAcceptAll}
              trackColor={{ false: '#334155', true: '#ef4444' }}
              thumbColor={settings.autoAcceptAll ? '#ffffff' : '#94a3b8'}
            />
          </View>
        </GlassCard>

        {/* Performance & Protocol Card */}
        <GlassCard style={styles.card}>
          <Text style={styles.sectionTitle}>Transfer & Performance</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingLabel}>Chunk Size</Text>
              <Text style={styles.settingDesc}>Size of individual streaming chunks transferred over TLS.</Text>
            </View>
            <TouchableOpacity style={styles.pillBtn} onPress={cycleChunkSize}>
              <Text style={styles.pillBtnText}>{formatBytes(settings.chunkSize || 1024 * 1024)}</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.settingRow, styles.borderTop]}>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingLabel}>Low-Power Mode</Text>
              <Text style={styles.settingDesc}>Reduces radar sweep rate and discovery frequency to save battery.</Text>
            </View>
            <Switch
              value={!!settings.lowPowerMode}
              onValueChange={handleToggleLowPower}
              trackColor={{ false: '#334155', true: '#3b82f6' }}
              thumbColor={settings.lowPowerMode ? '#ffffff' : '#94a3b8'}
            />
          </View>
        </GlassCard>

        {/* Device & Identity Info Card */}
        <GlassCard style={styles.card}>
          <Text style={styles.sectionTitle}>Identity Information</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Device ID</Text>
            <Text style={styles.infoVal}>{selfDevice.deviceId}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>TLS Port</Text>
            <Text style={styles.infoVal}>{selfDevice.port}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>LocalSend Port</Text>
            <Text style={styles.infoVal}>53317</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>App Version</Text>
            <Text style={styles.infoVal}>1.2.84</Text>
          </View>
        </GlassCard>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a'
  },
  container: {
    padding: 16,
    flexGrow: 1
  },
  header: {
    marginBottom: 16
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#f8fafc'
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 2
  },
  card: {
    marginBottom: 16
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#38bdf8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10
  },
  borderTop: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    marginTop: 6
  },
  settingTextContainer: {
    flex: 1,
    marginRight: 16
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f8fafc'
  },
  settingDesc: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
    lineHeight: 18
  },
  pillBtn: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderWidth: 1,
    borderColor: '#3b82f6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16
  },
  pillBtnText: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '700'
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6
  },
  infoKey: {
    fontSize: 13,
    color: '#94a3b8'
  },
  infoVal: {
    fontSize: 13,
    color: '#f8fafc',
    fontWeight: '500'
  }
});
