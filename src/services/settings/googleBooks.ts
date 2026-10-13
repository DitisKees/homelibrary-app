import AsyncStorage from '@react-native-async-storage/async-storage';

const GOOGLE_BOOKS_API_KEY_STORAGE = 'homelibrary.settings.googleBooksApiKey';

export async function getGoogleBooksApiKey(): Promise<string | undefined> {
  const stored = await AsyncStorage.getItem(GOOGLE_BOOKS_API_KEY_STORAGE);
  const normalized = stored?.trim();
  return normalized ? normalized : undefined;
}

export async function setGoogleBooksApiKey(apiKey: string): Promise<void> {
  const normalized = apiKey.trim();
  if (!normalized) {
    await AsyncStorage.removeItem(GOOGLE_BOOKS_API_KEY_STORAGE);
    return;
  }
  await AsyncStorage.setItem(GOOGLE_BOOKS_API_KEY_STORAGE, normalized);
}

export async function clearGoogleBooksApiKey(): Promise<void> {
  await AsyncStorage.removeItem(GOOGLE_BOOKS_API_KEY_STORAGE);
}

export const googleBooksApiKeyStorageKey = GOOGLE_BOOKS_API_KEY_STORAGE;

const GOOGLE_BOOKS_ENABLED_STORAGE = 'homelibrary.settings.googleBooksEnabled';

// Opt-in applies to new installs and upgrades, including devices with a saved key.
export async function getGoogleBooksEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(GOOGLE_BOOKS_ENABLED_STORAGE)) === 'true';
}

export async function setGoogleBooksEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(GOOGLE_BOOKS_ENABLED_STORAGE, String(enabled));
}
