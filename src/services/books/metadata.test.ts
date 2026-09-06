import {
  getMetadataProviders,
  lookupWithProviders,
  type BookMetadata,
  type IsbnMetadataProvider,
} from './metadata';

jest.mock('../settings/googleBooks', () => ({
  getGoogleBooksApiKey: jest.fn(async () => undefined),
}));

function provider(
  name: string,
  lookup: () => Promise<BookMetadata | null>
): IsbnMetadataProvider {
  return { name, lookup };
}

describe('metadata provider ordering and fallback', () => {
  test('uses Google Books first when an API key is configured', () => {
    expect(getMetadataProviders('configured-key').map((item) => item.name)).toEqual([
      'Google Books',
      'Open Library',
    ]);
  });

  test('uses Open Library first when no API key is configured', () => {
    expect(getMetadataProviders().map((item) => item.name)).toEqual([
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
