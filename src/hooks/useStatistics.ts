import { useQuery } from '@tanstack/react-query';
import { statisticsKeys } from '@/hooks/statisticsKeys';
import {
  getLendingStatistics,
  getLibraryStatistics,
  getMyReadingStatistics,
} from '@/services/statistics';

export { statisticsKeys } from '@/hooks/statisticsKeys';

export function useLibraryStatistics() {
  return useQuery({
    queryKey: statisticsKeys.library(),
    queryFn: getLibraryStatistics,
  });
}

export function useReadingStatistics() {
  return useQuery({
    queryKey: statisticsKeys.reading(),
    queryFn: getMyReadingStatistics,
  });
}

export function useLendingStatistics() {
  return useQuery({
    queryKey: statisticsKeys.lending(),
    queryFn: getLendingStatistics,
  });
}
