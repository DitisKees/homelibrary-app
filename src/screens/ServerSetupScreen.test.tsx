import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { i18n } from '@/i18n/core';
import ServerSetupScreen from './ServerSetupScreen';
import { testPocketBaseEndpoint } from '@/services/settings/pocketbase';

const mockChangeEndpoint = jest.fn();
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ changeEndpoint: mockChangeEndpoint }) }));
jest.mock('@/services/settings/pocketbase', () => ({
  EndpointConfigurationError: class extends Error {},
  testPocketBaseEndpoint: jest.fn(),
}));
const testEndpoint = jest.mocked(testPocketBaseEndpoint);

beforeEach(async () => {
  jest.clearAllMocks();
  await i18n.changeLanguage('en');
});

test('allows scrolling and button taps when the keyboard reduces the viewport', async () => {
  testEndpoint.mockResolvedValueOnce('https://books.example.com');
  const view = render(<ServerSetupScreen />);
  const scroll = view.getByTestId('server-setup-form-scroll');
  expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
  expect(StyleSheet.flatten(scroll.props.contentContainerStyle)).toMatchObject({ flexGrow: 1, justifyContent: 'center' });
  fireEvent.changeText(view.getByPlaceholderText('https://books.example.com'), 'https://books.example.com');
  fireEvent.press(view.getByRole('button'));
  await waitFor(() => expect(mockChangeEndpoint).toHaveBeenCalledWith('https://books.example.com'));
});

test('keeps server test errors in the scrollable form and permits retry', async () => {
  testEndpoint.mockRejectedValueOnce(new Error('offline'));
  const view = render(<ServerSetupScreen />);
  fireEvent.press(view.getByRole('button'));
  await waitFor(() => expect(view.getByRole('alert')).toBeTruthy());
  expect(view.getByTestId('server-setup-form-scroll').findByProps({ accessibilityRole: 'alert' })).toBeTruthy();
  testEndpoint.mockResolvedValueOnce('https://books.example.com');
  fireEvent.press(view.getByRole('button'));
  await waitFor(() => expect(mockChangeEndpoint).toHaveBeenCalledWith('https://books.example.com'));
});
