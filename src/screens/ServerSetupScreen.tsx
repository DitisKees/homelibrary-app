import React from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import AppButton from '@/components/AppButton';
import { useAuth } from '@/context/AuthContext';
import { EndpointConfigurationError, testPocketBaseEndpoint } from '@/services/settings/pocketbase';

function endpointError(error: unknown): string {
  if (!(error instanceof EndpointConfigurationError)) return 'Unable to test this server. Try again.';
  if (error.code === 'invalidUrl') return 'Enter a valid http:// or https:// server URL.';
  if (error.code === 'unreachable') return 'This server could not be reached. Check the URL and connection.';
  return 'The server responded unexpectedly. Check that it is a PocketBase server.';
}

export default function ServerSetupScreen() {
  const { changeEndpoint } = useAuth();
  const [endpoint, setEndpoint] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string>();

  const save = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setError(undefined);
    try {
      const testedEndpoint = await testPocketBaseEndpoint(endpoint);
      await changeEndpoint(testedEndpoint);
    } catch (saveError) {
      setError(endpointError(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>Connect to your library server</Text>
        <Text style={styles.help}>Enter the URL of the PocketBase server that hosts your Home Library.</Text>
        <TextInput
          value={endpoint}
          onChangeText={setEndpoint}
          editable={!isSaving}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://books.example.com"
          accessibilityLabel="PocketBase server URL"
          style={styles.input}
        />
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <AppButton label="Test and save server" loadingLabel="Testing server…" loading={isSaving} onPress={() => void save()} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#f3f4f6' },
  card: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 16, padding: 24, borderRadius: 14, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '700', color: '#111827' },
  help: { fontSize: 15, lineHeight: 22, color: '#4b5563' },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#9ca3af', borderRadius: 8, paddingHorizontal: 12, fontSize: 16 },
  error: { color: '#b00020', lineHeight: 20 },
});
