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
import Icon from '../components/Icon';
import { useTheme } from '../theme';
import GlassCard from '../components/GlassCard';
import { formatBytes } from '../utils/byteFormat';

export default function SettingsScreen() {
  const { settings, updateSettings, selfDevice } = useLocalShare();
  const { theme, themeId, setThemeId, availableThemes } = useTheme();

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
            Personalize themes, security policies, and network performance.
          </Text>
        </View>

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

        {/* Device & Identity Info Card */}
        <GlassCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Identity Information</Text>
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
            <Text style={[styles.infoKey, { color: theme.colors.textSecondary }]}>LocalSend Port</Text>
            <Text style={[styles.infoVal, { color: theme.colors.text }]}>53317</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoKey, { color: theme.colors.textSecondary }]}>Engine Version</Text>
            <Text style={[styles.infoVal, { color: theme.colors.primary }]}>v1.2.84</Text>
          </View>
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
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    justifyContent: 'space-between'
  },
  themeCardTop: {
    marginBottom: 8
  },
  themeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  themeCardName: {
    fontSize: 13,
    fontWeight: '700'
  },
  selectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6
  },
  selectedPillText: {
    marginLeft: 3,
    fontSize: 9,
    fontWeight: '800'
  },
  themeCardDesc: {
    fontSize: 11,
    lineHeight: 14
  },
  swatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6
  },
  swatchDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    marginRight: 4
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12
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
    fontSize: 15,
    fontWeight: '600'
  },
  settingDesc: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 18
  },
  pillBtn: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14
  },
  pillBtnText: {
    fontSize: 13,
    fontWeight: '800'
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7
  },
  infoKey: {
    fontSize: 13
  },
  infoVal: {
    fontSize: 13,
    fontWeight: '600'
  }
});
