const mockAuthRefresh = jest.fn();

jest.mock('pocketbase', () => {
  class MockAsyncAuthStore {
    token = '';
    model: { id: string } | null = null;

    clear = jest.fn(() => {
      this.token = '';
      this.model = null;
    });

    save = jest.fn((token: string, model: { id: string } | null) => {
      this.token = token;
      this.model = model;
    });

    get isValid() {
      return Boolean(this.token) && this.token !== 'expired-token';
    }
  }

  class MockPocketBase {
    authStore: MockAsyncAuthStore;

    files = {
      getToken: jest.fn(),
      getUrl: jest.fn(),
    };

    collection = jest.fn(() => ({
      authRefresh: mockAuthRefresh,
    }));

    constructor(_endpoint: string, authStore: MockAsyncAuthStore) {
      this.authStore = authStore;
    }
  }

  return {
    __esModule: true,
    AsyncAuthStore: MockAsyncAuthStore,
    default: MockPocketBase,
  };
});

jest.mock('@/lib/authStorage', () => ({
  clearPersistedAuth: jest.fn(),
  getPersistedAuth: jest.fn(),
  prepareAuthStorage: jest.fn(),
  setPersistedAuth: jest.fn(),
}));

jest.mock('@/lib/eventSource', () => ({
  ensurePocketBaseEventSource: jest.fn(),
}));

import {
  clearPersistedAuth,
  getPersistedAuth,
  prepareAuthStorage,
} from '@/lib/authStorage';
import {
  fileUrl,
  hydrateAuthStore,
  initializePocketBase,
  validateServerSession,
  pb,
} from '@/lib/pocketbase';

const getPersistedAuthMock = getPersistedAuth as jest.MockedFunction<typeof getPersistedAuth>;
const clearPersistedAuthMock = clearPersistedAuth as jest.MockedFunction<typeof clearPersistedAuth>;
const prepareAuthStorageMock = prepareAuthStorage as jest.MockedFunction<typeof prepareAuthStorage>;

describe('PocketBase auth hydration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    initializePocketBase('https://books.example.com');
  });

  it('restores a persisted session while its token is still valid', async () => {
    getPersistedAuthMock.mockResolvedValueOnce(
      JSON.stringify({ token: 'valid-token', model: { id: 'user-1' } })
    );

    await hydrateAuthStore();

    expect(prepareAuthStorageMock).toHaveBeenCalledTimes(1);
    expect(pb.authStore.isValid).toBe(true);
    expect(pb.authStore.model).toEqual({ id: 'user-1' });
    expect(clearPersistedAuthMock).not.toHaveBeenCalled();
  });

  it('clears an expired persisted session instead of exposing its cached user model', async () => {
    getPersistedAuthMock.mockResolvedValueOnce(
      JSON.stringify({ token: 'expired-token', model: { id: 'user-1' } })
    );

    await hydrateAuthStore();

    expect(pb.authStore.isValid).toBe(false);
    expect(pb.authStore.model).toBeNull();
    expect(clearPersistedAuthMock).toHaveBeenCalledTimes(1);
  });

  it('clears malformed persisted auth state', async () => {
    getPersistedAuthMock.mockResolvedValueOnce('{not-json');

    await hydrateAuthStore();

    expect(pb.authStore.model).toBeNull();
    expect(clearPersistedAuthMock).toHaveBeenCalledTimes(1);
  });
});

describe('fileUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    initializePocketBase('https://books.example.com');
  });

  it('shares one in-flight file token request across concurrent thumbnail URLs', async () => {
    const getToken = pb.files.getToken as jest.MockedFunction<typeof pb.files.getToken>;
    const getUrl = pb.files.getUrl as jest.MockedFunction<typeof pb.files.getUrl>;

    let resolveToken: ((token: string) => void) | undefined;
    getToken.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveToken = resolve;
        })
    );
    getUrl.mockImplementation(
      (record, filename, options) =>
        `${record.id}/${filename}?thumb=${options?.thumb ?? ''}&token=${options?.token ?? ''}`
    );

    const firstUrl = fileUrl(
      { id: 'book-1', collectionId: 'books', collectionName: 'books' },
      'cover-1.webp',
      '80x120'
    );
    const secondUrl = fileUrl(
      { id: 'book-2', collectionId: 'books', collectionName: 'books' },
      'cover-2.webp',
      '80x120'
    );

    expect(getToken).toHaveBeenCalledTimes(1);

    resolveToken?.('file-token');

    await expect(Promise.all([firstUrl, secondUrl])).resolves.toEqual([
      'book-1/cover-1.webp?thumb=80x120&token=file-token',
      'book-2/cover-2.webp?thumb=80x120&token=file-token',
    ]);
    expect(getUrl).toHaveBeenCalledTimes(2);

    await fileUrl(
      { id: 'book-3', collectionId: 'books', collectionName: 'books' },
      'cover-3.webp',
      '80x120'
    );
    expect(getToken).toHaveBeenCalledTimes(1);
  });
});

describe('Remote PocketBase session validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    initializePocketBase('https://books.example.com');
    pb.authStore.save('valid-token', { id: 'user-before-reset' });
  });

  it('preserves a valid session when the server accepts it', async () => {
    mockAuthRefresh.mockResolvedValueOnce({ record: { id: 'user-before-reset' } });
    await expect(validateServerSession()).resolves.toBe(true);
    expect(pb.authStore.model?.id).toBe('user-before-reset');
    expect(clearPersistedAuthMock).not.toHaveBeenCalled();
  });

  it('discards stale credentials after an HTTP 401 from a reset backend', async () => {
    mockAuthRefresh.mockRejectedValueOnce(Object.assign(new Error('Invalid token'), { status: 401 }));
    await expect(validateServerSession()).resolves.toBe(false);
    expect(pb.authStore.model).toBeNull();
    expect(clearPersistedAuthMock).toHaveBeenCalledTimes(1);
  });

  it('does not discard a login because a sleeping server is unavailable', async () => {
    mockAuthRefresh.mockRejectedValueOnce(Object.assign(new Error('Network unavailable'), { status: 0 }));
    await expect(validateServerSession()).rejects.toThrow('Network unavailable');
    expect(pb.authStore.model?.id).toBe('user-before-reset');
    expect(clearPersistedAuthMock).not.toHaveBeenCalled();
  });

  it('does not clear credentials for a new endpoint when an old check finishes', async () => {
    let rejectOld: ((error: Error) => void) | undefined;
    mockAuthRefresh.mockImplementationOnce(() => new Promise((_, reject) => {
      rejectOld = reject;
    }));
    const validation = validateServerSession();
    initializePocketBase('https://another.example.com');
    pb.authStore.save('valid-token-new', { id: 'user-on-new-server' });
    rejectOld?.(Object.assign(new Error('Old endpoint unauthorized'), { status: 401 }));
    await expect(validation).resolves.toBe(false);
    expect(pb.authStore.model?.id).toBe('user-on-new-server');
    expect(clearPersistedAuthMock).not.toHaveBeenCalled();
  });

  it('shares one in-flight validation between simultaneous callers', async () => {
    let finish: (() => void) | undefined;
    mockAuthRefresh.mockImplementationOnce(() => new Promise((resolve) => {
      finish = () => resolve({ record: { id: 'user-before-reset' } });
    }));
    const first = validateServerSession();
    const second = validateServerSession();
    expect(mockAuthRefresh).toHaveBeenCalledTimes(1);
    finish?.();
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
  });
});
