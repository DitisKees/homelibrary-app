import { pb, validateServerSession } from '@/lib/pocketbase';
import { listBooksPage } from './books';

const mockGetList = jest.fn();
const mockValidateServerSession = jest.fn();

jest.mock('@/lib/pocketbase', () => ({
  pb: {
    authStore: { isValid: true },
    collection: () => ({ getList: mockGetList }),
    filter: jest.fn(),
  },
  validateServerSession: (...args: unknown[]) => mockValidateServerSession(...args),
  fileUrl: jest.fn(),
}));

const auth = pb.authStore as { isValid: boolean };
const validate = validateServerSession as jest.MockedFunction<typeof validateServerSession>;

describe('book listing and reset sessions', () => {
  beforeEach(() => {
    mockGetList.mockReset();
    mockValidateServerSession.mockReset();
    auth.isValid = true;
  });

  it('does not refresh authentication for a populated library', async () => {
    mockGetList.mockResolvedValueOnce({
      items: [{ id: 'book-1', title: 'Example' }],
      page: 1,
      perPage: 30,
      totalItems: 1,
      totalPages: 1,
    });
    const result = await listBooksPage();
    expect(result.items).toHaveLength(1);
    expect(validate).not.toHaveBeenCalled();
  });

  it('checks the session when a list unexpectedly appears empty', async () => {
    mockGetList.mockResolvedValueOnce({
      items: [], page: 1, perPage: 30, totalItems: 0, totalPages: 0,
    });
    mockValidateServerSession.mockResolvedValueOnce(true);
    await expect(listBooksPage()).resolves.toMatchObject({ totalItems: 0, items: [] });
    expect(validate).toHaveBeenCalledTimes(1);
  });

  it('refuses to display an empty library from a revoked token', async () => {
    mockGetList.mockResolvedValueOnce({
      items: [], page: 1, perPage: 30, totalItems: 0, totalPages: 0,
    });
    mockValidateServerSession.mockImplementationOnce(async () => {
      auth.isValid = false; // validation discarded the invalid JWT
      return false;
    });
    await expect(listBooksPage()).rejects.toThrow('Session expired');
  });

  it('keeps a genuinely empty library visible during transient network errors', async () => {
    mockGetList.mockResolvedValueOnce({
      items: [], page: 1, perPage: 30, totalItems: 0, totalPages: 0,
    });
    mockValidateServerSession.mockRejectedValueOnce(new Error('Temporary network error'));
    await expect(listBooksPage()).resolves.toMatchObject({ totalItems: 0, items: [] });
    expect(auth.isValid).toBe(true);
  });

  it('does not check auth for an ordinary search without matching books', async () => {
    mockGetList.mockResolvedValueOnce({
      items: [], page: 1, perPage: 30, totalItems: 0, totalPages: 0,
    });
    (pb.filter as jest.Mock).mockReturnValueOnce('title ~ "xyz"');
    await expect(listBooksPage(1, 30, 'xyz')).resolves.toMatchObject({ totalItems: 0 });
    expect(validate).not.toHaveBeenCalled();
  });
});
