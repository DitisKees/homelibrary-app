import { pb } from '@/lib/pocketbase';
import { getLibraryStatistics } from './statistics';

jest.mock('@/lib/pocketbase', () => ({
  pb: {
    collection: jest.fn(),
    authStore: { model: null },
    filter: jest.fn(),
  },
}));

const mockCollection = pb.collection as jest.Mock;

describe('statistics service', () => {
  beforeEach(() => {
    mockCollection.mockReset();
  });

  test('loads library statistics with a single books request', async () => {
    const getFullList = jest.fn().mockResolvedValue([
      { author: 'Ada Author', publisher: 'North Press', location: 'Study' },
      { author: 'Bob Writer', publisher: 'South Press', location: 'Living room' },
    ]);
    const getList = jest.fn();
    mockCollection.mockReturnValue({ getFullList, getList });

    const stats = await getLibraryStatistics();

    expect(mockCollection).toHaveBeenCalledTimes(1);
    expect(mockCollection).toHaveBeenCalledWith('books');
    expect(getFullList).toHaveBeenCalledTimes(1);
    expect(getFullList).toHaveBeenCalledWith({
      fields: 'author,publisher,location,created',
    });
    expect(getList).not.toHaveBeenCalled();
    expect(stats).toMatchObject({
      totalBooks: 2,
      uniqueAuthors: 2,
      uniquePublishers: 2,
    });
  });
});
