import type { ReadingStatusValue } from '@/types/domain';

export type BreakdownItem = {
  label: string;
  count: number;
};

export type LibraryStatistics = {
  totalBooks: number;
  uniqueAuthors: number;
  uniquePublishers: number;
  booksAddedThisYear: number;
  booksByLocation: BreakdownItem[];
};

export type ReadingStatistics = {
  wantToRead: number;
  reading: number;
  finished: number;
  finishedThisYear: number;
};

export type LendingStatistics = {
  currentlyLentOut: number;
  overdueActiveLoans: number;
  returnedLoans: number;
  loansMadeThisYear: number;
};

export type LibraryStatisticsRecord = {
  author?: unknown;
  publisher?: unknown;
  location?: unknown;
  created?: unknown;
};

export type ReadingStatisticsRecord = {
  user?: unknown;
  status?: unknown;
  finishedAt?: unknown;
};

export type LendingStatisticsRecord = {
  dateLent?: unknown;
  dateDue?: unknown;
  dateReturned?: unknown;
};

function normalizedText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizedKey(value: unknown): string | undefined {
  return normalizedText(value)?.toLocaleLowerCase();
}

function dateValue(value: unknown): Date | undefined {
  const text = normalizedText(value);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function isInCurrentYear(value: unknown, now: Date): boolean {
  const date = dateValue(value);
  return !!date && date.getFullYear() === now.getFullYear();
}

function uniqueTextCount(records: LibraryStatisticsRecord[], field: 'author' | 'publisher'): number {
  const values = new Set<string>();
  records.forEach((record) => {
    const value = normalizedKey(record[field]);
    if (value) values.add(value);
  });
  return values.size;
}

function locationBreakdown(records: LibraryStatisticsRecord[]): BreakdownItem[] {
  const counts = new Map<string, BreakdownItem>();

  records.forEach((record) => {
    const label = normalizedText(record.location);
    if (!label) return;
    const key = label.toLocaleLowerCase();
    const current = counts.get(key);
    if (current) current.count += 1;
    else counts.set(key, { label, count: 1 });
  });

  return [...counts.values()].sort(
    (left, right) => right.count - left.count || left.label.localeCompare(right.label)
  );
}

export function aggregateLibraryStatistics(
  records: LibraryStatisticsRecord[],
  totalBooks: number,
  now = new Date()
): LibraryStatistics {
  return {
    totalBooks,
    uniqueAuthors: uniqueTextCount(records, 'author'),
    uniquePublishers: uniqueTextCount(records, 'publisher'),
    booksAddedThisYear: records.filter((record) => isInCurrentYear(record.created, now)).length,
    booksByLocation: locationBreakdown(records),
  };
}

export function aggregateReadingStatistics(
  records: ReadingStatisticsRecord[],
  now = new Date(),
  userId?: string
): ReadingStatistics {
  const result: ReadingStatistics = {
    wantToRead: 0,
    reading: 0,
    finished: 0,
    finishedThisYear: 0,
  };

  records.forEach((record) => {
    if (userId && normalizedText(record.user) !== userId) return;
    const status = record.status as ReadingStatusValue | undefined;
    if (status === 'want_to_read') result.wantToRead += 1;
    if (status === 'reading') result.reading += 1;
    if (status === 'finished') {
      result.finished += 1;
      if (isInCurrentYear(record.finishedAt, now)) result.finishedThisYear += 1;
    }
  });

  return result;
}

export function isOverdueActiveLoan(record: LendingStatisticsRecord, now = new Date()): boolean {
  if (normalizedText(record.dateReturned)) return false;
  const due = dateValue(record.dateDue);
  if (!due) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return due.getTime() < today.getTime();
}

export function aggregateLendingStatistics(
  records: LendingStatisticsRecord[],
  now = new Date()
): LendingStatistics {
  let currentlyLentOut = 0;
  let overdueActiveLoans = 0;
  let returnedLoans = 0;
  let loansMadeThisYear = 0;

  records.forEach((record) => {
    const returned = !!normalizedText(record.dateReturned);
    if (returned) returnedLoans += 1;
    else currentlyLentOut += 1;
    if (isOverdueActiveLoan(record, now)) overdueActiveLoans += 1;
    if (isInCurrentYear(record.dateLent, now)) loansMadeThisYear += 1;
  });

  return { currentlyLentOut, overdueActiveLoans, returnedLoans, loansMadeThisYear };
}
