import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getReadingStatusForBook,
  listMyReadingStatuses,
  removeReadingStatus,
  setReadingStatus,
} from '@/services/readingStatus';
import { statisticsKeys } from '@/hooks/statisticsKeys';
import type { ReadingStatusValue } from '@/types/domain';

export const readingStatusKeys = {
  all: ['reading-status'] as const,
  list: () => [...readingStatusKeys.all, 'list'] as const,
  book: (bookId: string) => [...readingStatusKeys.all, 'book', bookId] as const,
};

export function useMyReadingStatuses() {
  return useQuery({
    queryKey: readingStatusKeys.list(),
    queryFn: listMyReadingStatuses,
  });
}

export function useReadingStatus(bookId: string) {
  return useQuery({
    queryKey: readingStatusKeys.book(bookId),
    queryFn: () => getReadingStatusForBook(bookId),
    enabled: bookId.length > 0,
  });
}

export function useSetReadingStatus(bookId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: ReadingStatusValue) => setReadingStatus(bookId, status),
    onSuccess: (entry) => {
      queryClient.setQueryData(readingStatusKeys.book(bookId), entry);
      void queryClient.invalidateQueries({ queryKey: readingStatusKeys.list() });
      void queryClient.invalidateQueries({ queryKey: statisticsKeys.reading() });
    },
  });
}

export function useRemoveReadingStatus(bookId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => removeReadingStatus(bookId),
    onSuccess: () => {
      queryClient.setQueryData(readingStatusKeys.book(bookId), null);
      void queryClient.invalidateQueries({ queryKey: readingStatusKeys.list() });
      void queryClient.invalidateQueries({ queryKey: statisticsKeys.reading() });
    },
  });
}
