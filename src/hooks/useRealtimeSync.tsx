import React from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { bookKeys } from '@/hooks/useBooks';
import { loanKeys } from '@/hooks/useLoans';
import { readingStatusKeys } from '@/hooks/useReadingStatus';
import { statisticsKeys } from '@/hooks/statisticsKeys';
import { pb } from '@/lib/pocketbase';

type RealtimeRecord = {
  id: string;
  book?: unknown;
  user?: unknown;
};

export function invalidateBookRealtime(
  queryClient: QueryClient,
  action: string,
  record: RealtimeRecord
): void {
  void queryClient.invalidateQueries({ queryKey: bookKeys.lists() });
  void queryClient.invalidateQueries({ queryKey: statisticsKeys.library() });

  // Reading and lending entries expand their related book record, so book
  // metadata changes need to refresh those cached projections as well.
  void queryClient.invalidateQueries({ queryKey: readingStatusKeys.list() });
  void queryClient.invalidateQueries({ queryKey: loanKeys.list() });

  if (action === 'delete') {
    queryClient.removeQueries({ queryKey: bookKeys.detail(record.id), exact: true });
    return;
  }

  if (action === 'update') {
    void queryClient.invalidateQueries({ queryKey: bookKeys.detail(record.id), exact: true });
    void queryClient.invalidateQueries({ queryKey: readingStatusKeys.book(record.id), exact: true });
    void queryClient.invalidateQueries({ queryKey: loanKeys.activeForBook(record.id), exact: true });
  }
}

export function invalidateLoanRealtime(queryClient: QueryClient, record: RealtimeRecord): void {
  void queryClient.invalidateQueries({ queryKey: loanKeys.list() });
  void queryClient.invalidateQueries({ queryKey: statisticsKeys.lending() });

  if (typeof record.book === 'string' && record.book.length > 0) {
    void queryClient.invalidateQueries({
      queryKey: loanKeys.activeForBook(record.book),
      exact: true,
    });
  }
}

export function invalidateReadingStatusRealtime(
  queryClient: QueryClient,
  userId: string,
  record: RealtimeRecord
): void {
  // PocketBase collection rules already scope realtime events, but keep an
  // explicit client-side guard too in case the server rules are broadened later.
  if (typeof record.user === 'string' && record.user.length > 0 && record.user !== userId) {
    return;
  }

  void queryClient.invalidateQueries({ queryKey: readingStatusKeys.list() });
  void queryClient.invalidateQueries({ queryKey: statisticsKeys.reading() });

  if (typeof record.book === 'string' && record.book.length > 0) {
    void queryClient.invalidateQueries({
      queryKey: readingStatusKeys.book(record.book),
      exact: true,
    });
  }
}

export async function subscribeRealtime(queryClient: QueryClient, userId: string) {
  const cleanup: Array<() => void> = [];

  try {
    cleanup.push(
      await pb.collection('books').subscribe('*', (event) => {
        invalidateBookRealtime(queryClient, event.action, event.record);
      })
    );
    cleanup.push(
      await pb.collection('loans').subscribe('*', (event) => {
        invalidateLoanRealtime(queryClient, event.record);
      })
    );
    cleanup.push(
      await pb.collection('reading_status').subscribe('*', (event) => {
        invalidateReadingStatusRealtime(queryClient, userId, event.record);
      })
    );
  } catch (error) {
    cleanup.splice(0).forEach((unsubscribe) => unsubscribe());
    throw error;
  }

  return () => {
    cleanup.splice(0).forEach((unsubscribe) => unsubscribe());
  };
}

export default function RealtimeSync() {
  const queryClient = useQueryClient();
  const { endpoint, user } = useAuth();
  const userId = user?.id;

  React.useEffect(() => {
    if (!endpoint || !userId) return;

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void subscribeRealtime(queryClient, userId)
      .then((stop) => {
        if (cancelled) stop();
        else unsubscribe = stop;
      })
      .catch((error) => {
        if (!cancelled) console.warn('Realtime subscription setup failed.', error);
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [endpoint, queryClient, userId]);

  return null;
}
