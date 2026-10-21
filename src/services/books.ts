import type { RecordModel } from 'pocketbase';
import { fileUrl, pb, validateServerSession } from '@/lib/pocketbase';
import type { Book, BookInput, BookUpdate } from '@/types/domain';
import { equivalentIsbns } from '@/utils/isbn';

const COLLECTION = 'books';

export type BookPage = {
  items: Book[];
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
};

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function expandedOwnerEmail(record: RecordModel): string | undefined {
  const owner = record.expand?.owner;
  if (!owner || Array.isArray(owner)) return undefined;
  return optionalString(owner.email);
}

export function mapBookRecord(record: RecordModel): Book {
  return {
    id: record.id,
    created: record.created,
    updated: record.updated,
    title: String(record.title ?? ''),
    author: optionalString(record.author),
    isbn10: optionalString(record.isbn10),
    isbn13: optionalString(record.isbn13),
    publisher: optionalString(record.publisher),
    publishedYear: optionalNumber(record.publishedYear),
    description: optionalString(record.description),
    cover: optionalString(record.cover),
    location: optionalString(record.location),
    owner: optionalString(record.owner),
    ownerEmail: expandedOwnerEmail(record),
  };
}

function splitCover(input: BookInput | BookUpdate) {
  const { cover, coverUrl, ...data } = input;
  return { data, cover, coverUrl };
}

async function resolveCover(cover?: Blob, coverUrl?: string): Promise<Blob | undefined> {
  if (cover) return cover;
  if (!coverUrl) return undefined;
  const response = await fetch(coverUrl);
  if (!response.ok) throw new Error('Could not download cover image.');
  return response.blob();
}

function coverFormData(file: Blob): FormData {
  const formData = new FormData();
  formData.append('cover', file, 'cover.webp');
  return formData;
}

export async function attachBookCover(
  id: string,
  cover?: Blob,
  coverUrl?: string
): Promise<Book | undefined> {
  try {
    const file = await resolveCover(cover, coverUrl);
    if (!file) return undefined;
    const record = await pb.collection(COLLECTION).update(id, coverFormData(file));
    return mapBookRecord(record);
  } catch (error) {
    console.warn('Book saved, but cover attachment failed.', error);
    return undefined;
  }
}

export async function listBooksPage(
  page = 1,
  perPage = 30,
  search = ''
): Promise<BookPage> {
  const normalizedSearch = search.trim();
  const options = normalizedSearch
    ? {
        sort: 'title,author,created',
        filter: pb.filter(
          'title ~ {:search} || author ~ {:search} || isbn10 ~ {:search} || isbn13 ~ {:search}',
          { search: normalizedSearch }
        ),
      }
    : { sort: 'title,author,created' };

  const result = await pb.collection(COLLECTION).getList(page, perPage, options);

  // An invalid auth token may result in HTTP 200 with an empty list because
  // PocketBase treats it as an anonymous request. Validate an unexpected empty
  // first page before presenting it as a genuinely empty household library.
  if (page === 1 && !normalizedSearch && result.totalItems === 0 && pb.authStore.isValid) {
    try {
      const valid = await validateServerSession();
      if (!valid) throw new Error('Session expired. Please sign in again.');
    } catch (error) {
      // A free-tier backend can be temporarily unreachable as it wakes.
      // Only a confirmed invalid session should force the login screen;
      // ordinary networking errors must not remove a legitimate empty list.
      if (!pb.authStore.isValid) throw error;
    }
  }

  return {
    items: result.items.map(mapBookRecord),
    page: result.page,
    perPage: result.perPage,
    totalItems: result.totalItems,
    totalPages: result.totalPages,
  };
}

export async function listBooks(page = 1, perPage = 50): Promise<Book[]> {
  const result = await listBooksPage(page, perPage);
  return result.items;
}

export async function getBook(id: string): Promise<Book> {
  const record = await pb.collection(COLLECTION).getOne(id, { expand: 'owner' });
  return mapBookRecord(record);
}

export async function findBooksByIsbn(value: string): Promise<Book[]> {
  const isbns = equivalentIsbns(value);
  if (isbns.length === 0) return [];

  const primary = isbns[0];
  const equivalent = isbns[1] ?? primary;
  const result = await pb.collection(COLLECTION).getList(1, 20, {
    sort: 'title,author,created',
    filter: pb.filter(
      'isbn10 = {:primary} || isbn13 = {:primary} || isbn10 = {:equivalent} || isbn13 = {:equivalent}',
      { primary, equivalent }
    ),
  });

  return result.items.map(mapBookRecord);
}

export async function createBook(input: BookInput): Promise<Book> {
  const { data } = splitCover(input);
  const record = await pb.collection(COLLECTION).create(data);
  return mapBookRecord(record);
}

export async function updateBook(id: string, input: BookUpdate): Promise<Book> {
  const { data, cover, coverUrl } = splitCover(input);
  const recordData: Record<string, unknown> = { ...data };
  if ('publishedYear' in input && input.publishedYear === undefined) {
    recordData.publishedYear = null;
  }
  const record = await pb.collection(COLLECTION).update(id, recordData);
  const book = mapBookRecord(record);
  return (await attachBookCover(id, cover, coverUrl)) ?? book;
}

export async function deleteBook(id: string): Promise<void> {
  await pb.collection(COLLECTION).delete(id);
}

export function getBookCoverUrl(book: Book, thumb?: string): Promise<string | undefined> {
  return fileUrl(
    {
      id: book.id,
      collectionId: COLLECTION,
      collectionName: COLLECTION,
    },
    book.cover,
    thumb
  );
}
