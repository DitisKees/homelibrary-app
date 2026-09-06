import { mapOpenLibraryDoc } from './openLibrary';

describe('Open Library metadata mapping', () => {
  test('maps a complete result', () => {
    const metadata = mapOpenLibraryDoc({
      title: 'The Example Book',
      author_name: ['Ada Author', 'Bob Writer'],
      publisher: ['Example Press', 'Other Press'],
      first_publish_year: 1998,
      first_sentence: ['First sentence from Open Library.'],
      cover_i: 123456,
    });

    expect(metadata).toEqual({
      title: 'The Example Book',
      author: 'Ada Author, Bob Writer',
      publisher: 'Example Press',
      publishedYear: 1998,
      description: 'First sentence from Open Library.',
      coverUrl: 'https://covers.openlibrary.org/b/id/123456-L.jpg',
    });
  });

  test('normalizes incomplete and invalid fields', () => {
    const metadata = mapOpenLibraryDoc({
      title: '  Minimal Book  ',
      author_name: [],
      publisher: [null, ''],
      first_publish_year: '2001',
      cover_i: 'invalid',
    });

    expect(metadata.title).toBe('Minimal Book');
    expect(metadata.author).toBeUndefined();
    expect(metadata.publisher).toBeUndefined();
    expect(metadata.publishedYear).toBeUndefined();
    expect(metadata.coverUrl).toBeUndefined();
  });
});
