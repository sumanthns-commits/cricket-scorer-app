import { useRef, useState, useEffect } from 'react';
import { Keyboard, Dimensions, TextInput, type ScrollView, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

// Expo Go (no native keyboard libs) + SDK 54 edge-to-edge means neither
// adjustResize nor automaticallyAdjustKeyboardInsets reliably reveals a
// focused input near the bottom of a form, so this scrolls the focused
// input into view by hand — pads nothing itself; pair with
// contentContainerStyle={{ paddingBottom: 40 + kbHeight + insets.bottom }}
// (see ClubRulesAdmin, the original source of this pattern) so the last
// field in a form has room to scroll above the keyboard at all.
export function useKeyboardScrollIntoView() {
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const [kbHeight, setKbHeight] = useState(0);

  function scrollFocusedIntoView(keyboardHeight: number) {
    if (keyboardHeight <= 0) return;
    // Let the bottom padding (driven by kbHeight) apply first, or the
    // scroll's max offset won't yet include the space we're scrolling into.
    setTimeout(() => {
      const focused = TextInput.State.currentlyFocusedInput?.();
      const sv = scrollRef.current;
      if (!focused || !sv) return;
      // measureInWindow, not measureLayout — the New Architecture rejects
      // measureLayout against a numeric node handle.
      focused.measureInWindow((_x: number, y: number, _w: number, h: number) => {
        const keyboardTop = Dimensions.get('window').height - keyboardHeight;
        const margin = 24;
        const overlap = y + h - (keyboardTop - margin);
        if (overlap > 0) sv.scrollTo({ y: scrollYRef.current + overlap, animated: true });
      });
    }, 60);
  }

  function handleInputFocus() {
    scrollFocusedIntoView(kbHeight);
  }

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      const h = e.endCoordinates?.height ?? 0;
      setKbHeight(h);
      scrollFocusedIntoView(h);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    scrollYRef.current = e.nativeEvent.contentOffset.y;
  }

  return { scrollRef, kbHeight, handleInputFocus, onScroll };
}
