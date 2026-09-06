import {
  aggregateLendingStatistics,
  aggregateLibraryStatistics,
  aggregateReadingStatistics,
  isOverdueActiveLoan,
} from './statisticsCore';

function localIso(year: number, month: number, day: number): string {
  return new Date(year, month - 1, day, 12, 0, 0).toISOString();
}

describe('statistics aggregation', () => {
  const now = new Date(2026, 0, 10, 18, 30, 0);

  test('aggregates library counts and location data without cover metadata', () => {
    const stats = aggregateLibraryStatistics(
      [
        {
          author: 'Ada Author',
          publisher: 'North Press',
          location: 'Living room',
          created: localIso(2026, 1, 1),
        },
        {
          author: ' ada author ',
          publisher: 'South Press',
          location: ' living ROOM ',
          created: localIso(2025, 12, 31),
        },
        {
          author: 'Bob Writer',
          publisher: 'North Press',
          location: 'Study',
          created: localIso(2026, 1, 10),
        },
        { author: '', publisher: undefined, location: undefined, created: 'invalid' },
      ],
      27,
      now
    );

    expect(stats).toEqual({
      totalBooks: 27,
      uniqueAuthors: 2,
      uniquePublishers: 2,
      booksAddedThisYear: 2,
      booksByLocation: [
        { label: 'Living room', count: 2 },
        { label: 'Study', count: 1 },
      ],
    });
  });

  test('counts only the requested user reading statuses and current-year finishes', () => {
    const stats = aggregateReadingStatistics(
      [
        { user: 'user-1', status: 'want_to_read' },
        { user: 'user-1', status: 'reading' },
        { user: 'user-1', status: 'finished', finishedAt: localIso(2026, 1, 1) },
        { user: 'user-1', status: 'finished', finishedAt: localIso(2025, 12, 31) },
        { user: 'user-2', status: 'finished', finishedAt: localIso(2026, 1, 2) },
      ],
      now,
      'user-1'
    );

    expect(stats).toEqual({ wantToRead: 1, reading: 1, finished: 2, finishedThisYear: 1 });
  });

  test('calculates active, overdue, returned, and this-year loan counts', () => {
    const stats = aggregateLendingStatistics(
      [
        { dateLent: localIso(2026, 1, 1), dateDue: localIso(2026, 1, 9) },
        { dateLent: localIso(2026, 1, 2), dateDue: localIso(2026, 1, 10) },
        {
          dateLent: localIso(2025, 12, 31),
          dateDue: localIso(2026, 1, 8),
          dateReturned: localIso(2026, 1, 9),
        },
        { dateLent: localIso(2026, 1, 3) },
      ],
      now
    );

    expect(stats).toEqual({
      currentlyLentOut: 3,
      overdueActiveLoans: 1,
      returnedLoans: 1,
      loansMadeThisYear: 3,
    });
  });

  test('treats a loan due today as not overdue until the next calendar day', () => {
    expect(isOverdueActiveLoan({ dateDue: localIso(2026, 1, 10) }, now)).toBe(false);
    expect(isOverdueActiveLoan({ dateDue: localIso(2026, 1, 9) }, now)).toBe(true);
    expect(
      isOverdueActiveLoan(
        { dateDue: localIso(2026, 1, 9), dateReturned: localIso(2026, 1, 10) },
        now
      )
    ).toBe(false);
  });

  test('returns zeroed statistics for empty datasets', () => {
    expect(aggregateLibraryStatistics([], 0, now)).toEqual({
      totalBooks: 0,
      uniqueAuthors: 0,
      uniquePublishers: 0,
      booksAddedThisYear: 0,
      booksByLocation: [],
    });
    expect(aggregateReadingStatistics([], now, 'user-1')).toEqual({
      wantToRead: 0,
      reading: 0,
      finished: 0,
      finishedThisYear: 0,
    });
    expect(aggregateLendingStatistics([], now)).toEqual({
      currentlyLentOut: 0,
      overdueActiveLoans: 0,
      returnedLoans: 0,
      loansMadeThisYear: 0,
    });
  });
});
