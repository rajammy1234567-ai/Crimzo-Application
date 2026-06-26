import AsyncStorage from '@react-native-async-storage/async-storage';
import { Share } from 'react-native';
import { apiGet } from './apiClient';

const STORAGE_KEY = 'pending_referral_code';

/** Fixed referral domain — do not change per environment. */
export const REFERRAL_WEB_BASE = 'https://www.crimzo.live';

/** Link sent in share message — always this URL only. */
export const REFERRAL_SHARE_URL = 'www.crimzo.live';

/** Tier-1 package rate — must match backend referralConfig */
const TIER1_DIAMONDS_PER_INR = 13800 / 272;

/** Referral rewards are paid as diamonds only (INR values are conversion basis). */
export const REFERRER_REWARD_DIAMONDS = Math.round(100 * TIER1_DIAMONDS_PER_INR);
export const REFERRED_USER_REWARD_DIAMONDS = Math.round(50 * TIER1_DIAMONDS_PER_INR);

export function formatReferralDiamonds(n: number): string {
  return n.toLocaleString('en-IN');
}

export function normalizeReferralCode(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  let code = raw.trim().toUpperCase();
  if (!code) return null;
  if (code.startsWith('CRIMZO-')) code = code.slice('CRIMZO-'.length);
  if (code.startsWith('CRIMZO')) code = code.slice('CRIMZO'.length);
  code = code.replace(/^-+/, '').trim();
  return code || null;
}

/** Always the same link format: https://www.crimzo.live/invite/{code} */
export function buildReferralLink(code: string): string {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return REFERRAL_WEB_BASE;
  return `${REFERRAL_WEB_BASE}/invite/${encodeURIComponent(normalized)}`;
}

export function formatReferralInviteCode(code: string): string {
  const normalized = normalizeReferralCode(code);
  return normalized ? `CRIMZO-${normalized}` : '';
}

export function buildReferralShareMessage(code: string): string {
  const normalized = normalizeReferralCode(code) || code;
  const inviteId = formatReferralInviteCode(normalized) || `CRIMZO-${normalized}`;
  return [
    'Join me on Crimzo!',
    '',
    `Referral ID: ${inviteId}`,
    'Use this ID when you register.',
    `You will get ${formatReferralDiamonds(REFERRED_USER_REWARD_DIAMONDS)} diamonds on signup.`,
    '',
    REFERRAL_SHARE_URL,
  ].join('\n');
}

export async function getReferralSharePayload(
  token: string | null,
  fallbackCode?: string | null,
): Promise<{ code: string; link: string } | null> {
  let code = normalizeReferralCode(fallbackCode);

  if (token) {
    try {
      const data = await apiGet<{
        referralCode?: string;
        inviteCode?: string;
      }>('/api/referral/me', token);
      code = normalizeReferralCode(data.referralCode || data.inviteCode) || code;
    } catch {
      // use fallback code
    }
  }

  if (!code) return null;
  return {
    code,
    link: REFERRAL_SHARE_URL,
  };
}

export async function shareReferralInvite(
  token: string | null,
  fallbackCode?: string | null,
): Promise<boolean> {
  const payload = await getReferralSharePayload(token, fallbackCode);
  if (!payload) return false;

  await Share.share({
    message: buildReferralShareMessage(payload.code),
  });
  return true;
}

export function extractReferralCodeFromUrl(url: string): string | null {
  if (!url) return null;
  const patterns = [
    /\/invite\/([^/?#]+)/i,
    /crimzo:\/\/invite\/([^/?#]+)/i,
    /[?&]ref=([^&#]+)/i,
    /[?&]referral(?:Code)?=([^&#]+)/i,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      const code = normalizeReferralCode(decodeURIComponent(match[1]));
      if (code) return code;
    }
  }
  return null;
}

export async function savePendingReferralCode(code: string): Promise<void> {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return;
  await AsyncStorage.setItem(STORAGE_KEY, normalized);
}

export async function getPendingReferralCode(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEY);
}

export async function clearPendingReferralCode(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export async function getReferralSignupPayload(): Promise<{ referralCode?: string }> {
  const code = await getPendingReferralCode();
  return code ? { referralCode: code } : {};
}