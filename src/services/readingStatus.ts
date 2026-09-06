import type { RecordModel } from 'pocketbase';
import { pb } from '@/lib/pocketbase';
import { mapBookRecord } from '@/services/books';
import type { Book, ReadingStatus, ReadingStatusValue } from '@/types/domain';

const COLLECTION = 'reading_status';

export type ReadingStatusEntry = ReadingStatus & {
  bookDetails?: Book;
};

function currentUserId(): string {
  const id = pb.authStore.model?.id;
  if (!id) throw new Error('You must be signed in to update reading status.');
  return id;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function mapReadingStatusRecord(record: RecordModel): ReadingStatusEntry {
  const expandedBook = record.expand?.book;
  return {
    id: record.id,
    created: record.created,
    updated: record.updated,
    user: String(record.user ?? ''),
    book: String(record.book ?? ''),
    status: record.status as ReadingStatusValue,
    startedAt: optionalString(record.startedAt),
    finishedAt: optionalString(record.finishedAt),
    rating: typeof record.rating === 'number' ? record.rating : undefined,
    bookDetails:
      expandedBook && !Array.isArray(expandedBook) ? mapBookRecord(expandedBook) : undefined,
  };
}

export async function listMyReadingStatuses(): Promise<ReadingStatusEntry[]> {
  const user = currentUserId();
  const records = await pb.collection(COLLECTION).getFullList({
    filter: pb.filter('user = {:user}', { user }),
    sort: '-updated',
    expand: 'book',
  });
  return records.map(mapReadingStatusRecord);
}

export async function getReadingStatusForBook(
  bookId: string
): Promise<ReadingStatusEntry | null> {
  const user = currentUserId();
  const result = await pb.collection(COLLECTION).getList(1, 1, {
    filter: pb.filter('user = {:user} && book = {:book}', { user, book: bookId }),
    expand: 'book',
  });
  return result.items[0] ? mapReadingStatusRecord(result.items[0]) : null;
}

function transitionData(
  status: ReadingStatusValue,
  current?: ReadingStatusEntry | null
): Record<string, unknown> {
  const now = new Date().toISOString();

  if (status === 'want_to_read') {
    return { status, startedAt: null, finishedAt: null };
  }
  if (status === 'reading') {
    return {
      status,
      startedAt: current?.startedAt ?? now,
      finishedAt: null,
    };
  }
  return {
    status,
    startedAt: current?.startedAt ?? null,
    finishedAt: current?.finishedAt ?? now,
  };
}

export async function setReadingStatus(
  bookId: string,
  status: ReadingStatusValue
): Promise<ReadingStatusEntry> {
  const user = currentUserId();
  const current = await getReadingStatusForBook(bookId);

  if (current?.status === status) return current;

  const data = transitionData(status, current);
  const record = current
    ? await pb.collection(COLLECTION).update(current.id, data, { expand: 'book' })
    : await pb.collection(COLLECTION).create(
        { user, book: bookId, ...data },
        { expand: 'book' }
      );
  return mapReadingStatusRecord(record);
}

export async function removeReadingStatus(bookId: string): Promise<void> {
  const current = await getReadingStatusForBook(bookId);
  if (current) await pb.collection(COLLECTION).delete(current.id);
}
