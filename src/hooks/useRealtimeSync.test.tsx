import { QueryClient } from '@tanstack/react-query';
import { pb } from '@/lib/pocketbase';
import { bookKeys } from '@/hooks/useBooks';
import { loanKeys } from '@/hooks/useLoans';
import { readingStatusKeys } from '@/hooks/useReadingStatus';
import { statisticsKeys } from '@/hooks/statisticsKeys';
import {
  invalidateReadingStatusRealtime,
  subscribeRealtime,
} from './useRealtimeSync';

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ endpoint: undefined, user: null }),
}));

jest.mock('@/lib/pocketbase', () => ({
  pb: {
    collection: jest.fn(),
  },
}));

type MockRealtimeEvent = {
  action: 'create' | 'update' | 'delete';
  record: {
    id: string;
    book?: string;
    user?: string;
  };
};

const mockCallbacks = new Map<string, (event: MockRealtimeEvent) => void>();
const mockUnsubscribeBooks = jest.fn();
const mockUnsubscribeLoans = jest.fn();
const mockUnsubscribeReading = jest.fn();
const mockUnsubscribes: Record<string, jest.Mock> = {
  books: mockUnsubscribeBooks,
  loans: mockUnsubscribeLoans,
  reading_status: mockUnsubscribeReading,
};
const mockCollection = pb.collection as jest.Mock;

function queryClientWithSpies() {
  const queryClient = new QueryClient();
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  return { queryClient, invalidate };
}

describe('realtime synchronization', () => {
  beforeEach(() => {
    mockCallbacks.clear();
    mockCollection.mockReset();
    mockUnsubscribeBooks.mockClear();
    mockUnsubscribeLoans.mockClear();
    mockUnsubscribeReading.mockClear();
    mockCollection.mockImplementation((name: string) => ({
      subscribe: jest.fn(
        async (_topic: string, callback: (event: MockRealtimeEvent) => void) => {
          mockCallbacks.set(name, callback);
          return mockUnsubscribes[name];
        }
      ),
    }));
  });

  test('invalidates targeted queries for book and loan events and unsubscribes cleanly', async () => {
    const { queryClient, invalidate } = queryClientWithSpies();
    const stop = await subscribeRealtime(queryClient, 'user-1');

    expect(mockCollection).toHaveBeenCalledTimes(3);

    mockCallbacks.get('books')?.({
      action: 'update',
      record: { id: 'book-1' },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: bookKeys.lists() });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: bookKeys.detail('book-1'),
      exact: true,
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: statisticsKeys.library() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: readingStatusKeys.list() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: loanKeys.list() });

    invalidate.mockClear();
    mockCallbacks.get('loans')?.({
      action: 'create',
      record: { id: 'loan-1', book: 'book-1' },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: loanKeys.list() });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: loanKeys.activeForBook('book-1'),
      exact: true,
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: statisticsKeys.lending() });

    stop();
    expect(mockUnsubscribeBooks).toHaveBeenCalledTimes(1);
    expect(mockUnsubscribeLoans).toHaveBeenCalledTimes(1);
    expect(mockUnsubscribeReading).toHaveBeenCalledTimes(1);
    queryClient.clear();
  });

  test('ignores reading-status records explicitly belonging to another user', () => {
    const { queryClient, invalidate } = queryClientWithSpies();

    invalidateReadingStatusRealtime(queryClient, 'user-1', {
      id: 'status-2',
      user: 'user-2',
      book: 'book-1',
    });

    expect(invalidate).not.toHaveBeenCalled();
    queryClient.clear();
  });
});
