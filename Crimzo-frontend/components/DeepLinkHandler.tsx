import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import {
  buildLiveWatchRoute,
  extractLiveSessionIdFromUrl,
  savePendingLiveSession,
} from '../lib/liveShare';
import { extractReferralCodeFromUrl, savePendingReferralCode } from '../lib/referral';

async function handleDeepLink(url: string, router: ReturnType<typeof useRouter>) {
  const liveSessionId = extractLiveSessionIdFromUrl(url);
  if (liveSessionId) {
    await savePendingLiveSession(liveSessionId);
    const token = await AsyncStorage.getItem('auth_token');
    if (token) {
      router.push(buildLiveWatchRoute(liveSessionId) as never);
    } else {
      router.push('/(auth)/login' as never);
    }
    return;
  }

  const referralCode = extractReferralCodeFromUrl(url);
  if (!referralCode) return;
  await savePendingReferralCode(referralCode);
  router.push(`/invite/${referralCode}` as never);
}

export default function DeepLinkHandler() {
  const router = useRouter();

  useEffect(() => {
    let active = true;

    Linking.getInitialURL()
      .then((url) => {
        if (active && url) return handleDeepLink(url, router);
        return undefined;
      })
      .catch(() => {});

    const sub = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url, router).catch(() => {});
    });

    return () => {
      active = false;
      sub.remove();
    };
  }, [router]);

  return null;
}