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

  test('toggles password visibility without changing the entered password', () => {
    const view = render(<LoginScreen />);

    fireEvent.changeText(view.getByPlaceholderText('Password'), 'demo-password');
    expect(view.getByPlaceholderText('Password').props.secureTextEntry).toBe(true);

    fireEvent.press(view.getByLabelText('Show password'));
    expect(view.getByPlaceholderText('Password').props.secureTextEntry).toBe(false);
    expect(view.getByPlaceholderText('Password').props.value).toBe('demo-password');

    fireEvent.press(view.getByLabelText('Hide password'));
    expect(view.getByPlaceholderText('Password').props.secureTextEntry).toBe(true);
    expect(view.getByPlaceholderText('Password').props.value).toBe('demo-password');
  });

  test('keeps the form scrollable when the keyboard reduces available space', () => {
    const view = render(<LoginScreen />);
    expect(view.getByTestId('login-form-scroll').props.keyboardShouldPersistTaps).toBe('handled');
  });

  test('renders representative UI in the selected language', async () => {
    await i18n.changeLanguage('nl');
    const view = render(<LoginScreen />);

    expect(view.getByText('HomeLibrary')).toBeTruthy();
    expect(view.getByPlaceholderText('E-mail')).toBeTruthy();
    expect(view.getByPlaceholderText('Wachtwoord')).toBeTruthy();
    expect(view.getByLabelText('Wachtwoord tonen')).toBeTruthy();
    expect(view.getByText('Aanmelden')).toBeTruthy();
  });
});
