import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { extractReferralCodeFromUrl, savePendingReferralCode } from '../lib/referral';

async function handleReferralUrl(url: string, router: ReturnType<typeof useRouter>) {
  const code = extractReferralCodeFromUrl(url);
  if (!code) return;
  await savePendingReferralCode(code);
  router.push(`/invite/${code}` as never);
}

export default function ReferralLinkHandler() {
  const router = useRouter();

  useEffect(() => {
    let active = true;

    Linking.getInitialURL()
      .then((url) => {
        if (active && url) return handleReferralUrl(url, router);
        return undefined;
      })
      .catch(() => {});

    const sub = Linking.addEventListener('url', ({ url }) => {
      handleReferralUrl(url, router).catch(() => {});
    });

    return () => {
      active = false;
      sub.remove();
    };
  }, [router]);

  return null;
}