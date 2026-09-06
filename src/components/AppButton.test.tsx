import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import AppButton from './AppButton';

describe('<AppButton />', () => {
  test('exposes button semantics and runs its action', () => {
    const onPress = jest.fn();
    const view = render(<AppButton label="Retry" onPress={onPress} />);

    const button = view.getByRole('button', { name: 'Retry' });
    fireEvent.press(button);

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('does not run while loading', () => {
    const onPress = jest.fn();
    const view = render(
      <AppButton label="Save" loading loadingLabel="Saving…" onPress={onPress} />
    );

    const button = view.getByRole('button', { name: 'Save' });
    expect(button.props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    fireEvent.press(button);

    expect(onPress).not.toHaveBeenCalled();
    expect(view.getByText('Saving…')).toBeTruthy();
  });
});
