import {
  EndpointConfigurationError,
  clearRuntimePocketBaseEndpoint,
  getConfiguredPocketBaseEndpoint,
  getRuntimePocketBaseEndpoint,
  normalizePocketBaseEndpoint,
  setRuntimePocketBaseEndpoint,
  testPocketBaseEndpoint,
} from './pocketbase';

jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => store[key] ?? null),
      setItem: jest.fn(async (key: string, value: string) => { store[key] = value; }),
      removeItem: jest.fn(async (key: string) => { delete store[key]; }),
    },
  };
});

describe('PocketBase endpoint settings', () => {
  const environment = process.env.EXPO_PUBLIC_POCKETBASE_URL;

  beforeEach(async () => {
    await clearRuntimePocketBaseEndpoint();
    delete process.env.EXPO_PUBLIC_POCKETBASE_URL;
  });

  afterAll(() => {
    if (environment === undefined) delete process.env.EXPO_PUBLIC_POCKETBASE_URL;
    else process.env.EXPO_PUBLIC_POCKETBASE_URL = environment;
  });

  test('normalizes endpoint input and persists the runtime override', async () => {
    await expect(setRuntimePocketBaseEndpoint(' https://books.example.com/api/ ')).resolves.toBe('https://books.example.com/api');
    await expect(getRuntimePocketBaseEndpoint()).resolves.toBe('https://books.example.com/api');
  });

  test('runtime endpoint takes precedence over the deployment default', async () => {
    process.env.EXPO_PUBLIC_POCKETBASE_URL = 'https://default.example.com/';
    await setRuntimePocketBaseEndpoint('https://runtime.example.com');
    await expect(getConfiguredPocketBaseEndpoint()).resolves.toBe('https://runtime.example.com');
  });

  test('uses the deployment default when no runtime override exists', async () => {
    process.env.EXPO_PUBLIC_POCKETBASE_URL = 'https://default.example.com/';
    await expect(getConfiguredPocketBaseEndpoint()).resolves.toBe('https://default.example.com');
  });

  test('resetting the runtime override restores the deployment default', async () => {
    process.env.EXPO_PUBLIC_POCKETBASE_URL = 'https://default.example.com/';
    await setRuntimePocketBaseEndpoint('https://runtime.example.com');
    await clearRuntimePocketBaseEndpoint();
    await expect(getConfiguredPocketBaseEndpoint()).resolves.toBe('https://default.example.com');
  });

  test('rejects URLs without an HTTP scheme', () => {
    expect(() => normalizePocketBaseEndpoint('books.example.com')).toThrow(EndpointConfigurationError);
  });

  test('reports an unreachable server separately', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'));
    await expect(testPocketBaseEndpoint('https://books.example.com')).rejects.toMatchObject({ code: 'unreachable' });
    fetchMock.mockRestore();
  });
});
