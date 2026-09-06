import React from 'react';
import { render } from '@testing-library/react-native';
import LibraryScreen from './LibraryScreen';
import type { Book } from '@/types/domain';

const mockNavigate = jest.fn();
const mockUseInfiniteBooks = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('@/hooks/useBooks', () => ({
  useInfiniteBooks: (...args: unknown[]) => mockUseInfiniteBooks(...args),
}));

jest.mock('@/services/books', () => ({
  getBookCoverUrl: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-image', () => ({
  Image: jest.requireActual('react-native').View,
}));

function queryResult(books: Book[]) {
  return {
    data: { pages: [{ items: books }] },
    isPending: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
    isRefetching: false,
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
  };
}

describe('<LibraryScreen />', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockUseInfiniteBooks.mockReset();
  });

  test('shows the empty-library state', () => {
    mockUseInfiniteBooks.mockReturnValue(queryResult([]));
    const view = render(<LibraryScreen />);

    expect(view.getByText('No books yet')).toBeTruthy();
    expect(view.getByText('Add your first book to start the library.')).toBeTruthy();
  });

  test('shows books returned by the catalogue query', () => {
    const book: Book = {
      id: 'book-1',
      created: '2026-09-01T10:00:00.000Z',
      updated: '2026-09-01T10:00:00.000Z',
      title: 'The Hobbit',
      author: 'J.R.R. Tolkien',
      location: 'Living room',
    };
    mockUseInfiniteBooks.mockReturnValue(queryResult([book]));
    const view = render(<LibraryScreen />);

    expect(view.getByText('The Hobbit')).toBeTruthy();
    expect(view.getByText('J.R.R. Tolkien')).toBeTruthy();
    expect(view.getByText('Living room')).toBeTruthy();
  });
});
