import { getGoogleBooksEnabled, getGoogleBooksApiKey } from '../settings/googleBooks';
import {
  getMetadataProviders,
  lookupWithProviders,
  lookupBookMetadata,
  type BookMetadata,
  type IsbnMetadataProvider,
} from './metadata';

jest.mock('../settings/googleBooks', () => ({
  getGoogleBooksApiKey: jest.fn(async () => undefined),
  getGoogleBooksEnabled: jest.fn(async () => false),
}));

function provider(
  name: string,
  lookup: () => Promise<BookMetadata | null>
): IsbnMetadataProvider {
  return { name, lookup };
}

describe('metadata provider ordering and fallback', () => {
  test('uses Google Books first when an API key is configured', () => {
    expect(getMetadataProviders('configured-key', true).map((item) => item.name)).toEqual([
      'Google Books',
      'Open Library',
    ]);
  });

  test('uses Open Library first when no API key is configured', () => {
    expect(getMetadataProviders(undefined, true).map((item) => item.name)).toEqual([
      'Open Library',
      'Google Books',
    ]);
  });

  test('falls back when the primary provider returns no metadata', async () => {
    const second = jest.fn(async () => ({ title: 'Fallback result' }));
    const result = await lookupWithProviders('9780306406157', [
      provider('primary', async () => null),
      provider('fallback', second),
    ]);

    expect(result).toEqual({ title: 'Fallback result' });
    expect(second).toHaveBeenCalledTimes(1);
  });

  test('falls back after a recoverable provider error', async () => {
    const result = await lookupWithProviders('9780306406157', [
      provider('primary', async () => {
        throw new Error('temporary provider failure');
      }),
      provider('fallback', async () => ({ title: 'Fallback result' })),
    ]);

    expect(result).toEqual({ title: 'Fallback result' });
  });

  test('returns null when providers complete without finding metadata', async () => {
    const result = await lookupWithProviders('9780306406157', [
      provider('first', async () => null),
      provider('second', async () => null),
    ]);

    expect(result).toBeNull();
  });

  test('returns null when one provider fails but another completes with no match', async () => {
    const result = await lookupWithProviders('9780306406157', [
      provider('first', async () => {
        throw new Error('temporary provider failure');
      }),
      provider('second', async () => null),
    ]);

    expect(result).toBeNull();
  });

  test('surfaces an error only when every provider fails', async () => {
    await expect(
      lookupWithProviders('9780306406157', [
        provider('first', async () => {
          throw new Error('first failed');
        }),
        provider('second', async () => {
          throw new Error('second failed');
        }),
      ])
    ).rejects.toThrow('second failed');
  });
});

describe('metadata network privacy', () => {
  const fetchMock = jest.fn();
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.fetch = fetchMock;
    jest.mocked(getGoogleBooksApiKey).mockResolvedValue('saved-key');
    jest.mocked(getGoogleBooksEnabled).mockResolvedValue(false);
  });
  afterAll(() => { globalThis.fetch = originalFetch; });

  test('defaults to Open Library even with a saved key', () => {
    expect(getMetadataProviders('saved-key').map((item) => item.name)).toEqual(['Open Library']);
  });

  test.each(['empty', 'error'])('disabled Google Books receives no request after an Open Library %s', async (outcome) => {
    if (outcome === 'empty') fetchMock.mockResolvedValue({ ok: true, json: async () => ({ docs: [] }) });
    else fetchMock.mockRejectedValue(new Error('offline'));
    if (outcome === 'empty') await expect(lookupBookMetadata('9780306406157')).resolves.toBeNull();
    else await expect(lookupBookMetadata('9780306406157')).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('openlibrary.org');
    expect(getGoogleBooksApiKey).not.toHaveBeenCalled();
  });

  test('successful Open Library lookup skips enabled Google Books', async () => {
    jest.mocked(getGoogleBooksEnabled).mockResolvedValue(true);
    jest.mocked(getGoogleBooksApiKey).mockResolvedValue(undefined);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ docs: [{ title: 'Open Library result' }] }) });
    await expect(lookupBookMetadata('9780306406157')).resolves.toMatchObject({ title: 'Open Library result' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('openlibrary.org');
  });

  test('enabled Google Books is contacted after an empty Open Library result', async () => {
    jest.mocked(getGoogleBooksEnabled).mockResolvedValue(true);
    jest.mocked(getGoogleBooksApiKey).mockResolvedValue(undefined);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ docs: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [{ volumeInfo: { title: 'Google result' } }] }) });
    await expect(lookupBookMetadata('9780306406157')).resolves.toMatchObject({ title: 'Google result' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('www.googleapis.com');
  });
});
