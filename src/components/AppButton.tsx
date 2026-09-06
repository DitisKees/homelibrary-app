import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type AppButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

type AppButtonProps = {
  label: string;
  onPress: () => void;
  variant?: AppButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export default function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  loadingLabel,
  accessibilityLabel,
  style,
}: AppButtonProps) {
  const unavailable = disabled || loading;
  const labelStyle = variant === 'primary' || variant === 'danger' ? styles.lightText : styles.darkText;
  const spinnerColor = variant === 'primary' || variant === 'danger' ? '#fff' : '#1f2937';

  return (
    <Pressable
      onPress={onPress}
      disabled={unavailable}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: unavailable, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        pressed && !unavailable && styles.pressed,
        unavailable && styles.disabled,
        style,
      ]}
    >
      {loading && <ActivityIndicator size="small" color={spinnerColor} />}
      <Text style={[styles.label, labelStyle]}>{loading ? loadingLabel ?? label : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  primary: {
    backgroundColor: '#1f6feb',
    borderColor: '#1f6feb',
  },
  secondary: {
    backgroundColor: '#fff',
    borderColor: '#6b7280',
  },
  danger: {
    backgroundColor: '#b00020',
    borderColor: '#b00020',
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  lightText: { color: '#fff' },
  darkText: { color: '#1f2937' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.5 },
});
