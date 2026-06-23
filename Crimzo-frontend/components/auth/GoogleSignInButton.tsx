import React, { useEffect, useState } from 'react';
import {
  TouchableOpacity, Text, StyleSheet, ActivityIndicator, Alert, View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { makeRedirectUri } from 'expo-auth-session';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import {
  GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_WEB_CLIENT_ID,
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

type Props = {
  onSuccess?: () => void;
  disabled?: boolean;
};

export default function GoogleSignInButton({ onSuccess, disabled }: Props) {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);

  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: GOOGLE_WEB_CLIENT_ID || undefined,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID || undefined,
    iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
    redirectUri: makeRedirectUri({ scheme: 'crimzo' }),
  });

  useEffect(() => {
    if (!response || response.type !== 'success') {
      if (response?.type === 'error') {
        setBusy(false);
        Alert.alert('Google Sign-In Failed', response.error?.message || 'Could not sign in with Google.');
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
        Alert.alert('Google Sign-In Failed', message);
      } finally {
        setBusy(false);
      }
    })();
  }, [response, signInWithGoogle, onSuccess]);

  if (!isGoogleSignInAvailable()) return null;

  const handlePress = async () => {
    if (!request) {
      Alert.alert('Google Sign-In', 'Google login is still loading. Try again in a moment.');
      return;
    }
    setBusy(true);
    try {
      await promptAsync();
    } catch (err: unknown) {
      setBusy(false);
      const message = err instanceof Error ? err.message : 'Could not open Google sign-in';
      Alert.alert('Google Sign-In Failed', message);
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