import React, { useCallback, useState } from 'react';
import { appAlert } from '../../lib/appAlert';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import type { AuthSessionResult } from 'expo-auth-session';
import { useAuth } from '../../contexts/AuthContext';
import {
  ANDROID_PACKAGE,
  getGoogleOAuthRedirectUri,
  getGoogleWebClientId,
  GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  isExpoGo,
  isGoogleSignInAvailable,
} from '../../lib/googleAuthConfig';

WebBrowser.maybeCompleteAuthSession();

type GoogleProfile = {
  email: string;
  name?: string;
  googleId?: string;
  avatar?: string;
  idToken?: string;
};

function formatGoogleAuthError(message?: string): string {
  const lower = (message || '').toLowerCase();
  if (lower.includes('redirect_uri_mismatch') || lower.includes('redirect uri')) {
    return [
      'Google redirect URI match nahi ho rahi.',
      '',
      'Google Cloud Console → Credentials → Web client →',
      'Authorized redirect URIs mein ye add karo:',
      `• ${getGoogleOAuthRedirectUri()}`,
      isExpoGo() ? '• https://auth.expo.io/@... (Expo Go)' : `• ${ANDROID_PACKAGE}:/oauthredirect`,
      Platform.OS === 'web' ? '• Apni website URL (jaise https://crimzo.live/oauthredirect)' : '',
    ].filter(Boolean).join('\n');
  }
  if (
    lower.includes('access blocked')
    || lower.includes('access_denied')
    || lower.includes('403')
    || lower.includes('authorization error')
    || lower.includes('org_internal')
  ) {
    return [
      'Google OAuth app Testing mode mein ho sakti hai.',
      '',
      'Google Cloud Console → OAuth consent screen → Test users',
      'Apna Gmail test user mein add karo (ya Production publish karo).',
    ].join('\n');
  }
  return message || 'Could not sign in with Google.';
}

function decodeJwtPayload(idToken: string): Record<string, unknown> | null {
  try {
    const payload = idToken.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const binary = typeof globalThis.atob === 'function'
      ? globalThis.atob(padded)
      : '';
    if (!binary) return null;
    return JSON.parse(binary);
  } catch {
    return null;
  }
}

async function profileFromAuthResult(result: AuthSessionResult): Promise<GoogleProfile> {
  if (result.type !== 'success') {
    throw new Error('Google sign-in was not completed.');
  }

  const idToken = result.authentication?.idToken
    || (result.params as { id_token?: string })?.id_token;
  const accessToken = result.authentication?.accessToken;

  let email = '';
  let name: string | undefined;
  let googleId: string | undefined;
  let avatar: string | undefined;

  if (idToken) {
    const decoded = decodeJwtPayload(idToken);
    email = String(decoded?.email || '');
    name = decoded?.name ? String(decoded.name) : undefined;
    googleId = decoded?.sub ? String(decoded.sub) : undefined;
    avatar = decoded?.picture ? String(decoded.picture) : undefined;
  }

  if (!email && accessToken) {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    email = data?.email || '';
    name = data?.name;
    googleId = data?.sub;
    avatar = data?.picture;
  }

  if (!email && !idToken) {
    throw new Error('Google did not return account details. Please try again.');
  }

  return {
    email,
    name,
    googleId,
    avatar,
    idToken: idToken || undefined,
  };
}

type Props = {
  onSuccess?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
};

export default function GoogleSignInButton({ onSuccess, disabled, variant = 'secondary' }: Props) {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);

  const redirectUri = getGoogleOAuthRedirectUri();

  const [request, , promptAsync] = Google.useAuthRequest({
    webClientId: getGoogleWebClientId(),
    androidClientId: GOOGLE_ANDROID_CLIENT_ID || undefined,
    iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
    redirectUri,
    scopes: ['openid', 'profile', 'email'],
  });

  const completeSignIn = useCallback(async (profile: GoogleProfile) => {
    await signInWithGoogle(profile);
    onSuccess?.();
  }, [signInWithGoogle, onSuccess]);

  if (!isGoogleSignInAvailable()) return null;

  const handlePress = async () => {
    if (!request) {
      appAlert('Please wait', 'Google sign-in is still loading. Try again in a moment.');
      return;
    }

    setBusy(true);
    try {
      const result = await promptAsync();
      if (result?.type === 'cancel' || result?.type === 'dismiss') return;
      const profile = await profileFromAuthResult(result);
      await completeSignIn(profile);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Google sign-in failed';
      if (message.toLowerCase().includes('cancel')) return;
      console.warn('[Google Auth] failed:', message, 'redirectUri:', redirectUri);
      appAlert('Google Sign-In Failed', formatGoogleAuthError(message));
    } finally {
      setBusy(false);
    }
  };

  const isDisabled = disabled || busy;
  const isPrimary = variant === 'primary';

  const content = busy ? (
    <ActivityIndicator color="#FFF" />
  ) : (
    <View style={s.row}>
      <Ionicons name="logo-google" size={isPrimary ? 22 : 20} color="#FFF" />
      <Text style={[s.text, isPrimary && s.textPrimary]}>Continue with Google</Text>
    </View>
  );

  if (isPrimary) {
    return (
      <TouchableOpacity
        style={[s.primaryWrap, isDisabled && s.btnDisabled]}
        onPress={handlePress}
        disabled={isDisabled}
        activeOpacity={0.85}
      >
        <LinearGradient
          colors={['#4285F4', '#3367D6', '#2A56C6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.primaryBtn}
        >
          {content}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[s.btn, isDisabled && s.btnDisabled]}
      onPress={handlePress}
      disabled={isDisabled}
      activeOpacity={0.8}
    >
      {content}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  primaryWrap: {
    width: '100%',
    height: 56,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#4285F4',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  primaryBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  textPrimary: { fontSize: 17, letterSpacing: 0.2 },
});