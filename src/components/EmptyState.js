import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from './Icon';
import { useTheme } from '../theme';

/**
 * Empty state: a small neutral icon tile, a short title and one line of help.
 * @param {object} props
 * @param {string} props.title - Headline message.
 * @param {string} props.description - Explanatory subtitle.
 * @param {React.ReactNode} [props.icon] - Optional icon or illustration.
 * @param {string} [props.iconName='radar'] - Vector icon shown when no custom icon is supplied.
 * @param {React.ReactNode} [props.action] - Optional action button.
 */
export default function EmptyState({ title, description, icon, iconName = 'radar', action }) {
  const { theme } = useTheme();

  return (
    <View style={styles.container} testID="empty-state-container">
      <View style={[styles.iconContainer, { backgroundColor: theme.colors.fill }]}>
        {icon || <Icon name={iconName} size={22} color={theme.colors.textSecondary} strokeWidth={1.8} />}
      </View>
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      {description ? (
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>
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
    paddingHorizontal: 32,
    paddingVertical: 40
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
    textAlign: 'center',
    marginBottom: 6
  },
  description: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 300
  },
  actionContainer: {
    marginTop: 20
  }
});
