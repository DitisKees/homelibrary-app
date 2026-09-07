import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  clearPersistedAuth,
  getPersistedAuth,
  legacyAuthStorageKey,
  prepareAuthStorage,
  setPersistedAuth,
} from './authStorage.native';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(async () => undefined),
  },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockedSecureStore = SecureStore as jest.Mocked<typeof SecureStore>;

describe('native auth storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('removes the legacy plain AsyncStorage credential instead of migrating it', async () => {
    await prepareAuthStorage();
    expect(mockedAsyncStorage.removeItem).toHaveBeenCalledWith(legacyAuthStorageKey);
    expect(mockedSecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  test('persists and reads auth state through SecureStore', async () => {
    mockedSecureStore.getItemAsync.mockResolvedValueOnce('{"token":"abc"}');

    await setPersistedAuth('{"token":"abc"}');
    await expect(getPersistedAuth()).resolves.toBe('{"token":"abc"}');

    expect(mockedSecureStore.setItemAsync).toHaveBeenCalledWith(
      'homelibrary.auth.pocketbase',
      '{"token":"abc"}'
    );
  });

  test('clears secure auth and any leftover legacy credential', async () => {
    await clearPersistedAuth();

    expect(mockedSecureStore.deleteItemAsync).toHaveBeenCalledWith('homelibrary.auth.pocketbase');
    expect(mockedAsyncStorage.removeItem).toHaveBeenCalledWith(legacyAuthStorageKey);
  });
});
