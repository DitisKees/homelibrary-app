import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Keyboard, Platform, StyleSheet, type KeyboardEvent } from 'react-native';
import { i18n } from '@/i18n/core';
import ServerSetupScreen from './ServerSetupScreen';
import LoginScreen from './LoginScreen';
import KeyboardViewport from '@/components/KeyboardViewport';

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ changeEndpoint: jest.fn(), login: jest.fn() }),
}));
jest.mock('@/services/settings/pocketbase', () => ({
  EndpointConfigurationError: class extends Error {}, testPocketBaseEndpoint: jest.fn(),
}));

afterEach(() => jest.restoreAllMocks());

for (const [name, Screen, id] of [
  ['server setup', ServerSetupScreen, 'server-setup-keyboard'],
  ['login', LoginScreen, 'login-keyboard'],
  ['authenticated screens', KeyboardViewport, 'authenticated-keyboard'],
] as const) {
  test(`${name} shrinks its Android viewport above the keyboard and restores it on dismissal`, async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const listeners: Record<string, (event: KeyboardEvent) => void> = {};
    jest.spyOn(Keyboard, 'addListener').mockImplementation((event, listener) => {
      listeners[event] = listener;
      return { remove: jest.fn() } as unknown as ReturnType<typeof Keyboard.addListener>;
    });
    await i18n.changeLanguage('en');
    const view = render(<Screen />);
    const frame = view.getByTestId(id);
    await act(async () => {
      fireEvent(frame, 'layout', {
        persist: jest.fn(), nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 640 } },
      });
    });
    const event = {
      duration: 0, easing: 'keyboard',
      endCoordinates: { screenX: 0, screenY: 300, width: 360, height: 340 },
    } as KeyboardEvent;
    await act(async () => { listeners.keyboardDidShow(event); });
    await waitFor(() => expect(StyleSheet.flatten(view.getByTestId(id).props.style)).toMatchObject({ height: 300, flex: 0 }));
    await act(async () => { listeners.keyboardDidHide(event); });
    await waitFor(() => expect(StyleSheet.flatten(view.getByTestId(id).props.style)).toMatchObject({ flex: 1 }));
    expect(StyleSheet.flatten(view.getByTestId(id).props.style).height).toBeUndefined();
  });
}
