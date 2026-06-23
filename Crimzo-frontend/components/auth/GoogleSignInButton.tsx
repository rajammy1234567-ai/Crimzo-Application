import React, { useEffect, useState } from 'react';
import { appAlert } from '../../lib/appAlert';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import {
  ANDROID_PACKAGE,
  getGoogleWebClientId,
  GOOGLE_ANDROID_RELEASE_SHA1,
  isExpoGo,
  isGoogleSignInAvailable,
  supportsNativeGoogleSignIn,
} from '../../lib/googleAuthConfig';

type GoogleProfile = {
  email: string;
  name?: string;
  googleId?: string;
  avatar?: string;
  idToken?: string;
};

function formatGoogleAuthError(message?: string): string {
  const lower = (message || '').toLowerCase();
  if (lower.includes('developer_error') || lower.includes('10:')) {
    return [
      'Google Console — Android OAuth client check:',
      '',
      `• Package name: ${ANDROID_PACKAGE}`,
      `• SHA-1 fingerprint: ${GOOGLE_ANDROID_RELEASE_SHA1}`,
      '• Web client ID .env / eas.json mein sahi ho',
      '',
      'Fix ke baad naya APK: npm run build:apk',
    ].join('\n');
  }
  if (
    lower.includes('access blocked')
    || lower.includes('access_denied')
    || lower.includes('403')
    || lower.includes('authorization error')
    || lower.includes('org_internal')
  ) {
    return [
      '"Access blocked" = Google OAuth app abhi Testing mode mein hai.',
      '',
      'Google Cloud Console fix:',
      '1. console.cloud.google.com → APIs & Services',
      '2. OAuth consent screen → Test users',
      '3. ADD USERS → jis Gmail se login kar rahe ho woh add karo',
      '   (ya Publishing status → Production publish karo)',
      '',
      'Credentials check:',
      `• Android client — package ${ANDROID_PACKAGE}`,
      `• SHA-1: ${GOOGLE_ANDROID_RELEASE_SHA1}`,
      '',
      'Expo Go mein kaam nahi karega — latest APK install karo.',
      'Config change ke baad: npm run build:apk',
    ].join('\n');
  }
  if (lower.includes('invalid_request') || lower.includes('redirect_uri')) {
    return [
      'OAuth redirect misconfigured.',
      '',
      'Google Console → Credentials → Android OAuth client verify karo.',
      `Package: ${ANDROID_PACKAGE}`,
      `SHA-1: ${GOOGLE_ANDROID_RELEASE_SHA1}`,
      '',
      'Naya APK build karo: npm run build:apk',
      '',
      `Details: ${message || 'Invalid request'}`,
    ].join('\n');
  }
  return message || 'Could not sign in with Google.';
}

async function signInWithNativeGoogle(): Promise<GoogleProfile> {
  const {
    GoogleSignin,
    isSuccessResponse,
    isErrorWithCode,
    statusCodes,
  } = require('@react-native-google-signin/google-signin');

  GoogleSignin.configure({
    webClientId: getGoogleWebClientId(),
    offlineAccess: false,
    scopes: ['email', 'profile'],
  });

  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  const result = await GoogleSignin.signIn();
  if (!isSuccessResponse(result)) {
    throw new Error('Google sign-in was cancelled.');
  }

  let idToken = result.data.idToken;
  if (!idToken) {
    const tokens = await GoogleSignin.getTokens();
    idToken = tokens.idToken;
  }

  const email = result.data.user.email;
  if (!email) {
    throw new Error('Google did not return an email for this account.');
  }

  return {
    email,
    name: result.data.user.name || undefined,
    googleId: result.data.user.id,
    avatar: result.data.user.photo || undefined,
    idToken: idToken || undefined,
  };
}

type Props = {
  onSuccess?: () => void;
  disabled?: boolean;
};

export default function GoogleSignInButton({ onSuccess, disabled }: Props) {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supportsNativeGoogleSignIn()) return;
    try {
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.configure({
        webClientId: getGoogleWebClientId(),
        offlineAccess: false,
        scopes: ['email', 'profile'],
      });
    } catch (e) {
      console.warn('[Google Auth] native configure failed:', e);
    }
  }, []);

  if (!isGoogleSignInAvailable()) return null;

  const handlePress = async () => {
    if (isExpoGo()) {
      appAlert(
        'Use Installed App',
        'Continue with Google works in the Crimzo APK / dev build.\n\nExpo Go mein email se login karo, ya latest APK install karo.',
      );
      return;
    }

    if (!supportsNativeGoogleSignIn()) {
      appAlert(
        'Google Sign-In',
        'Rebuild the app after updating Google config:\nnpx expo run:android\nor npm run build:apk',
      );
      return;
    }

    setBusy(true);
    try {
      const profile = await signInWithNativeGoogle();
      await signInWithGoogle(profile);
      onSuccess?.();
    } catch (err: unknown) {
      const { isErrorWithCode, statusCodes } = require('@react-native-google-signin/google-signin');
      if (isErrorWithCode(err as object)) {
        const gErr = err as { code: string };
        if (gErr.code === statusCodes.SIGN_IN_CANCELLED) return;
        if (gErr.code === statusCodes.IN_PROGRESS) return;
        if (gErr.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          appAlert('Google Play Services', 'Please install or update Google Play Services on your device.');
          return;
        }
      }
      const message = err instanceof Error ? err.message : 'Google sign-in failed';
      if (message.toLowerCase().includes('cancel')) return;
      appAlert('Google Sign-In Failed', formatGoogleAuthError(message));
    } finally {
      setBusy(false);
    }
  };

  const isDisabled = disabled || busy;

  return (
    <TouchableOpacity
      style={[s.btn, isDisabled && s.btnDisabled]}
      onPress={handlePress}
      disabled={isDisabled}
      activeOpacity={0.8}
    >
      {busy ? (
        <ActivityIndicator color="#FFF" />
      ) : (
        <View style={s.row}>
          <Ionicons name="logo-google" size={20} color="#FFF" />
          <Text style={s.text}>Continue with Google</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: {
    width: '100%',
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.55 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  text: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});