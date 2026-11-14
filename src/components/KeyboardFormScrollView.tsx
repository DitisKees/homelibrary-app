import React from 'react';
import { Keyboard, Platform, ScrollView, TextInput, type ScrollViewProps } from 'react-native';

// Resizing exposes scroll space; explicitly reveal lower focused fields once
// the keyboard and viewport have finished moving, including multiline inputs.
export default function KeyboardFormScrollView({ onFocus, onBlur, onLayout, ...props }: ScrollViewProps) {
  const scroll = React.useRef<ScrollView>(null);
  const ownsFocus = React.useRef(false);
  const revealFocusedInput = React.useCallback(() => {
    if (Platform.OS === 'web' || !ownsFocus.current || !Keyboard.isVisible()) return;
    const focused = TextInput.State.currentlyFocusedInput();
    if (focused) {
      scroll.current?.scrollResponderScrollNativeHandleToKeyboard(focused, 24, true);
    }
  }, []);
  React.useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', revealFocusedInput);
    return () => subscription.remove();
  }, [revealFocusedInput]);
  return (
    <ScrollView {...props} ref={scroll}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      onFocus={(event) => { ownsFocus.current = true; onFocus?.(event); revealFocusedInput(); }}
      onBlur={(event) => { ownsFocus.current = false; onBlur?.(event); }}
      onLayout={(event) => { onLayout?.(event); revealFocusedInput(); }}
    />
  );
}
