import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Locale } from 'expo-localization';
import {
  clearLanguagePreference,
  detectDeviceLocale,
  i18n,
  loadInitialLanguage,
  persistLanguage,
  resolveSupportedLocale,
} from './index';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'de', languageTag: 'de-DE' }]),
}));

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

function locale(languageCode: string, languageTag: string): Locale {
  return { languageCode, languageTag } as Locale;
}

describe('internationalization', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    storage.getItem.mockResolvedValue(null);
    storage.setItem.mockResolvedValue(undefined);
    storage.removeItem.mockResolvedValue(undefined);
    await i18n.changeLanguage('en');
  });

  test('normalizes supported regional locales and falls back to English', () => {
    expect(resolveSupportedLocale('nl-NL')).toBe('nl');
    expect(resolveSupportedLocale('fr_FR')).toBe('fr');
    expect(resolveSupportedLocale('es-ES')).toBe('en');
  });

  test('detects a supported device locale and falls back for unsupported devices', () => {
    expect(detectDeviceLocale([locale('de', 'de-DE')])).toBe('de');
    expect(detectDeviceLocale([locale('es', 'es-ES')])).toBe('en');
  });

  test('uses a persisted language in preference to the device locale', async () => {
    storage.getItem.mockResolvedValue('fr');
    await expect(loadInitialLanguage()).resolves.toBe('fr');
  });

  test('uses the device locale when no language preference is saved', async () => {
    storage.getItem.mockResolvedValue(null);
    await expect(loadInitialLanguage()).resolves.toBe('de');
  });

  test('persists and clears an explicit language preference', async () => {
    await persistLanguage('nl');
    expect(storage.setItem).toHaveBeenCalledWith('homelibrary.settings.language', 'nl');

    await clearLanguagePreference();
    expect(storage.removeItem).toHaveBeenCalledWith('homelibrary.settings.language');
  });

  test('falls back to English for a missing translated key', async () => {
    i18n.addResource('en', 'translation', 'test.englishOnly', 'English fallback');
    await i18n.changeLanguage('nl');
    expect(i18n.t('test.englishOnly')).toBe('English fallback');
  });

  test('supports interpolation and pluralization through i18next', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.t('common.bookCount', { count: 1 })).toBe('1 book');
    expect(i18n.t('common.bookCount', { count: 3 })).toBe('3 books');
  });

  test.each([
    ['en', 'For security'],
    ['nl', 'Voor de veiligheid'],
    ['de', 'Aus Sicherheitsgründen'],
    ['fr', 'Pour des raisons de sécurité'],
  ])('translates the insecure-server warning in %s', async (language, expected) => {
    await i18n.changeLanguage(language);
    expect(i18n.t('server.errors.insecureUrl')).toContain(expected);
  });
});
