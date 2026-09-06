import type { BookMetadata, IsbnMetadataProvider } from './metadata';
import { MetadataLookupError } from './metadataErrors';
import { normalizeIsbn } from '../../utils/isbn';

type OpenLibrarySearchDoc = {
  title?: unknown;
  author_name?: unknown;
  publisher?: unknown;
  first_publish_year?: unknown;
  first_sentence?: unknown;
  cover_i?: unknown;
};

type OpenLibrarySearchResponse = {
  docs?: unknown;
};

const PROVIDER_NAME = 'Open Library';

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (!Array.isArray(value)) return undefined;
  const first = value.find((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return first?.trim();
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
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 9999
    ? value
    : undefined;
}

function coverUrl(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? `https://covers.openlibrary.org/b/id/${value}-L.jpg`
    : undefined;
}

export function mapOpenLibraryDoc(doc: OpenLibrarySearchDoc): BookMetadata {
  return {
    title: firstString(doc.title),
    author: authorText(doc.author_name),
    publisher: firstString(doc.publisher),
    publishedYear: publishedYear(doc.first_publish_year),
    description: firstString(doc.first_sentence),
    coverUrl: coverUrl(doc.cover_i),
  };
}

async function lookup(isbn: string): Promise<BookMetadata | null> {
  const normalized = normalizeIsbn(isbn);
  const params = new URLSearchParams({
    isbn: normalized,
    fields: 'title,author_name,publisher,first_publish_year,first_sentence,cover_i',
    limit: '1',
  });

  let response: Response;
  try {
    response = await fetch(`https://openlibrary.org/search.json?${params.toString()}`);
  } catch {
    throw new MetadataLookupError(PROVIDER_NAME, 'network');
  }

  if (response.status === 429) {
    throw new MetadataLookupError(PROVIDER_NAME, 'rateLimit');
  }
  if (!response.ok) {
    throw new MetadataLookupError(PROVIDER_NAME, 'provider');
  }

  const payload = (await response.json()) as OpenLibrarySearchResponse;
  if (!Array.isArray(payload.docs) || payload.docs.length === 0) return null;

  const metadata = mapOpenLibraryDoc(payload.docs[0] as OpenLibrarySearchDoc);
  return Object.values(metadata).some((value) => value !== undefined) ? metadata : null;
}

export const openLibraryProvider: IsbnMetadataProvider = {
  name: PROVIDER_NAME,
  lookup,
};
