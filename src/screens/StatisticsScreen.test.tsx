import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { i18n } from '@/i18n/core';
import {
  useLendingStatistics,
  useLibraryStatistics,
  useReadingStatistics,
} from '@/hooks/useStatistics';
import StatisticsScreen from './StatisticsScreen';

jest.mock('@/hooks/useStatistics', () => ({
  useLibraryStatistics: jest.fn(),
  useReadingStatistics: jest.fn(),
  useLendingStatistics: jest.fn(),
}));

const mockLibrary = jest.mocked(useLibraryStatistics);
const mockReading = jest.mocked(useReadingStatistics);
const mockLending = jest.mocked(useLendingStatistics);

function queryResult(data: unknown, overrides: Record<string, unknown> = {}) {
  return {
    data,
    isPending: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
    ...overrides,
  } as never;
}

describe('<StatisticsScreen />', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    mockLibrary.mockReset();
    mockReading.mockReset();
    mockLending.mockReset();
  });

  test('renders summary metrics and the location breakdown', () => {
    mockLibrary.mockReturnValue(
      queryResult({
        totalBooks: 27,
        uniqueAuthors: 12,
        uniquePublishers: 8,
        booksAddedThisYear: 4,
        booksByLocation: [
          { label: 'Living room', count: 18 },
          { label: 'Study', count: 9 },
        ],
      })
    );
    mockReading.mockReturnValue(
      queryResult({ wantToRead: 5, reading: 2, finished: 14, finishedThisYear: 6 })
    );
    mockLending.mockReturnValue(
      queryResult({
        currentlyLentOut: 3,
        overdueActiveLoans: 1,
        returnedLoans: 11,
        loansMadeThisYear: 7,
      })
    );

    const view = render(<StatisticsScreen />);

    expect(view.getByText('Total books')).toBeTruthy();
    expect(view.getByText('27')).toBeTruthy();
    expect(view.getByText('Books by location')).toBeTruthy();
    expect(view.getByText('Living room')).toBeTruthy();
    expect(view.getByText('Finished this year')).toBeTruthy();
    expect(view.getByText('Overdue')).toBeTruthy();
  });

  test('shows a translated loading state for an unfinished section', () => {
    mockLibrary.mockReturnValue(queryResult(undefined, { isPending: true }));
    mockReading.mockReturnValue(queryResult({ wantToRead: 0, reading: 0, finished: 0, finishedThisYear: 0 }));
    mockLending.mockReturnValue(
      queryResult({ currentlyLentOut: 0, overdueActiveLoans: 0, returnedLoans: 0, loansMadeThisYear: 0 })
    );

    const view = render(<StatisticsScreen />);
    expect(view.getByText('Loading Library statistics…')).toBeTruthy();
  });

  test('keeps successful sections visible when another section fails and retries only that section', () => {
    const retryLibrary = jest.fn();
    mockLibrary.mockReturnValue(
      queryResult(undefined, { isError: true, refetch: retryLibrary })
    );
    mockReading.mockReturnValue(
      queryResult({ wantToRead: 2, reading: 1, finished: 9, finishedThisYear: 3 })
    );
    mockLending.mockReturnValue(
      queryResult({ currentlyLentOut: 1, overdueActiveLoans: 0, returnedLoans: 4, loansMadeThisYear: 2 })
    );

    const view = render(<StatisticsScreen />);

    expect(view.getByText('Could not load Library statistics.')).toBeTruthy();
    expect(view.getByText('Want to read')).toBeTruthy();
    expect(view.getByText('Currently lent out')).toBeTruthy();
    fireEvent.press(view.getByText('Retry'));
    expect(retryLibrary).toHaveBeenCalledTimes(1);
  });
});
