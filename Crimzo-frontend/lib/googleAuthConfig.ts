import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as AuthSession from 'expo-auth-session';
import { Platform } from 'react-native';

export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
export const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';

/** Release APK keystore SHA-1 — only needed if using native @react-native-google-signin */
export const GOOGLE_ANDROID_RELEASE_SHA1 =
  '96:D4:98:56:64:40:D3:7F:C6:42:F1:96:00:05:A0:86:F6:61:B6:C9';

export const ANDROID_PACKAGE = 'com.crimzolive';
export const APP_SCHEME = Constants.expoConfig?.scheme || 'crimzo';

const expoOwner = Constants.expoConfig?.owner || 'dev_eas_office_viz001';
const expoSlug = Constants.expoConfig?.slug || 'crimzo';

/** Expo Go redirect — add to Google Console Web client authorized redirect URIs */
export const EXPO_GOOGLE_REDIRECT = `https://auth.expo.io/@${expoOwner}/${expoSlug}`;

export function getGoogleWebClientId(): string {
  return GOOGLE_WEB_CLIENT_ID;
}

export function isGoogleSignInAvailable(): boolean {
  return !!GOOGLE_WEB_CLIENT_ID;
}

export function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

/**
 * Same browser OAuth flow as website — works on web, APK, and Expo Go.
 * (Native @react-native-google-signin needs matching SHA-1 and often breaks on APK.)
 */
export function getGoogleOAuthRedirectUri(): string {
  if (isExpoGo()) {
    return EXPO_GOOGLE_REDIRECT;
  }

  if (Platform.OS === 'web') {
    return AuthSession.makeRedirectUri({ path: 'oauthredirect' });
  }

  return AuthSession.makeRedirectUri({
    scheme: ANDROID_PACKAGE,
    path: 'oauthredirect',
  });
}

export function getGoogleWebClientRedirectUris(): string[] {
  return [
    EXPO_GOOGLE_REDIRECT,
    `${ANDROID_PACKAGE}:/oauthredirect`,
    `${APP_SCHEME}://oauthredirect`,
    'http://localhost:8081/oauthredirect',
    'http://localhost:19006/oauthredirect',
  ];
}