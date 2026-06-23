import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
export const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';

/** Release APK keystore SHA-1 — must match Google Console Android OAuth client */
export const GOOGLE_ANDROID_RELEASE_SHA1 =
  '96:D4:98:56:64:40:D3:7F:C6:42:F1:96:00:05:A0:86:F6:61:B6:C9';

export const ANDROID_PACKAGE = 'com.livestreamhub';

function clientIdToReverseScheme(clientId: string): string | null {
  const match = clientId.match(/^([\w-]+)\.apps\.googleusercontent\.com$/);
  return match ? `com.googleusercontent.apps.${match[1]}` : null;
}

export function getGoogleWebReverseScheme(): string | null {
  return clientIdToReverseScheme(GOOGLE_WEB_CLIENT_ID);
}

export function getGoogleAndroidReverseScheme(): string | null {
  return clientIdToReverseScheme(GOOGLE_ANDROID_CLIENT_ID);
}

const expoOwner = Constants.expoConfig?.owner || 'dev_eas_office_viz001';
const expoSlug = Constants.expoConfig?.slug || 'crimzo';

/** Expo Go only — legacy web redirect (not used with native sign-in) */
export const EXPO_GOOGLE_REDIRECT = `https://auth.expo.io/@${expoOwner}/${expoSlug}`;

export function getGoogleWebClientId(): string {
  return GOOGLE_WEB_CLIENT_ID;
}

export function isGoogleSignInAvailable(): boolean {
  return !!GOOGLE_WEB_CLIENT_ID;
}

/** True when running inside Expo Go (not standalone APK) */
export function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

/** Native Google Sign-In works in dev build / APK — not in Expo Go */
export function supportsNativeGoogleSignIn(): boolean {
  if (isExpoGo()) return false;
  if (!GOOGLE_WEB_CLIENT_ID) return false;
  if (Platform.OS === 'web') return false;
  return true;
}

/** @deprecated Use native Google Sign-In; kept for error messages */
export function getGoogleRedirectUri(): string {
  return `${Constants.expoConfig?.android?.package || 'com.livestreamhub'}:/oauthredirect`;
}

export function getGoogleWebClientRedirectUris(): string[] {
  return [EXPO_GOOGLE_REDIRECT];
}