import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';

/**
 * Fluid top-of-screen toast alert banner inspired by Apple Continuity & O+ Connect.
 * @param {object} props
 * @param {string | null} props.message
 * @param {() => void} [props.onDismiss]
 */
export default function ToastBanner({ message, onDismiss }) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!message) {
      anim.setValue(0);
      return;
    }

    Animated.spring(anim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 8,
      tension: 100
    }).start();

    const timer = setTimeout(() => {
      Animated.timing(anim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true
      }).start(() => {
        if (onDismiss) onDismiss();
      });
    }, 3200);

    return () => clearTimeout(timer);
  }, [message, anim, onDismiss]);

  if (!message) return null;

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-60, 0]
  });

  const AnimatedView = /** @type {any} */ (Animated.View);

  return (
    <AnimatedView
      pointerEvents="none"
      style={[
        styles.container,
        {
          top: Math.max(insets.top, 12) + 8,
          backgroundColor: theme.mode === 'light' ? '#ffffff' : '#141824',
          borderColor: theme.colors.borderHighlight || 'rgba(255,255,255,0.12)',
          shadowColor: '#000000',
          opacity: anim,
          transform: [{ translateY }]
        }
      ]}
    >
      <View style={[styles.dot, { backgroundColor: theme.colors.success || '#10b981' }]} />
      <Text style={[styles.text, { color: theme.colors.text }]} numberOfLines={1}>
        {message}
      </Text>
    </AnimatedView>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 99999,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 24,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 20,
    maxWidth: '90%'
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2
  }
});
