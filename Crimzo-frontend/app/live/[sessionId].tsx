import React, { useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { buildLiveWatchRoute, savePendingLiveSession } from '../../lib/liveShare';

/** Handles https://www.crimzo.live/live/{sessionId} App Links / Universal Links. */
export default function LiveDeepLinkScreen() {
  const { sessionId: rawId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const sessionId = String(Array.isArray(rawId) ? rawId[0] : rawId || '').trim();

  useEffect(() => {
    if (!sessionId) {
      router.replace('/(tabs)/home' as never);
      return;
    }

    (async () => {
      await savePendingLiveSession(sessionId);
      const token = await AsyncStorage.getItem('auth_token');
      if (token) {
        router.replace(buildLiveWatchRoute(sessionId) as never);
      } else {
        router.replace('/(auth)/login' as never);
      }
    })().catch(() => {
      router.replace('/(auth)/login' as never);
    });
  }, [sessionId, router]);

  return (
    <View style={styles.center}>
      <ActivityIndicator color="#FF2D55" size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#06060F',
  },
});