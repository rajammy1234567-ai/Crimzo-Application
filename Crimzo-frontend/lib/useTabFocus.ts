import { useCallback } from 'react';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';

/** Disables touch on inactive tab screens so video/overlays cannot block other tabs. */
export function useTabFocus(onBlur?: () => void) {
  const isFocused = useIsFocused();

  useFocusEffect(
    useCallback(() => {
      return () => {
        onBlur?.();
      };
    }, [onBlur]),
  );

  return {
    isFocused,
    pointerEvents: (isFocused ? 'auto' : 'none') as 'auto' | 'none',
  };
}