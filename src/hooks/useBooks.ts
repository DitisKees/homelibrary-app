import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  attachBookCover,
  createBook,
  deleteBook,
  getBook,
  listBooks,
  listBooksPage,
  updateBook,
} from '@/services/books';
import { statisticsKeys } from '@/hooks/statisticsKeys';
import type { BookInput, BookUpdate } from '@/types/domain';

export const bookKeys = {
  all: ['books'] as const,
  lists: () => [...bookKeys.all, 'list'] as const,
  list: (page = 1, perPage = 50) => [...bookKeys.lists(), { page, perPage }] as const,
  infinite: (search = '', perPage = 30) =>
    [...bookKeys.lists(), 'infinite', { search: search.trim(), perPage }] as const,
  details: () => [...bookKeys.all, 'detail'] as const,
  detail: (id: string) => [...bookKeys.details(), id] as const,
};

export function useBooks(page = 1, perPage = 50) {
  return useQuery({
    queryKey: bookKeys.list(page, perPage),
    queryFn: () => listBooks(page, perPage),
  });
}

export function useInfiniteBooks(search = '', perPage = 30) {
  const normalizedSearch = search.trim();

  return useInfiniteQuery({
    queryKey: bookKeys.infinite(normalizedSearch, perPage),
    queryFn: ({ pageParam }) => listBooksPage(pageParam, perPage, normalizedSearch),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
  });
}

export function useBook(id: string) {
  return useQuery({
    queryKey: bookKeys.detail(id),
    queryFn: () => getBook(id),
    enabled: id.length > 0,
  });
}

export function useCreateBook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: BookInput) => {
      const book = await createBook(input);

      if (input.cover || input.coverUrl) {
        void attachBookCover(book.id, input.cover, input.coverUrl).then((bookWithCover) => {
          if (!bookWithCover) return;
          queryClient.setQueryData(bookKeys.detail(book.id), bookWithCover);
          void queryClient.invalidateQueries({ queryKey: bookKeys.lists() });
        });
      }

      return book;
    },
    onSuccess: (book) => {
      queryClient.setQueryData(bookKeys.detail(book.id), book);
      void queryClient.invalidateQueries({ queryKey: bookKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: statisticsKeys.library() });
    },
  });
}

export function useUpdateBook(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: BookUpdate) => updateBook(id, input),
    onSuccess: (book) => {
      queryClient.setQueryData(bookKeys.detail(book.id), book);
      void queryClient.invalidateQueries({ queryKey: bookKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: statisticsKeys.library() });
    },
  });
}

export function useDeleteBook(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => deleteBook(id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: bookKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: bookKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: statisticsKeys.library() });
    },
  });
}
