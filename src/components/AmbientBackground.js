import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

/**
 * Screen background. Previously drew coloured radial glows; it is now a plain
 * themed surface so content carries the screen. The `intense` prop is kept
 * for existing callers and has no effect.
 * @param {object} props
 * @param {React.ReactNode} [props.children]
 * @param {boolean} [props.intense=false]
 */
export default function AmbientBackground({ children, intense: _intense = false }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  }
});
