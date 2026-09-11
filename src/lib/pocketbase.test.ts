const mockGetToken = jest.fn();
const mockGetUrl = jest.fn();
const mockAuthStore = {
  clear: jest.fn(),
  save: jest.fn(),
};

jest.mock('pocketbase', () => ({
  __esModule: true,
  AsyncAuthStore: jest.fn().mockImplementation(() => mockAuthStore),
  default: jest.fn().mockImplementation(() => ({
    files: {
      getToken: mockGetToken,
      getUrl: mockGetUrl,
    },
  })),
}));

jest.mock('@/lib/authStorage', () => ({
  clearPersistedAuth: jest.fn(),
  getPersistedAuth: jest.fn(),
  prepareAuthStorage: jest.fn(),
  setPersistedAuth: jest.fn(),
}));

jest.mock('@/lib/eventSource', () => ({
  ensurePocketBaseEventSource: jest.fn(),
}));

import { fileUrl } from '@/lib/pocketbase';

describe('fileUrl', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shares one in-flight file token request across concurrent thumbnail URLs', async () => {
    let resolveToken: ((token: string) => void) | undefined;
    mockGetToken.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveToken = resolve;
        })
    );
    mockGetUrl.mockImplementation(
      (record: { id: string }, filename: string, options: { thumb?: string; token: string }) =>
        `${record.id}/${filename}?thumb=${options.thumb ?? ''}&token=${options.token}`
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

    expect(mockGetToken).toHaveBeenCalledTimes(1);

    resolveToken?.('file-token');

    await expect(Promise.all([firstUrl, secondUrl])).resolves.toEqual([
      'book-1/cover-1.webp?thumb=80x120&token=file-token',
      'book-2/cover-2.webp?thumb=80x120&token=file-token',
    ]);
    expect(mockGetUrl).toHaveBeenCalledTimes(2);

    await fileUrl(
      { id: 'book-3', collectionId: 'books', collectionName: 'books' },
      'cover-3.webp',
      '80x120'
    );
    expect(mockGetToken).toHaveBeenCalledTimes(1);
  });
});
