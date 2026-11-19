import React, { useRef } from 'react';
import { View, Animated, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

const AnimatedView = /** @type {any} */ (Animated.View);
const AnimatedPressable = /** @type {any} */ (Animated.createAnimatedComponent(Pressable));

const PRESS_SCALE = 0.975;

/**
 * Modern themed glass card with layered depth, refraction highlight and
 * spring-driven press physics.
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
      friction: 7,
      tension: 140
    }).start();
  };

  const getVariantStyle = () => {
    switch (variant) {
      case 'interactive':
        return {
          backgroundColor: theme.colors.cardInteractive,
          borderColor: theme.colors.border
        };
      case 'highlighted':
        return {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.borderHighlight,
          borderWidth: 1.5,
          shadowColor: theme.colors.primary,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 8,
          elevation: 4
        };
      case 'solid':
        return {
          backgroundColor: theme.colors.cardSolid,
          borderColor: theme.colors.border
        };
      case 'accent':
        return {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.accentGlow
        };
      case 'default':
      default:
        return {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border
        };
    }
  };

  const isGlowing = variant === 'highlighted' || variant === 'interactive';

  const cardStyle = [
    styles.card,
    {
      borderRadius: theme.radii.lg,
      padding: theme.spacing.lg
    },
    getVariantStyle(),
    style
  ];

  const highlightColor = theme.mode === 'light'
    ? 'rgba(255, 255, 255, 0.7)'
    : 'rgba(255, 255, 255, 0.14)';

  const decorations = (
    <>
      {/* Top refraction edge simulating frosted glass catching light */}
      <View
        pointerEvents="none"
        style={[styles.topHighlight, { backgroundColor: highlightColor }]}
      />
      {/* Corner accent glow for interactive/highlighted cards */}
      {isGlowing ? (
        <View
          pointerEvents="none"
          style={[
            styles.cornerGlow,
            {
              backgroundColor: theme.colors.primaryGlow,
              shadowColor: theme.colors.primary
            }
          ]}
        />
      ) : null}
    </>
  );

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
        {decorations}
        {children}
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedView style={cardStyle} testID={testID} {...rest}>
      {decorations}
      {children}
    </AnimatedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    overflow: 'hidden'
  },
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1
  },
  cornerGlow: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 140,
    height: 140,
    borderRadius: 70,
    opacity: 0.55,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 40
  }
});
