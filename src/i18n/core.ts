import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import de from './locales/de';
import en from './locales/en';
import fr from './locales/fr';
import nl from './locales/nl';
import serverTranslations from './serverTranslations';

export type SupportedLocale = 'en' | 'nl' | 'de' | 'fr';

export const supportedLanguages: ReadonlyArray<{ code: SupportedLocale; name: string }> = [
  { code: 'en', name: 'English' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' },
];

const supportedCodes = new Set<SupportedLocale>(supportedLanguages.map((language) => language.code));

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: { ...en, ...serverTranslations.en } },
    nl: { translation: { ...nl, ...serverTranslations.nl } },
    de: { translation: { ...de, ...serverTranslations.de } },
    fr: { translation: { ...fr, ...serverTranslations.fr } },
  },
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: supportedLanguages.map((language) => language.code),
  load: 'languageOnly',
  initAsync: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

export function resolveSupportedLocale(value?: string | null): SupportedLocale {
  const language = value?.trim().toLowerCase().split(/[-_]/)[0] as SupportedLocale | undefined;
  return language && supportedCodes.has(language) ? language : 'en';
}

export function formatDate(value?: string | Date, locale?: string): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat(locale ?? i18n.resolvedLanguage ?? 'en').format(date);
}

export function formatNumber(value: number, locale?: string): string {
  return new Intl.NumberFormat(locale ?? i18n.resolvedLanguage ?? 'en').format(value);
}

export { i18n, useTranslation };
export default i18n;
