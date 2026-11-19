import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

/**
 * Soft ambient radial glows rendered behind screen content so no screen reads
 * as a flat, single-colour rectangle. Purely decorative and non-interactive.
 * @param {object} props
 * @param {React.ReactNode} [props.children]
 * @param {boolean} [props.intense=false] - Increase orb opacity for hero screens (radar, share).
 */
export default function AmbientBackground({ children, intense = false }) {
  const { theme } = useTheme();
  const primaryOrbOpacity = intense ? 1 : 0.75;
  const accentOrbOpacity = intense ? 0.9 : 0.6;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View
        pointerEvents="none"
        style={[
          styles.orb,
          styles.topRightOrb,
          {
            backgroundColor: theme.colors.primaryGlow,
            opacity: primaryOrbOpacity,
            shadowColor: theme.colors.primary
          }
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.orb,
          styles.bottomLeftOrb,
          {
            backgroundColor: theme.colors.accentGlow,
            opacity: accentOrbOpacity,
            shadowColor: theme.colors.accent
          }
        ]}
      />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  orb: {
    position: 'absolute',
    borderRadius: 9999,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 90
  },
  topRightOrb: {
    top: -140,
    right: -110,
    width: 300,
    height: 300
  },
  bottomLeftOrb: {
    bottom: -150,
    left: -120,
    width: 320,
    height: 320
  },
  content: {
    flex: 1
  }
});
