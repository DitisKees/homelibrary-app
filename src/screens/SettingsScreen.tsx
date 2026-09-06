import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import AppButton from '@/components/AppButton';
import { supportedLanguages, useLanguage, type SupportedLocale } from '@/i18n';
import { useAuth } from '@/context/AuthContext';
import { EndpointConfigurationError, getBuildTimePocketBaseEndpoint, testPocketBaseEndpoint } from '@/services/settings/pocketbase';
import {
  clearGoogleBooksApiKey,
  getGoogleBooksApiKey,
  setGoogleBooksApiKey,
} from '@/services/settings/googleBooks';

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const { endpoint, changeEndpoint, resetEndpoint } = useAuth();
  const [apiKey, setApiKey] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isChangingLanguage, setIsChangingLanguage] = React.useState(false);
  const [message, setMessage] = React.useState<string | undefined>();
  const [error, setError] = React.useState<string | undefined>();
  const [serverEndpoint, setServerEndpoint] = React.useState(endpoint ?? '');
  const [isSavingServer, setIsSavingServer] = React.useState(false);
  const [serverMessage, setServerMessage] = React.useState<string | undefined>();
  const [serverError, setServerError] = React.useState<string | undefined>();

  React.useEffect(() => {
    let active = true;
    void getGoogleBooksApiKey()
      .then((key) => {
        if (active) setApiKey(key ?? '');
      })
      .catch((loadError: unknown) => {
        if (active) setError(errorMessage(loadError, t('settings.updateError')));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

  const changeLanguage = React.useCallback(
    async (nextLanguage: SupportedLocale) => {
      if (nextLanguage === language || isChangingLanguage) return;
      setIsChangingLanguage(true);
      setError(undefined);
      setMessage(undefined);
      try {
        await setLanguage(nextLanguage);
      } catch (languageError) {
        setError(errorMessage(languageError, t('settings.updateError')));
      } finally {
        setIsChangingLanguage(false);
      }
    },
    [isChangingLanguage, language, setLanguage, t]
  );

  const save = React.useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const normalized = apiKey.trim();
      await setGoogleBooksApiKey(normalized);
      setApiKey(normalized);
      setMessage(normalized ? t('settings.keySaved') : t('settings.keyCleared'));
    } catch (saveError) {
      setError(errorMessage(saveError, t('settings.updateError')));
    } finally {
      setIsSaving(false);
    }
  }, [apiKey, isSaving, t]);

  const clear = React.useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await clearGoogleBooksApiKey();
      setApiKey('');
      setMessage(t('settings.keyCleared'));
    } catch (clearError) {
      setError(errorMessage(clearError, t('settings.updateError')));
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, t]);

  const saveServer = React.useCallback(async () => {
    if (isSavingServer) return;
    setIsSavingServer(true);
    setServerMessage(undefined);
    setServerError(undefined);
    try {
      const testedEndpoint = await testPocketBaseEndpoint(serverEndpoint);
      await changeEndpoint(testedEndpoint);
    } catch (saveError) {
      if (saveError instanceof EndpointConfigurationError) {
        setServerError(
          saveError.code === 'invalidUrl'
            ? 'Enter a valid http:// or https:// server URL.'
            : saveError.code === 'unreachable'
              ? 'This server could not be reached. Check the URL and connection.'
              : 'The server responded unexpectedly. Check that it is a PocketBase server.'
        );
      } else {
        setServerError('Unable to update the server. Try again.');
      }
    } finally {
      setIsSavingServer(false);
    }
  }, [changeEndpoint, isSavingServer, serverEndpoint]);

  const resetServer = React.useCallback(async () => {
    if (isSavingServer) return;
    setIsSavingServer(true);
    setServerMessage(undefined);
    setServerError(undefined);
    try {
      await resetEndpoint();
      setServerMessage('Server reset to the deployment default. Please sign in again.');
    } catch {
      setServerError('Unable to reset the server. Try again.');
    } finally {
      setIsSavingServer(false);
    }
  }, [isSavingServer, resetEndpoint]);

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.section}>
        <Text style={styles.heading}>Library server</Text>
        <Text style={styles.help}>Change the PocketBase server used by this app. Changing servers signs you out and clears data from the previous server.</Text>
        <Text style={styles.label}>PocketBase server URL</Text>
        <TextInput
          value={serverEndpoint}
          onChangeText={(value) => {
            setServerEndpoint(value);
            setServerMessage(undefined);
            setServerError(undefined);
          }}
          editable={!isSavingServer}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://books.example.com"
          accessibilityLabel="PocketBase server URL"
          style={styles.input}
        />
        {!!serverMessage && <Text style={styles.message}>{serverMessage}</Text>}
        {!!serverError && <Text style={styles.error} accessibilityRole="alert">{serverError}</Text>}
        <View style={styles.actions}>
          <AppButton label="Test and save server" loadingLabel="Testing server…" loading={isSavingServer} onPress={() => void saveServer()} />
          <AppButton
            label="Reset to deployment default"
            variant="secondary"
            disabled={isSavingServer || !getBuildTimePocketBaseEndpoint()}
            onPress={() => void resetServer()}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>{t('settings.languageHeading')}</Text>
        <Text style={styles.help}>{t('settings.languageHelp')}</Text>
        <View
          style={styles.languageOptions}
          accessibilityRole="radiogroup"
          accessibilityLabel={t('settings.languageAccessibility')}
        >
          {supportedLanguages.map((option) => {
            const selected = option.code === language;
            return (
              <Pressable
                key={option.code}
                onPress={() => void changeLanguage(option.code)}
                disabled={isChangingLanguage}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled: isChangingLanguage }}
                style={({ pressed }) => [
                  styles.languageButton,
                  selected && styles.languageButtonSelected,
                  pressed && !isChangingLanguage && styles.languageButtonPressed,
                  isChangingLanguage && styles.languageButtonDisabled,
                ]}
              >
                <Text style={[styles.languageText, selected && styles.languageTextSelected]}>
                  {option.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>{t('settings.bookMetadataHeading')}</Text>
        <Text style={styles.help}>{t('settings.bookMetadataHelp')}</Text>

        <Text style={styles.label}>{t('settings.googleBooksKey')}</Text>
        <TextInput
          value={apiKey}
          onChangeText={(value) => {
            setApiKey(value);
            setMessage(undefined);
            setError(undefined);
          }}
          editable={!isLoading && !isSaving}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          accessibilityLabel={t('settings.googleBooksKey')}
          placeholder={isLoading ? t('common.loading') : t('common.optional')}
          style={styles.input}
        />
        <Text style={styles.note}>{t('settings.keyNote')}</Text>

        {!!message && (
          <Text style={styles.message} accessibilityLiveRegion="polite">
            {message}
          </Text>
        )}
        {!!error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}

        <View style={styles.actions}>
          <AppButton
            label={t('settings.saveKey')}
            loadingLabel={t('common.saving')}
            loading={isSaving}
            disabled={isLoading}
            onPress={() => void save()}
          />
          <AppButton
            label={t('settings.clearKey')}
            variant="secondary"
            disabled={isLoading || isSaving || apiKey.length === 0}
            onPress={() => void clear()}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    alignItems: 'center',
    padding: 20,
    gap: 20,
    backgroundColor: '#f8fafc',
  },
  section: {
    width: '100%',
    maxWidth: 720,
    gap: 12,
    borderRadius: 12,
    backgroundColor: '#fff',
    padding: 20,
  },
  heading: { fontSize: 24, fontWeight: '700', color: '#111827' },
  help: { fontSize: 15, lineHeight: 22, color: '#4b5563' },
  languageOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  languageButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#9ca3af',
    borderRadius: 999,
    backgroundColor: '#fff',
  },
  languageButtonSelected: { borderColor: '#1f6feb', backgroundColor: '#1f6feb' },
  languageButtonPressed: { opacity: 0.75 },
  languageButtonDisabled: { opacity: 0.55 },
  languageText: { fontSize: 15, fontWeight: '600', color: '#1f2937' },
  languageTextSelected: { color: '#fff' },
  label: { marginTop: 8, fontSize: 14, fontWeight: '700', color: '#1f2937' },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#9ca3af',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#fff',
  },
  note: { fontSize: 13, lineHeight: 19, color: '#6b7280' },
  message: { fontSize: 14, lineHeight: 20, color: '#166534' },
  error: { fontSize: 14, lineHeight: 20, color: '#b00020' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
});
