import {
  EndpointConfigurationError,
  clearRuntimePocketBaseEndpoint,
  getConfiguredPocketBaseEndpoint,
  getDeploymentPocketBaseEndpoint,
  getInjectedPocketBaseEndpoint,
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

type RuntimeGlobal = typeof globalThis & {
  __HOMELIBRARY_RUNTIME_CONFIG__?: { POCKETBASE_URL?: unknown };
};

describe('PocketBase endpoint settings', () => {
  const environment = process.env.EXPO_PUBLIC_POCKETBASE_URL;
  const runtimeGlobal = globalThis as RuntimeGlobal;
  const runtimeConfiguration = runtimeGlobal.__HOMELIBRARY_RUNTIME_CONFIG__;

  beforeEach(async () => {
    await clearRuntimePocketBaseEndpoint();
    delete process.env.EXPO_PUBLIC_POCKETBASE_URL;
    delete runtimeGlobal.__HOMELIBRARY_RUNTIME_CONFIG__;
  });

  afterAll(() => {
    if (environment === undefined) delete process.env.EXPO_PUBLIC_POCKETBASE_URL;
    else process.env.EXPO_PUBLIC_POCKETBASE_URL = environment;

    if (runtimeConfiguration === undefined) delete runtimeGlobal.__HOMELIBRARY_RUNTIME_CONFIG__;
    else runtimeGlobal.__HOMELIBRARY_RUNTIME_CONFIG__ = runtimeConfiguration;
  });

  test('normalizes endpoint input and persists the user runtime override', async () => {
    await expect(setRuntimePocketBaseEndpoint(' https://books.example.com/api/ ')).resolves.toBe('https://books.example.com/api');
    await expect(getRuntimePocketBaseEndpoint()).resolves.toBe('https://books.example.com/api');
  });

  test('user runtime endpoint takes precedence over injected and build-time defaults', async () => {
    runtimeGlobal.__HOMELIBRARY_RUNTIME_CONFIG__ = { POCKETBASE_URL: 'https://container.example.com/' };
    process.env.EXPO_PUBLIC_POCKETBASE_URL = 'https://build.example.com/';
    await setRuntimePocketBaseEndpoint('https://runtime.example.com');
    await expect(getConfiguredPocketBaseEndpoint()).resolves.toBe('https://runtime.example.com');
  });

  test('injected web endpoint takes precedence over the build-time default', () => {
    runtimeGlobal.__HOMELIBRARY_RUNTIME_CONFIG__ = { POCKETBASE_URL: 'https://container.example.com/' };
    process.env.EXPO_PUBLIC_POCKETBASE_URL = 'https://build.example.com/';
    expect(getInjectedPocketBaseEndpoint()).toBe('https://container.example.com');
    expect(getDeploymentPocketBaseEndpoint()).toBe('https://container.example.com');
  });

  test('uses the build-time endpoint when no injected endpoint exists', () => {
    process.env.EXPO_PUBLIC_POCKETBASE_URL = 'https://default.example.com/';
    expect(getDeploymentPocketBaseEndpoint()).toBe('https://default.example.com');
  });

  test('treats a missing injected endpoint as unconfigured', () => {
    runtimeGlobal.__HOMELIBRARY_RUNTIME_CONFIG__ = { POCKETBASE_URL: null };
    expect(getInjectedPocketBaseEndpoint()).toBeUndefined();
  });

  test('resetting the user runtime override restores the injected deployment default', async () => {
    runtimeGlobal.__HOMELIBRARY_RUNTIME_CONFIG__ = { POCKETBASE_URL: 'https://container.example.com/' };
    await setRuntimePocketBaseEndpoint('https://runtime.example.com');
    await clearRuntimePocketBaseEndpoint();
    await expect(getConfiguredPocketBaseEndpoint()).resolves.toBe('https://container.example.com');
  });

  test('rejects URLs without an HTTP scheme', () => {
    expect(() => normalizePocketBaseEndpoint('books.example.com')).toThrow(EndpointConfigurationError);
  });

  test('rejects URLs containing credentials', () => {
    expect(() => normalizePocketBaseEndpoint('https://user:secret@books.example.com'))
      .toThrow(expect.objectContaining({ code: 'invalidUrl' }));
  });

  test('production policy rejects insecure remote HTTP endpoints', () => {
    expect(() =>
      normalizePocketBaseEndpoint('http://books.example.com', { allowInsecureDevelopment: false })
    ).toThrow(expect.objectContaining({ code: 'insecureUrl' }));
  });

  test.each([
    'http://localhost:8090',
    'http://127.0.0.1:8090',
    'http://10.0.2.2:8090',
    'http://192.168.1.25:8090',
  ])('development policy accepts local HTTP endpoint %s', (endpoint) => {
    expect(normalizePocketBaseEndpoint(endpoint, { allowInsecureDevelopment: true })).toBe(endpoint);
  });

  test('development policy still rejects public HTTP hosts', () => {
    expect(() =>
      normalizePocketBaseEndpoint('http://books.example.com', { allowInsecureDevelopment: true })
    ).toThrow(expect.objectContaining({ code: 'insecureUrl' }));
  });

  test('HTTPS is accepted under production policy', () => {
    expect(normalizePocketBaseEndpoint('https://books.example.com/', { allowInsecureDevelopment: false }))
      .toBe('https://books.example.com');
  });

  test('reports an unreachable server separately', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'));
    await expect(testPocketBaseEndpoint('https://books.example.com')).rejects.toMatchObject({ code: 'unreachable' });
    fetchMock.mockRestore();
  });
});
