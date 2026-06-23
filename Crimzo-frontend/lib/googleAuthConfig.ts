import * as Application from 'expo-application';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
export const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';

const ANDROID_PACKAGE = 'com.livestreamhub';

const expoOwner = Constants.expoConfig?.owner || 'viz_eas001';
const expoSlug = Constants.expoConfig?.slug || 'crimzo';

/** Expo Go only — must be https, added in Web client redirect URIs */
export const EXPO_GOOGLE_REDIRECT = `https://auth.expo.io/@${expoOwner}/${expoSlug}`;

export function isGoogleSignInAvailable(): boolean {
  return !!(GOOGLE_WEB_CLIENT_ID || GOOGLE_ANDROID_CLIENT_ID || GOOGLE_IOS_CLIENT_ID);
}

/** True when running inside Expo Go (not standalone APK) */
export function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

export function getGoogleRedirectUri(): string {
  if (isExpoGo()) {
    return EXPO_GOOGLE_REDIRECT;
  }
  const applicationId = Application.applicationId || ANDROID_PACKAGE;
  return `${applicationId}:/oauthredirect`;
}

/**
 * Expo Go  → Web client + https://auth.expo.io/... (Web console redirect URIs)
 * APK      → Android client + com.livestreamhub:/oauthredirect (package + SHA-1, NOT web URIs)
 */
export function getGoogleAuthRequestConfig() {
  const redirectUri = getGoogleRedirectUri();

  if (isExpoGo()) {
    return {
      webClientId: GOOGLE_WEB_CLIENT_ID || undefined,
      androidClientId: GOOGLE_WEB_CLIENT_ID || undefined,
      iosClientId: GOOGLE_IOS_CLIENT_ID || GOOGLE_WEB_CLIENT_ID || undefined,
      redirectUri,
      selectAccount: true,
    };
  }

  if (Platform.OS === 'android') {
    return {
      webClientId: GOOGLE_WEB_CLIENT_ID || undefined,
      androidClientId: GOOGLE_ANDROID_CLIENT_ID || GOOGLE_WEB_CLIENT_ID || undefined,
      iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
      redirectUri,
      selectAccount: true,
    };
  }

  return {
    webClientId: GOOGLE_WEB_CLIENT_ID || undefined,
    iosClientId: GOOGLE_IOS_CLIENT_ID || GOOGLE_WEB_CLIENT_ID || undefined,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID || undefined,
    redirectUri,
    selectAccount: true,
  };
}

/** Only https URIs belong in Google Web client — custom schemes are rejected */
export function getGoogleWebClientRedirectUris(): string[] {
  return [EXPO_GOOGLE_REDIRECT];
}