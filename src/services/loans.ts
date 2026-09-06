import type { RecordModel } from 'pocketbase';
import { pb } from '@/lib/pocketbase';
import { mapBookRecord } from '@/services/books';
import type { Book, Loan } from '@/types/domain';

const COLLECTION = 'loans';

export type LoanEntry = Loan & {
  bookDetails?: Book;
};

export type CreateLoanInput = {
  book: string;
  borrowerName: string;
  borrowerContact?: string;
  dateLent: string;
  dateDue?: string;
  notes?: string;
};

function currentUserId(): string {
  const id = pb.authStore.model?.id;
  if (!id) throw new Error('You must be signed in to lend a book.');
  return id;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function mapLoanRecord(record: RecordModel): LoanEntry {
  const expandedBook = record.expand?.book;
  return {
    id: record.id,
    created: record.created,
    updated: record.updated,
    book: String(record.book ?? ''),
    lentBy: String(record.lentBy ?? ''),
    borrowerName: String(record.borrowerName ?? ''),
    borrowerContact: optionalString(record.borrowerContact),
    dateLent: String(record.dateLent ?? ''),
    dateDue: optionalString(record.dateDue),
    dateReturned: optionalString(record.dateReturned),
    notes: optionalString(record.notes),
    bookDetails:
      expandedBook && !Array.isArray(expandedBook) ? mapBookRecord(expandedBook) : undefined,
  };
}

export async function listLoans(): Promise<LoanEntry[]> {
  const records = await pb.collection(COLLECTION).getFullList({
    sort: '-dateLent,-created',
    expand: 'book',
  });
  return records.map(mapLoanRecord);
}

export async function getActiveLoanForBook(bookId: string): Promise<LoanEntry | null> {
  const result = await pb.collection(COLLECTION).getList(1, 1, {
    filter: pb.filter('book = {:book} && dateReturned = ""', { book: bookId }),
    sort: '-dateLent,-created',
    expand: 'book',
  });
  return result.items[0] ? mapLoanRecord(result.items[0]) : null;
}

export async function createLoan(input: CreateLoanInput): Promise<LoanEntry> {
  const active = await getActiveLoanForBook(input.book);
  if (active) {
    throw new Error(`This book is already lent to ${active.borrowerName}.`);
  }

  const data: Record<string, unknown> = {
    book: input.book,
    lentBy: currentUserId(),
    borrowerName: input.borrowerName.trim(),
    dateLent: input.dateLent,
  };
  if (input.borrowerContact?.trim()) data.borrowerContact = input.borrowerContact.trim();
  if (input.dateDue) data.dateDue = input.dateDue;
  if (input.notes?.trim()) data.notes = input.notes.trim();

  const record = await pb.collection(COLLECTION).create(data, { expand: 'book' });
  return mapLoanRecord(record);
}

export async function markLoanReturned(loanId: string): Promise<LoanEntry> {
  const record = await pb.collection(COLLECTION).update(
    loanId,
    { dateReturned: new Date().toISOString() },
    { expand: 'book' }
  );
  return mapLoanRecord(record);
}
