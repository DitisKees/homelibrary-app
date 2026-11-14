import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Keyboard, Platform, ScrollView, TextInput, type KeyboardEvent } from 'react-native';
import KeyboardFormScrollView from './KeyboardFormScrollView';

afterEach(() => jest.restoreAllMocks());

test('reveals the focused lower field on keyboard open, focus changes and resized layout', () => {
  let show: ((event: KeyboardEvent) => void) | undefined;
  const remove = jest.fn();
  jest.spyOn(Keyboard, 'addListener').mockImplementation((name, listener) => {
    if (name === 'keyboardDidShow') show = listener;
    return { remove } as unknown as ReturnType<typeof Keyboard.addListener>;
  });
  jest.spyOn(Keyboard, 'isVisible').mockReturnValue(true);
  const focused = {} as ReturnType<typeof TextInput.State.currentlyFocusedInput>;
  jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockReturnValue(focused);
  const view = render(<KeyboardFormScrollView testID="form"><TextInput multiline /></KeyboardFormScrollView>);
  const reveal = jest.fn();
  view.UNSAFE_getByType(ScrollView).instance.scrollResponderScrollNativeHandleToKeyboard = reveal;
  act(() => show?.({} as KeyboardEvent));
  expect(reveal).not.toHaveBeenCalled();
  fireEvent(view.getByTestId('form'), 'focus', {});
  act(() => show?.({} as KeyboardEvent));
  expect(reveal).toHaveBeenLastCalledWith(focused, 24, true);
  fireEvent(view.getByTestId('form'), 'layout', { nativeEvent: { layout: { width: 360, height: 300 } } });
  expect(reveal).toHaveBeenCalledTimes(3);
  jest.mocked(Keyboard.isVisible).mockReturnValue(false);
  fireEvent(view.getByTestId('form'), 'focus', {});
  expect(reveal).toHaveBeenCalledTimes(3);
  view.unmount();
  expect(remove).toHaveBeenCalled();
});

test('leaves browser input scrolling to the browser without calling native focus APIs', () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  const focused = jest.spyOn(TextInput.State, 'currentlyFocusedInput');
  const view = render(<KeyboardFormScrollView testID="web-form"><TextInput /></KeyboardFormScrollView>);
  fireEvent(view.getByTestId('web-form'), 'focus', {});
  expect(focused).not.toHaveBeenCalled();
});
