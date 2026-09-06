import { createGoogleBooksProvider } from './googleBooks';
import { openLibraryProvider } from './openLibrary';
import { getGoogleBooksApiKey } from '../settings/googleBooks';

export type BookMetadata = {
  title?: string;
  author?: string;
  publisher?: string;
  publishedYear?: number;
  description?: string;
  coverUrl?: string;
};

export interface IsbnMetadataProvider {
  readonly name: string;
  lookup(isbn: string): Promise<BookMetadata | null>;
}

export function getMetadataProviders(googleBooksApiKey?: string): IsbnMetadataProvider[] {
  const googleBooksProvider = createGoogleBooksProvider(googleBooksApiKey);
  return googleBooksApiKey
    ? [googleBooksProvider, openLibraryProvider]
    : [openLibraryProvider, googleBooksProvider];
}

export async function lookupWithProviders(
  isbn: string,
  providers: IsbnMetadataProvider[]
): Promise<BookMetadata | null> {
  let lastError: unknown;
  let errorCount = 0;

  for (const provider of providers) {
    try {
      const result = await provider.lookup(isbn);
      if (result) return result;
    } catch (error) {
      lastError = error;
      errorCount += 1;
    }
  }

  if (providers.length > 0 && errorCount === providers.length && lastError) {
    throw lastError;
  }
  return null;
}

export async function lookupBookMetadata(isbn: string): Promise<BookMetadata | null> {
  const googleBooksApiKey = await getGoogleBooksApiKey();
  return lookupWithProviders(isbn, getMetadataProviders(googleBooksApiKey));
}
