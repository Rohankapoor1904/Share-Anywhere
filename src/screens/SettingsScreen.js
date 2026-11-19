import React, { useState } from 'react';
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
import Icon from '../components/Icon';
import { useTheme } from '../theme';
import GlassCard from '../components/GlassCard';
import { formatBytes } from '../utils/byteFormat';

export default function SettingsScreen() {
  const {
    settings,
    updateSettings,
    selfDevice,
    autoReconnect,
    toggleAutoReconnect,
    liveClipboardEnabled,
    toggleLiveClipboard
  } = useLocalShare();
  const { theme, themeId, setThemeId, availableThemes } = useTheme();
  const [showDiagnostics, setShowDiagnostics] = useState(false);

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
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Settings & Customization</Text>
          <Text style={[styles.headerSubtitle, { color: theme.colors.textSecondary }]}>
            Personalize themes, live ecosystem sync, security policies, and diagnostics.
          </Text>
        </View>

        {/* Live Ecosystem & Automation Card */}
        <GlassCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Live Ecosystem & Sync</Text>
          <Text style={[styles.sectionSubtitle, { color: theme.colors.textSecondary }]}>
            Automatic background linking and seamless clipboard continuity.
          </Text>

          <View style={styles.settingRow}>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>Auto-Reconnect to Trusted Devices</Text>
              <Text style={[styles.settingDesc, { color: theme.colors.textSecondary }]}>
                Automatically connect to your paired PC when spotted on the same Wi-Fi network.
              </Text>
            </View>
            <Switch
              value={!!autoReconnect}
              onValueChange={toggleAutoReconnect}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor={autoReconnect ? '#ffffff' : theme.colors.textMuted}
            />
          </View>

          <View style={[styles.settingRow, styles.borderTop, { borderTopColor: theme.colors.border }]}>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>Live Clipboard Auto-Sync</Text>
              <Text style={[styles.settingDesc, { color: theme.colors.textSecondary }]}>
                Seamlessly mirror copied text between Phone and PC with echo loop suppression.
              </Text>
            </View>
            <Switch
              value={!!liveClipboardEnabled}
              onValueChange={toggleLiveClipboard}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor={liveClipboardEnabled ? '#ffffff' : theme.colors.textMuted}
            />
          </View>
        </GlassCard>

        {/* Theme & Appearance Card */}
        <GlassCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Appearance & Theme</Text>
          <Text style={[styles.sectionSubtitle, { color: theme.colors.textSecondary }]}>
            Select a tailored high-contrast palette. Changes apply instantly.
          </Text>

          <View style={styles.themeGrid}>
            {availableThemes.map((item) => {
              const isSelected = item.id === themeId;
              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.75}
                  style={[
                    styles.themeCard,
                    {
                      backgroundColor: item.colors.surface,
                      borderColor: isSelected ? item.colors.primary : theme.colors.border,
                      borderWidth: isSelected ? 2 : 1
                    }
                  ]}
                  onPress={() => setThemeId(item.id)}
                  testID={`theme-option-${item.id}`}
                >
                  <View style={styles.themeCardTop}>
                    <View style={styles.themeNameRow}>
                      <Text style={[styles.themeCardName, { color: item.colors.text }]}>
                        {item.name}
                      </Text>
                      {isSelected ? (
                        <View style={[styles.selectedPill, { backgroundColor: item.colors.primary }]}>
                          <Icon name="check" size={10} color={item.mode === 'light' ? '#ffffff' : '#000000'} strokeWidth={3.2} />
                          <Text style={[styles.selectedPillText, { color: item.mode === 'light' ? '#ffffff' : '#000000' }]}>
                            Active
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[styles.themeCardDesc, { color: item.colors.textSecondary }]}>
                      {item.description}
                    </Text>
                  </View>

                  {/* Swatch preview dots */}
                  <View style={styles.swatchRow}>
                    <View style={[styles.swatchDot, { backgroundColor: item.colors.background, borderColor: item.colors.border }]} />
                    <View style={[styles.swatchDot, { backgroundColor: item.colors.cardSolid, borderColor: item.colors.border }]} />
                    <View style={[styles.swatchDot, { backgroundColor: item.colors.primary, borderColor: item.colors.border }]} />
                    <View style={[styles.swatchDot, { backgroundColor: item.colors.accent, borderColor: item.colors.border }]} />
                    <View style={[styles.swatchDot, { backgroundColor: item.colors.success, borderColor: item.colors.border }]} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </GlassCard>

        {/* Pairing & Security Card */}
        <GlassCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Security & Pairing</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>Auto-Accept Trusted Devices</Text>
              <Text style={[styles.settingDesc, { color: theme.colors.textSecondary }]}>
                Accept transfers automatically from previously paired devices without PIN challenge.
              </Text>
            </View>
            <Switch
              value={!!settings.autoAcceptTrusted}
              onValueChange={handleToggleAutoAcceptTrusted}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor={settings.autoAcceptTrusted ? '#ffffff' : theme.colors.textMuted}
            />
          </View>

          <View style={[styles.settingRow, styles.borderTop, { borderTopColor: theme.colors.border }]}>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>Auto-Accept All Nearby Devices</Text>
              <Text style={[styles.settingDesc, { color: theme.colors.textSecondary }]}>
                Allow any device on LAN to transfer files without PIN verification (Low Security).
              </Text>
            </View>
            <Switch
              value={!!settings.autoAcceptAll}
              onValueChange={handleToggleAutoAcceptAll}
              trackColor={{ false: theme.colors.border, true: theme.colors.danger }}
              thumbColor={settings.autoAcceptAll ? '#ffffff' : theme.colors.textMuted}
            />
          </View>
        </GlassCard>

        {/* Performance & Protocol Card */}
        <GlassCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Transfer & Performance</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>Chunk Streaming Size</Text>
              <Text style={[styles.settingDesc, { color: theme.colors.textSecondary }]}>
                Size of individual streaming chunks transferred over TLS sockets.
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.pillBtn, { backgroundColor: theme.colors.primaryGlow, borderColor: theme.colors.primary }]}
              onPress={cycleChunkSize}
            >
              <Text style={[styles.pillBtnText, { color: theme.colors.primary }]}>
                {formatBytes(settings.chunkSize || 1024 * 1024)}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.settingRow, styles.borderTop, { borderTopColor: theme.colors.border }]}>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>Low-Power Mode</Text>
              <Text style={[styles.settingDesc, { color: theme.colors.textSecondary }]}>
                Throttles radar sweep rate and discovery frequency to maximize battery life.
              </Text>
            </View>
            <Switch
              value={!!settings.lowPowerMode}
              onValueChange={handleToggleLowPower}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor={settings.lowPowerMode ? '#ffffff' : theme.colors.textMuted}
            />
          </View>
        </GlassCard>

        {/* Collapsible Advanced Diagnostics Card */}
        <GlassCard style={styles.card}>
          <TouchableOpacity
            style={styles.diagnosticsHeader}
            onPress={() => setShowDiagnostics((prev) => !prev)}
            activeOpacity={0.7}
          >
            <View style={styles.diagnosticsHeaderLeft}>
              <Text style={[styles.sectionTitle, { color: theme.colors.primary, marginBottom: 0 }]}>
                Advanced & Diagnostics
              </Text>
              <Text style={[styles.diagnosticsSub, { color: theme.colors.textSecondary }]}>
                Hardware ports, device IDs, and engine details
              </Text>
            </View>
            <Icon
              name="arrow-down"
              size={16}
              color={theme.colors.primary}
              strokeWidth={2.4}
              style={{ transform: [{ rotate: showDiagnostics ? '180deg' : '0deg' }] }}
            />
          </TouchableOpacity>

          {showDiagnostics ? (
            <View style={styles.diagnosticsBody}>
              <View style={styles.infoRow}>
                <Text style={[styles.infoKey, { color: theme.colors.textSecondary }]}>Device Name</Text>
                <Text style={[styles.infoVal, { color: theme.colors.text }]}>{selfDevice.displayName}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={[styles.infoKey, { color: theme.colors.textSecondary }]}>Device ID</Text>
                <Text style={[styles.infoVal, { color: theme.colors.text }]}>{selfDevice.deviceId}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={[styles.infoKey, { color: theme.colors.textSecondary }]}>Direct TLS Port</Text>
                <Text style={[styles.infoVal, { color: theme.colors.text }]}>{selfDevice.port}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={[styles.infoKey, { color: theme.colors.textSecondary }]}>LocalSend Interop Port</Text>
                <Text style={[styles.infoVal, { color: theme.colors.text }]}>53317</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={[styles.infoKey, { color: theme.colors.textSecondary }]}>Engine Version</Text>
                <Text style={[styles.infoVal, { color: theme.colors.primary }]}>v1.2.84</Text>
              </View>
            </View>
          ) : null}
        </GlassCard>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1
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
    fontWeight: '800'
  },
  headerSubtitle: {
    fontSize: 13,
    marginTop: 3,
    lineHeight: 18
  },
  card: {
    marginBottom: 16
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4
  },
  sectionSubtitle: {
    fontSize: 12,
    marginBottom: 14,
    lineHeight: 16
  },
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between'
  },
  themeCard: {
    width: '48%',
    padding: 12,
    borderRadius: 14,
    marginBottom: 12,
    justifyContent: 'space-between'
  },
  themeCardTop: {
    marginBottom: 10
  },
  themeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  themeCardName: {
    fontSize: 13,
    fontWeight: '800'
  },
  selectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 3
  },
  selectedPillText: {
    fontSize: 9,
    fontWeight: '800'
  },
  themeCardDesc: {
    fontSize: 11,
    lineHeight: 14
  },
  swatchRow: {
    flexDirection: 'row',
    gap: 5
  },
  swatchDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10
  },
  borderTop: {
    borderTopWidth: 1,
    marginTop: 4
  },
  settingTextContainer: {
    flex: 1,
    marginRight: 16
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '700'
  },
  settingDesc: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16
  },
  pillBtn: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12
  },
  pillBtnText: {
    fontSize: 12,
    fontWeight: '800'
  },
  diagnosticsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  diagnosticsHeaderLeft: {
    flex: 1
  },
  diagnosticsSub: {
    fontSize: 12,
    marginTop: 2
  },
  diagnosticsBody: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)'
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)'
  },
  infoKey: {
    fontSize: 13
  },
  infoVal: {
    fontSize: 13,
    fontWeight: '700'
  }
});
