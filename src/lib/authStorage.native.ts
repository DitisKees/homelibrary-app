import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const SECURE_AUTH_STORAGE_KEY = 'homelibrary.auth.pocketbase';
const LEGACY_AUTH_STORAGE_KEY = 'pb_auth';

/**
 * Deliberately do not migrate credentials out of the old plain AsyncStorage
 * entry. Removing it once means existing native installs need to sign in once
 * after this security upgrade, after which auth is stored only in SecureStore.
 */
export async function prepareAuthStorage(): Promise<void> {
  await AsyncStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
}

export async function getPersistedAuth(): Promise<string | null> {
  return SecureStore.getItemAsync(SECURE_AUTH_STORAGE_KEY);
}

export async function setPersistedAuth(serialized: string): Promise<void> {
  await SecureStore.setItemAsync(SECURE_AUTH_STORAGE_KEY, serialized);
}

export async function clearPersistedAuth(): Promise<void> {
  await SecureStore.deleteItemAsync(SECURE_AUTH_STORAGE_KEY);
  await AsyncStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
}

export const authStorageKey = SECURE_AUTH_STORAGE_KEY;
export const legacyAuthStorageKey = LEGACY_AUTH_STORAGE_KEY;
