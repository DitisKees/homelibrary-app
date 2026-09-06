export const statisticsKeys = {
  all: ['statistics'] as const,
  library: () => [...statisticsKeys.all, 'library'] as const,
  reading: () => [...statisticsKeys.all, 'reading'] as const,
  lending: () => [...statisticsKeys.all, 'lending'] as const,
};
