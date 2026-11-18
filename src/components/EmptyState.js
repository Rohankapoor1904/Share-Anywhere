import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

/**
 * Clean themed EmptyState component used when no items exist.
 * @param {object} props
 * @param {string} props.title - Headline message.
 * @param {string} props.description - Explanatory subtitle.
 * @param {React.ReactNode} [props.icon] - Optional icon or illustration.
 * @param {React.ReactNode} [props.action] - Optional action button.
 */
export default function EmptyState({ title, description, icon, action }) {
  const { theme } = useTheme();

  return (
    <View style={styles.container} testID="empty-state-container">
      <View
        style={[
          styles.iconContainer,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.borderHighlight
          }
        ]}
      >
        {icon || <Text style={styles.defaultIconGlyph}>📡</Text>}
      </View>
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      {description ? (
        <Text style={[styles.description, { color: theme.colors.textSecondary }]}>
          {description}
        </Text>
      ) : null}
      {action ? <View style={styles.actionContainer}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16
  },
  defaultIconGlyph: {
    fontSize: 28
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8
  },
  description: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20
  },
  actionContainer: {
    marginTop: 20
  }
});
