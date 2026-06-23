import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';
import { appAlert } from '../lib/appAlert';

const PRIVACY_KEY = 'crimzo-global';

/**
 * Blocks screenshots & screen recording app-wide (Android FLAG_SECURE, iOS 11+/13+).
 * Also blurs app in iOS app switcher / background.
 */
export default function ScreenPrivacy() {
  useEffect(() => {
    if (Platform.OS === 'web') return;

    let active = true;

    const enable = async () => {
      try {
        const available = await ScreenCapture.isAvailableAsync();
        if (!available || !active) return;

        await ScreenCapture.preventScreenCaptureAsync(PRIVACY_KEY);

        if (Platform.OS === 'ios') {
          await ScreenCapture.enableAppSwitcherProtectionAsync(0.85);
        }
      } catch (e) {
        console.warn('[ScreenPrivacy] enable failed:', e);
      }
    };

    void enable();

    let screenshotSub: { remove: () => void } | null = null;
    try {
      screenshotSub = ScreenCapture.addScreenshotListener(() => {
        appAlert(
          'Screen Capture Not Allowed',
          'Screenshots and screen recording are disabled in Crimzo to protect creators and users.',
        );
      });
    } catch (e) {
      console.warn('[ScreenPrivacy] screenshot listener unavailable:', e);
    }

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void enable();
      }
    });

    return () => {
      active = false;
      screenshotSub?.remove();
      appStateSub.remove();
      void ScreenCapture.allowScreenCaptureAsync(PRIVACY_KEY).catch(() => {});
      if (Platform.OS === 'ios') {
        void ScreenCapture.disableAppSwitcherProtectionAsync().catch(() => {});
      }
    };
  }, []);

  return null;
}