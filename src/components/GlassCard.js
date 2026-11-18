import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

/**
 * Modern themed glass card container with subtle highlights and depth.
 * @param {object} props
 * @param {React.ReactNode} [props.children]
 * @param {import('react-native').StyleProp<import('react-native').ViewStyle>} [props.style]
 * @param {'default' | 'interactive' | 'highlighted' | 'solid' | 'accent'} [props.variant='default']
 * @param {() => void} [props.onPress]
 * @param {string} [props.testID]
 */
export default function GlassCard({ children, style, variant = 'default', onPress, testID, ...rest }) {
  const { theme } = useTheme();

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

  const cardStyle = [
    styles.card,
    {
      borderRadius: theme.radii.lg,
      padding: theme.spacing.lg
    },
    getVariantStyle(),
    style
  ];

  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={onPress}
        style={cardStyle}
        testID={testID}
        accessibilityRole="button"
        {...rest}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return (
    <View style={cardStyle} testID={testID} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    overflow: 'hidden'
  }
});
