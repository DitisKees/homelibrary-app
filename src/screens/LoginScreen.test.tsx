import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { i18n } from '@/i18n/core';
import LoginScreen from './LoginScreen';

const mockLogin = jest.fn();

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ login: mockLogin }),
}));

describe('<LoginScreen />', () => {
  beforeEach(async () => {
    mockLogin.mockReset();
    await i18n.changeLanguage('en');
  });

  test('shows a login error returned by the authentication service', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Invalid email or password.'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const view = render(<LoginScreen />);

    fireEvent.changeText(view.getByPlaceholderText('Email'), 'reader@example.com');
    fireEvent.changeText(view.getByPlaceholderText('Password'), 'wrong-password');
    fireEvent.press(view.getByText('Sign in'));

    await waitFor(() => {
      expect(view.getByText('Invalid email or password.')).toBeTruthy();
    });
    expect(mockLogin).toHaveBeenCalledWith('reader@example.com', 'wrong-password');

    consoleError.mockRestore();
  });

  test('renders representative UI in the selected language', async () => {
    await i18n.changeLanguage('nl');
    const view = render(<LoginScreen />);

    expect(view.getByText('HomeLibrary')).toBeTruthy();
    expect(view.getByPlaceholderText('E-mail')).toBeTruthy();
    expect(view.getByPlaceholderText('Wachtwoord')).toBeTruthy();
    expect(view.getByText('Aanmelden')).toBeTruthy();
  });
});
