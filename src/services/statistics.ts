import { pb } from '@/lib/pocketbase';
import {
  aggregateLendingStatistics,
  aggregateLibraryStatistics,
  aggregateReadingStatistics,
  type LendingStatistics,
  type LendingStatisticsRecord,
  type LibraryStatistics,
  type ReadingStatistics,
  type ReadingStatisticsRecord,
} from '@/services/statisticsCore';

export async function getLibraryStatistics(): Promise<LibraryStatistics> {
  const records = await pb.collection('books').getFullList({
    fields: 'author,publisher,location,created',
  });

  // We already need every visible book for the metadata/location breakdowns, so
  // use that same result for the total instead of issuing a concurrent getList
  // request to the same PocketBase records endpoint. PocketBase auto-cancels
  // concurrent requests with the same method/path by default.
  return aggregateLibraryStatistics(records, records.length);
}

export async function getMyReadingStatistics(): Promise<ReadingStatistics> {
  const user = pb.authStore.model?.id;
  if (!user) throw new Error('Authentication required');

  const records = await pb.collection('reading_status').getFullList({
    filter: pb.filter('user = {:user}', { user }),
    fields: 'user,status,finishedAt',
  });
  const statisticsRecords: ReadingStatisticsRecord[] = records.map((record) => ({
    user: record.user,
    status: record.status,
    finishedAt: record.finishedAt,
  }));
  return aggregateReadingStatistics(statisticsRecords, new Date(), user);
}

export async function getLendingStatistics(): Promise<LendingStatistics> {
  const records = await pb.collection('loans').getFullList({
    fields: 'dateLent,dateDue,dateReturned',
  });
  const statisticsRecords: LendingStatisticsRecord[] = records.map((record) => ({
    dateLent: record.dateLent,
    dateDue: record.dateDue,
    dateReturned: record.dateReturned,
  }));
  return aggregateLendingStatistics(statisticsRecords);
}

export type {
  BreakdownItem,
  LendingStatistics,
  LibraryStatistics,
  ReadingStatistics,
} from '@/services/statisticsCore';
