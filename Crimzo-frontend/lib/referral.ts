import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'pending_referral_code';
export const REFERRAL_WEB_BASE = 'https://www.crimzo.live';

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

export function buildReferralLink(code: string): string {
  const normalized = normalizeReferralCode(code);
  return normalized ? `${REFERRAL_WEB_BASE}/invite/${normalized}` : REFERRAL_WEB_BASE;
}

export function buildReferralShareMessage(code: string, link?: string): string {
  const normalized = normalizeReferralCode(code) || code;
  const url = link || buildReferralLink(normalized);
  return [
    'Join me on Crimzo!',
    `Sign up with my referral ID — you get ${formatReferralDiamonds(REFERRED_USER_REWARD_DIAMONDS)} diamonds, I get ${formatReferralDiamonds(REFERRER_REWARD_DIAMONDS)} diamonds.`,
    `Code: CRIMZO-${normalized}`,
    url,
  ].join('\n');
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