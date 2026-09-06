import { createGoogleBooksProvider, mapGoogleBooksVolume } from './googleBooks';

describe('Google Books metadata provider', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('maps a complete volume into provider-neutral metadata', () => {
    const metadata = mapGoogleBooksVolume({
      volumeInfo: {
        title: 'The Example Book',
        authors: ['Ada Author', 'Bob Writer'],
        publisher: 'Example Press',
        publishedDate: '2021-04-15',
        description: 'A useful description.',
        imageLinks: { thumbnail: 'http://books.google.com/example-cover.jpg' },
      },
    });

    expect(metadata).toEqual({
      title: 'The Example Book',
      author: 'Ada Author, Bob Writer',
      publisher: 'Example Press',
      publishedYear: 2021,
      description: 'A useful description.',
      coverUrl: 'https://books.google.com/example-cover.jpg',
    });
  });

  test('requests an ISBN without an API key', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ totalItems: 0, items: [] }),
    } as Response);

    await createGoogleBooksProvider().lookup('9780306406157');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('q=isbn%3A9780306406157');
    expect(url).not.toContain('key=');
  });

  test('adds a configured API key to the request', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ totalItems: 0, items: [] }),
    } as Response);

    await createGoogleBooksProvider('example-key').lookup('9780306406157');

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('q=isbn%3A9780306406157');
    expect(url).toContain('key=example-key');
  });

  test('returns null when Google Books has no matching volume', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ totalItems: 0 }),
    } as Response);

    await expect(createGoogleBooksProvider().lookup('9780306406157')).resolves.toBeNull();
  });
});
