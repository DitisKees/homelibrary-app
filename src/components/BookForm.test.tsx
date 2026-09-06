import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import BookForm from './BookForm';

jest.mock('@/components/BarcodeScannerButton', () => {
  const { Pressable, Text } = jest.requireActual('react-native');

  return ({ onScan }: { onScan: (isbn: string) => void }) => (
    <Pressable onPress={() => onScan('9780306406157')}>
      <Text>Scan test ISBN</Text>
    </Pressable>
  );
});

jest.mock('expo-image', () => ({
  Image: jest.requireActual('react-native').View,
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
}));

jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { WEBP: 'webp' },
}));

jest.mock('expo-file-system', () => ({
  File: jest.fn((uri: string) => ({ uri, type: 'image/webp', name: 'cover.webp' })),
}));

const mockImagePicker = jest.requireMock('expo-image-picker') as {
  launchImageLibraryAsync: jest.Mock;
};
const mockImageManipulator = jest.requireMock('expo-image-manipulator') as {
  ImageManipulator: { manipulate: jest.Mock };
};

describe('<BookForm /> Add Book validation', () => {
  test('automatically looks up metadata after scanning a valid ISBN', async () => {
    const onLookupIsbn = jest.fn().mockResolvedValue({ title: 'Scanned book' });
    const view = render(
      <BookForm
        heading="Add a book"
        help="Only the title is required."
        submitLabel="Save book"
        pendingLabel="Saving…"
        isPending={false}
        onLookupIsbn={onLookupIsbn}
        onSubmit={jest.fn()}
      />
    );

    fireEvent.press(view.getByText('Scan test ISBN'));

    await waitFor(() => {
      expect(onLookupIsbn).toHaveBeenCalledWith('9780306406157');
      expect(view.getByDisplayValue('Scanned book')).toBeTruthy();
    });
  });

  test('requires a title before submitting a new book', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const view = render(
      <BookForm
        heading="Add a book"
        help="Only the title is required."
        submitLabel="Save book"
        pendingLabel="Saving…"
        isPending={false}
        onSubmit={onSubmit}
      />
    );

    fireEvent.press(view.getByText('Save book'));

    await waitFor(() => {
      expect(view.getByText('Title is required.')).toBeTruthy();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });


  test('wraps a processed native cover in an Expo File for upload', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const saveAsync = jest.fn().mockResolvedValue({ uri: 'file:///processed-cover.webp' });
    const renderAsync = jest.fn().mockResolvedValue({ saveAsync });
    const resize = jest.fn();
    mockImageManipulator.ImageManipulator.manipulate.mockReturnValue({ resize, renderAsync });
    mockImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///camera-photo.jpg', fileName: 'camera-photo.jpg' }],
    });

    const view = render(
      <BookForm
        heading="Add a book"
        help="Only the title is required."
        submitLabel="Save book"
        pendingLabel="Saving…"
        isPending={false}
        onSubmit={onSubmit}
      />
    );

    fireEvent.changeText(view.getByLabelText('Title'), 'Test book');
    fireEvent.press(view.getByText('Choose cover'));

    await waitFor(() => {
      expect(view.getByText('camera-photo.jpg')).toBeTruthy();
    });

    fireEvent.press(view.getByText('Save book'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test book',
          cover: expect.objectContaining({
            uri: 'file:///processed-cover.webp',
          }),
        })
      );
    });
  });
});
