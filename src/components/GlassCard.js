import React from 'react';
import { View, StyleSheet } from 'react-native';

/**
 * Modern translucent card container with subtle border highlights.
 * @param {object} props
 * @param {React.ReactNode} [props.children]
 * @param {import('react-native').ViewStyle} [props.style]
 */
export default function GlassCard({ children, style }) {
  return (
    <View style={[styles.card, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(30, 41, 59, 0.75)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden'
  }
});
