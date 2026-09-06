import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createLoan,
  getActiveLoanForBook,
  listLoans,
  markLoanReturned,
  type CreateLoanInput,
} from '@/services/loans';
import { statisticsKeys } from '@/hooks/statisticsKeys';

export const loanKeys = {
  all: ['loans'] as const,
  list: () => [...loanKeys.all, 'list'] as const,
  activeForBook: (bookId: string) => [...loanKeys.all, 'active', bookId] as const,
};

export function useLoans() {
  return useQuery({
    queryKey: loanKeys.list(),
    queryFn: listLoans,
  });
}

export function useActiveLoan(bookId: string) {
  return useQuery({
    queryKey: loanKeys.activeForBook(bookId),
    queryFn: () => getActiveLoanForBook(bookId),
    enabled: bookId.length > 0,
  });
}

export function useCreateLoan(bookId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<CreateLoanInput, 'book'>) => createLoan({ ...input, book: bookId }),
    onSuccess: (loan) => {
      queryClient.setQueryData(loanKeys.activeForBook(bookId), loan);
      void queryClient.invalidateQueries({ queryKey: loanKeys.list() });
      void queryClient.invalidateQueries({ queryKey: statisticsKeys.lending() });
    },
  });
}

export function useMarkLoanReturned() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (loanId: string) => markLoanReturned(loanId),
    onSuccess: (loan) => {
      queryClient.setQueryData(loanKeys.activeForBook(loan.book), null);
      void queryClient.invalidateQueries({ queryKey: loanKeys.list() });
      void queryClient.invalidateQueries({ queryKey: statisticsKeys.lending() });
    },
  });
}
