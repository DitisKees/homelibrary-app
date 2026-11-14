import React from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';

// Wrap the entire authenticated navigator so headers and tabs are included in
// the measured viewport. Individual screens must not subtract header height again.
export default function KeyboardViewport({ children }: React.PropsWithChildren) {
  return (
    <KeyboardAvoidingView testID="authenticated-keyboard" style={styles.viewport}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {children}
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({ viewport: { flex: 1 } });
