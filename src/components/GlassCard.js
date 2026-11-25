import React, { useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

const AnimatedView = /** @type {any} */ (Animated.View);
const AnimatedPressable = /** @type {any} */ (Animated.createAnimatedComponent(Pressable));

const PRESS_SCALE = 0.985;

/**
 * Flat card surface: card background, hairline border, continuous corners.
 * (The name is kept for existing imports; it no longer draws glass effects.)
 * @param {object} props
 * @param {React.ReactNode} [props.children]
 * @param {import('react-native').StyleProp<import('react-native').ViewStyle>} [props.style]
 * @param {'default' | 'interactive' | 'highlighted' | 'solid' | 'accent'} [props.variant='default']
 * @param {() => void} [props.onPress]
 * @param {string} [props.testID]
 */
export default function GlassCard({ children, style, variant = 'default', onPress, testID, ...rest }) {
  const { theme } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (toValue) => {
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      friction: 8,
      tension: 220
    }).start();
  };

  // 'highlighted' marks a selected/active card with a stronger border only.
  const borderColor = variant === 'highlighted' ? theme.colors.borderHighlight : theme.colors.border;

  const cardStyle = [
    styles.card,
    {
      backgroundColor: theme.colors.card,
      borderColor,
      borderRadius: theme.radii.lg,
      padding: theme.spacing.lg
    },
    style
  ];

  if (onPress) {
    return (
      <AnimatedPressable
        onPress={onPress}
        onPressIn={() => animateTo(PRESS_SCALE)}
        onPressOut={() => animateTo(1)}
        style={[cardStyle, { transform: [{ scale }] }]}
        testID={testID}
        accessibilityRole="button"
        {...rest}
      >
        {children}
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedView style={cardStyle} testID={testID} {...rest}>
      {children}
    </AnimatedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
    overflow: 'hidden'
  }
});
