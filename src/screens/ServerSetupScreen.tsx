import React from 'react';
import { KeyboardAvoidingView, Linking, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import AppButton from '@/components/AppButton';
import { useAuth } from '@/context/AuthContext';
import { EndpointConfigurationError, testPocketBaseEndpoint } from '@/services/settings/pocketbase';

const SELF_HOSTING_URL = 'https://github.com/DitisKees/homelibrary-app/blob/main/docs/self-hosting.md';

export default function ServerSetupScreen() {
  const { t } = useTranslation();
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
      if (!(saveError instanceof EndpointConfigurationError)) {
        setError(t('server.errors.testFailed'));
      } else {
        setError(t(`server.errors.${saveError.code}`));
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>{t('server.setup.title')}</Text>
        <Text style={styles.help}>{t('server.setup.help')}</Text>
        <Text
          accessibilityRole="link"
          style={styles.link}
          onPress={() => void Linking.openURL(SELF_HOSTING_URL)}
        >
          {t('server.setup.selfHost')}
        </Text>
        <TextInput
          value={endpoint}
          onChangeText={setEndpoint}
          editable={!isSaving}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://books.example.com"
          accessibilityLabel={t('server.setup.urlLabel')}
          style={styles.input}
        />
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <AppButton
          label={t('server.setup.save')}
          loadingLabel={t('server.setup.testing')}
          loading={isSaving}
          onPress={() => void save()}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#f3f4f6' },
  card: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 16, padding: 24, borderRadius: 14, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '700', color: '#111827' },
  help: { fontSize: 15, lineHeight: 22, color: '#4b5563' },
  link: { fontSize: 15, lineHeight: 22, color: '#1d4ed8', textDecorationLine: 'underline' },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#9ca3af', borderRadius: 8, paddingHorizontal: 12, fontSize: 16 },
  error: { color: '#b00020', lineHeight: 20 },
});
