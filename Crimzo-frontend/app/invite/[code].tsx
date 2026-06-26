import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../lib/apiClient';
import {
  buildReferralLink,
  formatReferralDiamonds,
  normalizeReferralCode,
  REFERRED_USER_REWARD_DIAMONDS,
  savePendingReferralCode,
} from '../../lib/referral';

type ReferrerPreview = {
  valid: boolean;
  referrer?: { username: string; avatar?: string | null };
  rewardPerReferralInr?: number;
  rewardPerReferralDiamonds?: number;
  referredUserRewardInr?: number;
  referredUserRewardDiamonds?: number;
};

export default function InviteScreen() {
  const { code: rawCode } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [preview, setPreview] = useState<ReferrerPreview | null>(null);
  const [checking, setChecking] = useState(true);

  const code = normalizeReferralCode(Array.isArray(rawCode) ? rawCode[0] : rawCode) || '';

  useEffect(() => {
    if (!code) {
      setChecking(false);
      return;
    }
    savePendingReferralCode(code).catch(() => {});
    fetch(`${API_URL}/api/referral/validate/${encodeURIComponent(code)}`)
      .then((res) => res.json())
      .then((data) => setPreview(data))
      .catch(() => setPreview({ valid: false }))
      .finally(() => setChecking(false));
  }, [code]);

  useEffect(() => {
    if (!loading && user) {
      router.replace('/(tabs)/home');
    }
  }, [loading, user, router]);

  const goToSignup = () => {
    router.replace('/(auth)/register' as never);
  };

  const goToLogin = () => {
    router.replace('/(auth)/login' as never);
  };

  if (checking || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#FF2D55" size="large" />
      </View>
    );
  }

  const valid = preview?.valid;
  const referrerName = preview?.referrer?.username || 'your friend';

  return (
    <LinearGradient colors={['#06060F', '#141428', '#06060F']} style={styles.container}>
      <View style={styles.card}>
        {valid && preview?.referrer?.avatar ? (
          <Image source={{ uri: preview.referrer.avatar }} style={styles.avatar} />
        ) : null}
        <Text style={styles.title}>{valid ? `${referrerName} invited you!` : 'Join Crimzo'}</Text>
        <Text style={styles.subtitle}>
          {valid
            ? `Register with referral ID below — ${formatReferralDiamonds(preview?.referredUserRewardDiamonds ?? REFERRED_USER_REWARD_DIAMONDS)} diamonds milenge.`
            : 'This invite link looks invalid, but you can still join Crimzo at www.crimzo.live.'}
        </Text>
        {code ? (
          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>Referral ID</Text>
            <Text style={styles.codeValue}>CRIMZO-{code}</Text>
          </View>
        ) : null}
        {valid ? (
          <Text style={styles.linkHint}>{buildReferralLink(code)}</Text>
        ) : null}
        <TouchableOpacity style={styles.primaryBtn} onPress={goToSignup}>
          <Text style={styles.primaryBtnText}>Create Account</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={goToLogin}>
          <Text style={styles.secondaryBtnText}>I already have an account</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#06060F' },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,45,85,0.25)',
    padding: 28,
    alignItems: 'center',
  },
  avatar: { width: 72, height: 72, borderRadius: 36, marginBottom: 16, borderWidth: 2, borderColor: '#FF2D55' },
  title: { color: '#FFF', fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 10 },
  subtitle: { color: '#AAA', fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 18 },
  codeBox: {
    backgroundColor: '#1A1A2E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,45,85,0.35)',
    borderStyle: 'dashed',
    paddingVertical: 12,
    paddingHorizontal: 18,
    marginBottom: 12,
    alignItems: 'center',
  },
  codeLabel: { color: '#888', fontSize: 11, letterSpacing: 1, marginBottom: 4 },
  codeValue: { color: '#FF6B8A', fontSize: 18, fontWeight: '800', letterSpacing: 1 },
  linkHint: { color: '#666', fontSize: 11, marginBottom: 18, textAlign: 'center' },
  primaryBtn: {
    width: '100%',
    backgroundColor: '#FF2D55',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryBtnText: { color: '#FFF', fontWeight: '800', fontSize: 15 },
  secondaryBtn: { paddingVertical: 10 },
  secondaryBtnText: { color: '#CCC', fontSize: 14 },
});