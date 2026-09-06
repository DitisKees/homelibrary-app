import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import AppButton from '@/components/AppButton';

type ScreenStateProps = {
  title?: string;
  message: string;
  loading?: boolean;
  error?: boolean;
  actionLabel?: string;
  onAction?: () => void;
};

export default function ScreenState({
  title,
  message,
  loading = false,
  error = false,
  actionLabel,
  onAction,
}: ScreenStateProps) {
  return (
    <View
      style={styles.container}
      accessibilityRole={error ? 'alert' : undefined}
      accessibilityLiveRegion={error ? 'assertive' : 'polite'}
    >
      {loading && <ActivityIndicator accessibilityLabel={message} />}
      {!!title && <Text style={styles.title}>{title}</Text>}
      <Text style={styles.message}>{message}</Text>
      {!!actionLabel && !!onAction && (
        <AppButton label={actionLabel} onPress={onAction} variant="secondary" style={styles.action} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    color: '#111827',
  },
  message: {
    maxWidth: 520,
    fontSize: 14,
    lineHeight: 20,
    color: '#6b7280',
    textAlign: 'center',
  },
  action: { marginTop: 2 },
});
