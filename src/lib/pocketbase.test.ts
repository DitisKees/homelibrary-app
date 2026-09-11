jest.mock('@/lib/authStorage', () => ({
  clearPersistedAuth: jest.fn(),
  getPersistedAuth: jest.fn(),
  prepareAuthStorage: jest.fn(),
  setPersistedAuth: jest.fn(),
}));

jest.mock('@/lib/eventSource', () => ({
  ensurePocketBaseEventSource: jest.fn(),
}));

import { fileUrl, pb } from '@/lib/pocketbase';

describe('fileUrl', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shares one in-flight file token request across concurrent thumbnail URLs', async () => {
    let resolveToken: ((token: string) => void) | undefined;
    const getToken = jest.spyOn(pb.files, 'getToken').mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveToken = resolve;
        })
    );
    const getUrl = jest.spyOn(pb.files, 'getUrl').mockImplementation(
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
