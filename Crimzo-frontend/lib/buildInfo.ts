import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Human-readable release stamp — bump when shipping a new APK. */
export const BUILD_STAMP = '2026-06-16-v22';

export const APP_VERSION =
  Constants.expoConfig?.version ??
  Constants.nativeAppVersion ??
  '4.0.2';

export function getBuildNumber(): string {
  if (Platform.OS === 'android') {
    const code = Constants.expoConfig?.android?.versionCode;
    if (code != null) return String(code);
  }
  if (Platform.OS === 'ios') {
    const build = Constants.expoConfig?.ios?.buildNumber;
    if (build) return build;
  }
  return Constants.nativeBuildVersion ?? '?';
}

export function getBuildLabel(): string {
  return `v${APP_VERSION} (build ${getBuildNumber()}) · ${BUILD_STAMP}`;
}