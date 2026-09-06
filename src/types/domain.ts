export type RecordId = string;

export type ReadingStatusValue = 'want_to_read' | 'reading' | 'finished';

export type DomainRecord = {
  id: RecordId;
  created: string;
  updated: string;
};

export type UserReference = DomainRecord & {
  email?: string;
  name?: string;
};

export type Book = DomainRecord & {
  title: string;
  author?: string;
  isbn10?: string;
  isbn13?: string;
  publisher?: string;
  publishedYear?: number;
  description?: string;
  cover?: string;
  location?: string;
  owner?: RecordId;
  ownerEmail?: string;
};

export type ReadingStatus = DomainRecord & {
  user: RecordId;
  book: RecordId;
  status: ReadingStatusValue;
  startedAt?: string;
  finishedAt?: string;
  rating?: number;
};

export type Loan = DomainRecord & {
  book: RecordId;
  lentBy: RecordId;
  borrowerName: string;
  borrowerContact?: string;
  dateLent: string;
  dateDue?: string;
  dateReturned?: string;
  notes?: string;
};

export type BookInput = {
  title: string;
  author?: string;
  isbn10?: string;
  isbn13?: string;
  publisher?: string;
  publishedYear?: number | null;
  description?: string;
  cover?: Blob;
  coverUrl?: string;
  location?: string;
  owner?: RecordId;
};

export type BookUpdate = Partial<BookInput>;
