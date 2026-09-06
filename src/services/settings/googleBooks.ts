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
