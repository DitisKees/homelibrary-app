import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales, type Locale } from 'expo-localization';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import {
  formatDate,
  formatNumber,
  i18n,
  resolveSupportedLocale,
  supportedLanguages,
  type SupportedLocale,
} from './core';

const LANGUAGE_STORAGE_KEY = 'homelibrary.settings.language';

export function detectDeviceLocale(locales: Locale[] = getLocales()): SupportedLocale {
  const first = locales[0];
  return resolveSupportedLocale(first?.languageCode ?? first?.languageTag);
}

export async function loadInitialLanguage(): Promise<SupportedLocale> {
  const saved = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
  return saved ? resolveSupportedLocale(saved) : detectDeviceLocale();
}

export async function persistLanguage(language: SupportedLocale): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, language);
}

export async function clearLanguagePreference(): Promise<void> {
  await AsyncStorage.removeItem(LANGUAGE_STORAGE_KEY);
}

type LanguageContextValue = {
  language: SupportedLocale;
  setLanguage: (language: SupportedLocale) => Promise<void>;
};

const LanguageContext = React.createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setCurrentLanguage] = React.useState<SupportedLocale>('en');
  const [isReady, setIsReady] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    void loadInitialLanguage()
      .then(async (initialLanguage) => {
        await i18n.changeLanguage(initialLanguage);
        if (active) setCurrentLanguage(initialLanguage);
      })
      .finally(() => {
        if (active) setIsReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const setLanguage = React.useCallback(async (nextLanguage: SupportedLocale) => {
    await persistLanguage(nextLanguage);
    await i18n.changeLanguage(nextLanguage);
    setCurrentLanguage(nextLanguage);
  }, []);

  const value = React.useMemo(() => ({ language, setLanguage }), [language, setLanguage]);

  if (!isReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = React.useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within LanguageProvider');
  return context;
}

export {
  formatDate,
  formatNumber,
  i18n,
  resolveSupportedLocale,
  supportedLanguages,
  type SupportedLocale,
};
export default i18n;
