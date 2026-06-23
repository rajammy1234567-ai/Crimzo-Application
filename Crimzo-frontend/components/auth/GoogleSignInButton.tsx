import React, { useEffect, useState } from 'react';
import { appAlert } from '../../lib/appAlert';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import {
  getGoogleAuthRequestConfig,
  getGoogleWebClientRedirectUris,
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

async function fetchGoogleProfile(
  accessToken?: string | null,
  idToken?: string | null,
): Promise<GoogleProfile | null> {
  if (accessToken) {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.email) {
        return {
          email: data.email,
          name: data.name,
          googleId: data.sub,
          avatar: data.picture,
          idToken: idToken || undefined,
        };
      }
    }
  }

  if (idToken) {
    try {
      const payload = idToken.split('.')[1];
      if (payload) {
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
        const decoded = JSON.parse(atob(normalized));
        if (decoded?.email) {
          return {
            email: decoded.email,
            name: decoded.name,
            googleId: decoded.sub,
            avatar: decoded.picture,
            idToken,
          };
        }
      }
    } catch {
      // fall through
    }
  }

  return null;
}

function formatGoogleAuthError(message?: string): string {
  const lower = (message || '').toLowerCase();
  if (
    lower.includes('access blocked')
    || lower.includes('authorization error')
    || lower.includes('invalid_request')
    || lower.includes('redirect_uri')
  ) {
    const webRedirects = getGoogleWebClientRedirectUris().join('\n• ');
    const lines = [
      'Google OAuth setup check:',
      '',
      'Web client → Authorized redirect URIs (sirf https):',
      `• ${webRedirects}`,
      '',
      'OAuth consent screen → Test users mein apna Gmail add karo (Testing mode)',
    ];
    if (!isExpoGo() && Platform.OS === 'android') {
      lines.push(
        '',
        'APK ke liye Android client check karo:',
        '• Package: com.livestreamhub',
        '• SHA-1: APK jis keystore se sign hua uska fingerprint',
        '(com.livestreamhub:/oauthredirect Web client pe mat dalo — Google reject karta hai)',
      );
    }
    lines.push('', `Details: ${message || 'Authorization error'}`);
    return lines.join('\n');
  }
  return message || 'Could not sign in with Google.';
}

type Props = {
  onSuccess?: () => void;
  disabled?: boolean;
};

export default function GoogleSignInButton({ onSuccess, disabled }: Props) {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const authConfig = getGoogleAuthRequestConfig();

  const [request, response, promptAsync] = Google.useAuthRequest(authConfig);

  useEffect(() => {
    if (__DEV__) {
      console.log('[Google Auth] redirectUri:', authConfig.redirectUri);
      console.log('[Google Auth] mode:', isExpoGo() ? 'Expo Go' : 'standalone');
      console.log('[Google Auth] Web client redirect (https only):', getGoogleWebClientRedirectUris());
    }
  }, [authConfig.redirectUri]);

  useEffect(() => {
    if (!response || response.type !== 'success') {
      if (response?.type === 'error') {
        setBusy(false);
        appAlert(
          'Google Sign-In Failed',
          formatGoogleAuthError(response.error?.message),
        );
      } else if (response?.type === 'dismiss' || response?.type === 'cancel') {
        setBusy(false);
      }
      return;
    }

    (async () => {
      try {
        const accessToken = response.authentication?.accessToken
          || (response.params as { access_token?: string })?.access_token;
        const idToken = response.authentication?.idToken
          || (response.params as { id_token?: string })?.id_token;

        const profile = await fetchGoogleProfile(accessToken, idToken);
        if (!profile?.email) {
          throw new Error('Google did not return an email for this account.');
        }

        await signInWithGoogle(profile);
        onSuccess?.();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Google sign-in failed';
        appAlert('Google Sign-In Failed', formatGoogleAuthError(message));
      } finally {
        setBusy(false);
      }
    })();
  }, [response, signInWithGoogle, onSuccess]);

  if (!isGoogleSignInAvailable()) return null;

  const handlePress = async () => {
    if (!request) {
      appAlert('Google Sign-In', 'Google login is still loading. Try again in a moment.');
      return;
    }
    setBusy(true);
    try {
      await promptAsync();
    } catch (err: unknown) {
      setBusy(false);
      const message = err instanceof Error ? err.message : 'Could not open Google sign-in';
      appAlert('Google Sign-In Failed', formatGoogleAuthError(message));
    }
  };

  const isDisabled = disabled || busy || !request;

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