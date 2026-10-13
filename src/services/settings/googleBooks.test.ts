import {
  clearGoogleBooksApiKey,
  getGoogleBooksApiKey,
  getGoogleBooksEnabled,
  setGoogleBooksEnabled,
  setGoogleBooksApiKey,
} from './googleBooks';

jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => store[key] ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: jest.fn(async (key: string) => {
        delete store[key];
      }),
    },
  };
});

describe('Google Books API key settings', () => {
  beforeEach(async () => {
    await clearGoogleBooksApiKey();
  });

  test('persists and trims a configured key', async () => {
    await setGoogleBooksApiKey('  example-key  ');
    await expect(getGoogleBooksApiKey()).resolves.toBe('example-key');
  });

  test('clearing a key restores the no-key state', async () => {
    await setGoogleBooksApiKey('example-key');
    await clearGoogleBooksApiKey();
    await expect(getGoogleBooksApiKey()).resolves.toBeUndefined();
  });

  test('saving an empty value clears the configured key', async () => {
    await setGoogleBooksApiKey('example-key');
    await setGoogleBooksApiKey('   ');
    await expect(getGoogleBooksApiKey()).resolves.toBeUndefined();
  });
});

describe('Google Books opt-in', () => {
  test('is disabled before any preference is saved, including with a saved key', async () => {
    await setGoogleBooksApiKey('existing-key');
    await expect(getGoogleBooksEnabled()).resolves.toBe(false);
  });
  test('persists enabling and disabling independently of the key', async () => {
    await setGoogleBooksEnabled(true);
    await expect(getGoogleBooksEnabled()).resolves.toBe(true);
    await clearGoogleBooksApiKey();
    await expect(getGoogleBooksEnabled()).resolves.toBe(true);
    await setGoogleBooksEnabled(false);
    await expect(getGoogleBooksEnabled()).resolves.toBe(false);
  });
});
