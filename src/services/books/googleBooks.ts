import type { BookMetadata, IsbnMetadataProvider } from './metadata';
import { MetadataLookupError } from './metadataErrors';
import { normalizeIsbn } from '../../utils/isbn';

type GoogleBooksVolumeInfo = {
  title?: unknown;
  authors?: unknown;
  publisher?: unknown;
  publishedDate?: unknown;
  description?: unknown;
  imageLinks?: unknown;
};

type GoogleBooksVolume = {
  volumeInfo?: unknown;
};

type GoogleBooksResponse = {
  totalItems?: unknown;
  items?: unknown;
};

const PROVIDER_NAME = 'Google Books';

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function authorText(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const authors = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  return authors.length > 0 ? authors.join(', ') : undefined;
}

function publishedYear(value: unknown): number | undefined {
  const text = nonEmptyString(value);
  if (!text) return undefined;
  const match = /^(\d{4})/.exec(text);
  if (!match) return undefined;
  const year = Number(match[1]);
  return Number.isInteger(year) && year >= 0 && year <= 9999 ? year : undefined;
}

function coverUrl(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const links = value as Record<string, unknown>;
  const candidate =
    nonEmptyString(links.extraLarge) ??
    nonEmptyString(links.large) ??
    nonEmptyString(links.medium) ??
    nonEmptyString(links.small) ??
    nonEmptyString(links.thumbnail) ??
    nonEmptyString(links.smallThumbnail);
  return candidate?.replace(/^http:\/\//i, 'https://');
}

export function mapGoogleBooksVolume(volume: GoogleBooksVolume): BookMetadata {
  if (!volume.volumeInfo || typeof volume.volumeInfo !== 'object') return {};
  const info = volume.volumeInfo as GoogleBooksVolumeInfo;
  return {
    title: nonEmptyString(info.title),
    author: authorText(info.authors),
    publisher: nonEmptyString(info.publisher),
    publishedYear: publishedYear(info.publishedDate),
    description: nonEmptyString(info.description),
    coverUrl: coverUrl(info.imageLinks),
  };
}

export function createGoogleBooksProvider(apiKey?: string): IsbnMetadataProvider {
  const normalizedKey = apiKey?.trim() || undefined;

  return {
    name: PROVIDER_NAME,
    async lookup(isbn: string): Promise<BookMetadata | null> {
      const normalized = normalizeIsbn(isbn);
      const params = new URLSearchParams({
        q: `isbn:${normalized}`,
        maxResults: '1',
        printType: 'books',
      });
      if (normalizedKey) params.set('key', normalizedKey);

      let response: Response;
      try {
        response = await fetch(`https://www.googleapis.com/books/v1/volumes?${params.toString()}`);
      } catch {
        throw new MetadataLookupError(PROVIDER_NAME, 'network');
      }

      if (response.status === 404) return null;
      if (response.status === 401 || response.status === 403) {
        throw new MetadataLookupError(PROVIDER_NAME, 'auth');
      }
      if (response.status === 429) {
        throw new MetadataLookupError(PROVIDER_NAME, 'rateLimit');
      }
      if (!response.ok) {
        throw new MetadataLookupError(PROVIDER_NAME, 'provider');
      }

      const payload = (await response.json()) as GoogleBooksResponse;
      if (payload.totalItems === 0 || !Array.isArray(payload.items) || payload.items.length === 0) {
        return null;
      }

      const metadata = mapGoogleBooksVolume(payload.items[0] as GoogleBooksVolume);
      return Object.values(metadata).some((value) => value !== undefined) ? metadata : null;
    },
  };
}
