import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCreateBook, bookKeys } from './useBooks';
import { attachBookCover, createBook } from '@/services/books';

jest.mock('@/services/books', () => ({
  attachBookCover: jest.fn(),
  createBook: jest.fn(),
  deleteBook: jest.fn(),
  getBook: jest.fn(),
  listBooks: jest.fn(),
  listBooksPage: jest.fn(),
  updateBook: jest.fn(),
}));

const mockCreateBook = createBook as jest.MockedFunction<typeof createBook>;
const mockAttachBookCover = attachBookCover as jest.MockedFunction<typeof attachBookCover>;

describe('useCreateBook', () => {
  test('resolves the create mutation without waiting for cover attachment', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { gcTime: Infinity },
      },
    });
    let resolveCover: ((value: Awaited<ReturnType<typeof attachBookCover>>) => void) | undefined;
    const coverPromise = new Promise<Awaited<ReturnType<typeof attachBookCover>>>((resolve) => {
      resolveCover = resolve;
    });
    const book = {
      id: 'book-1',
      created: '2026-09-02T10:00:00.000Z',
      updated: '2026-09-02T10:00:00.000Z',
      title: 'Test book',
    };
    const blob = {} as Blob;

    mockCreateBook.mockResolvedValue(book);
    mockAttachBookCover.mockReturnValue(coverPromise);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result, unmount } = renderHook(() => useCreateBook(), { wrapper });

    try {
      let createdBook;
      await act(async () => {
        createdBook = await result.current.mutateAsync({ title: 'Test book', cover: blob });
      });

      expect(createdBook).toEqual(book);
      expect(mockAttachBookCover).toHaveBeenCalledWith('book-1', blob, undefined);
      expect(queryClient.getQueryData(bookKeys.detail('book-1'))).toEqual(book);

      await act(async () => {
        resolveCover?.(undefined);
        await coverPromise;
      });
    } finally {
      unmount();
      queryClient.clear();
    }
  });
});
