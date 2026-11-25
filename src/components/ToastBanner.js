import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';

const AnimatedView = /** @type {any} */ (Animated.View);

/**
 * Small toast that slides in under the status bar and fades out after ~3 s.
 * Rendered in the inverse of the theme (dark on light, light on dark) so it
 * reads clearly over any screen.
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
      return undefined;
    }

    Animated.spring(anim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 9,
      tension: 120
    }).start();

    const timer = setTimeout(() => {
      Animated.timing(anim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true
      }).start(() => {
        if (onDismiss) onDismiss();
      });
    }, 3000);

    return () => clearTimeout(timer);
  }, [message, anim, onDismiss]);

  if (!message) return null;

  const isLight = theme.mode === 'light';
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] });
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] });

  return (
    <AnimatedView
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[
        styles.container,
        {
          top: Math.max(insets.top, 12) + 6,
          backgroundColor: isLight ? '#18181b' : '#f2f2f4',
          opacity: anim,
          transform: [{ translateY }, { scale }]
        }
      ]}
    >
      <Text style={[styles.text, { color: isLight ? '#fafafa' : '#18181b' }]} numberOfLines={2}>
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
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderCurve: 'continuous',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
    maxWidth: '88%'
  },
  text: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center'
  }
});
