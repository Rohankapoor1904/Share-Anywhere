import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * Clean EmptyState component used when no items exist.
 * @param {object} props
 * @param {string} props.title - Headline message.
 * @param {string} props.description - Explanatory subtitle.
 * @param {React.ReactNode} [props.icon] - Optional icon or illustration.
 * @param {React.ReactNode} [props.action] - Optional action button.
 */
export default function EmptyState({ title, description, icon, action }) {
  return (
    <View style={styles.container} testID="empty-state-container">
      {icon ? <View style={styles.iconContainer}>{icon}</View> : null}
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {action ? <View style={styles.actionContainer}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  iconContainer: {
    marginBottom: 16
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
    textAlign: 'center',
    marginBottom: 8
  },
  description: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 20
  },
  actionContainer: {
    marginTop: 20
  }
});
