import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTH_STORAGE_KEY = 'pb_auth';

/**
 * Web/fallback auth persistence.
 *
 * Browsers do not have an Expo SecureStore equivalent, so web keeps using
 * AsyncStorage (localStorage-backed in React Native Web). Native platforms
 * resolve authStorage.native.ts instead.
 */
export async function prepareAuthStorage(): Promise<void> {
  // No native credential migration is needed on web.
}

export async function getPersistedAuth(): Promise<string | null> {
  return AsyncStorage.getItem(AUTH_STORAGE_KEY);
}

export async function setPersistedAuth(serialized: string): Promise<void> {
  await AsyncStorage.setItem(AUTH_STORAGE_KEY, serialized);
}

export async function clearPersistedAuth(): Promise<void> {
  await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
}

export const authStorageKey = AUTH_STORAGE_KEY;
