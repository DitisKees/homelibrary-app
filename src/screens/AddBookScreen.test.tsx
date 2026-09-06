import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AddBookScreen from './AddBookScreen';

const mockNavigate = jest.fn();
const mockMutateAsync = jest.fn();
const mockFindBooksByIsbn = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('@/hooks/useBooks', () => ({
  useCreateBook: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

jest.mock('@/services/books', () => ({
  findBooksByIsbn: (...args: unknown[]) => mockFindBooksByIsbn(...args),
}));

jest.mock('@/services/books/metadata', () => ({
  lookupBookMetadata: jest.fn(),
}));

jest.mock('@/components/BookForm', () => {
  const ReactActual = jest.requireActual('react');
  const { Pressable, Text, TextInput, View } = jest.requireActual('react-native');

  function MockBookForm({ onSubmit }: { onSubmit: (values: { title: string }) => Promise<void> }) {
    const [draft, setDraft] = ReactActual.useState('');
    return (
      <View>
        <TextInput testID="draft-title" value={draft} onChangeText={setDraft} />
        <Pressable testID="submit-book" onPress={() => void onSubmit({ title: draft })}>
          <Text>Submit</Text>
        </Pressable>
      </View>
    );
  }

  return {
    __esModule: true,
    default: MockBookForm,
  };
});

describe('<AddBookScreen />', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockMutateAsync.mockReset();
    mockFindBooksByIsbn.mockReset();
    mockFindBooksByIsbn.mockResolvedValue([]);
  });

  test('preserves an unfinished draft while the form remains mounted', () => {
    const view = render(<AddBookScreen />);
    fireEvent.changeText(view.getByTestId('draft-title'), 'Unfinished draft');

    view.rerender(<AddBookScreen />);

    expect(view.getByTestId('draft-title').props.value).toBe('Unfinished draft');
  });

  test('remounts a fresh form after a successful creation', async () => {
    mockMutateAsync.mockResolvedValue({
      id: 'book-1',
      created: '2026-09-04T20:00:00.000Z',
      updated: '2026-09-04T20:00:00.000Z',
      title: 'Saved book',
    });
    const view = render(<AddBookScreen />);
    fireEvent.changeText(view.getByTestId('draft-title'), 'Saved book');

    await act(async () => {
      fireEvent.press(view.getByTestId('submit-book'));
    });

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({ title: 'Saved book' });
      expect(view.getByTestId('draft-title').props.value).toBe('');
      expect(mockNavigate).toHaveBeenCalledWith('BookDetail', { bookId: 'book-1' });
    });
  });
});
