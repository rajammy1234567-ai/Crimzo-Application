import { subscribe, publish } from './realtimeSync';

export const GIFT_SPLASH_EVENT = 'gift_splash_show';

export interface GiftSplashPayload {
  id: string;
  username: string;
  stickerName: string;
  icon_name?: string;
  icon_color?: string;
  bg_color?: string;
  gift_diamonds?: number;
  emoji?: string;
  /** sent = you sent the gift; received = someone sent to you */
  variant?: 'sent' | 'received';
}

export type StickerGiftInfo = {
  id?: string | number;
  name: string;
  emoji?: string;
  icon_name?: string;
  icon_color?: string;
  bg_color?: string;
  price?: number;
};

export function publishGiftSplash(data: Omit<GiftSplashPayload, 'id'> & { id?: string }): void {
  publish(GIFT_SPLASH_EVENT, {
    id: data.id || `splash_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    username: data.username || 'Someone',
    stickerName: data.stickerName || 'Gift',
    icon_name: data.icon_name,
    icon_color: data.icon_color,
    bg_color: data.bg_color,
    gift_diamonds: data.gift_diamonds,
    emoji: data.emoji,
    variant: data.variant || 'received',
  } satisfies GiftSplashPayload);
}

/** Sticker / gift panel — immediate full-screen popup + sound */
export function publishStickerGiftSplash(
  sticker: StickerGiftInfo,
  username: string,
  options?: { variant?: 'sent' | 'received'; id?: string },
): void {
  publishGiftSplash({
    id: options?.id,
    username,
    stickerName: sticker.name || 'Gift',
    icon_name: sticker.icon_name,
    icon_color: sticker.icon_color,
    bg_color: sticker.bg_color,
    gift_diamonds: sticker.price,
    emoji: sticker.emoji,
    variant: options?.variant || 'sent',
  });
}

export function subscribeGiftSplash(cb: (payload: GiftSplashPayload) => void): () => void {
  return subscribe(GIFT_SPLASH_EVENT, (raw) => {
    const data = raw as GiftSplashPayload;
    if (!data?.stickerName) return;
    cb(data);
  });
}

export function giftSplashTier(diamonds?: number): 'normal' | 'premium' | 'mega' | 'legend' {
  const n = Number(diamonds) || 0;
  if (n >= 100000) return 'legend';
  if (n >= 1000) return 'mega';
  if (n >= 50) return 'premium';
  return 'normal';
}

export function formatDiamondPrice(price: number): string {
  const n = Math.max(0, Math.floor(Number(price) || 0));
  if (n >= 100000) return `${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L`;
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return String(n);
}

/** Follower DM chat — diamond gift popup */
export function publishDmDiamondGiftSplash(msg: {
  id: string | number;
  sender_username?: string;
  gift_diamonds?: number;
}): void {
  const diamonds = Math.max(0, Math.floor(Number(msg.gift_diamonds) || 0));
  publishGiftSplash({
    id: String(msg.id),
    username: msg.sender_username || 'Someone',
    stickerName: diamonds > 0
      ? `${diamonds.toLocaleString('en-IN')} Diamonds`
      : 'Diamond Gift',
    icon_name: 'diamond',
    icon_color: '#FFFFFF',
    bg_color: '#00BFFF',
    gift_diamonds: diamonds,
    emoji: '💎',
    variant: 'received',
  });
}

export function publishDmDiamondGiftSplashSent(
  diamonds: number,
  receiverUsername?: string,
): void {
  const amount = Math.max(0, Math.floor(Number(diamonds) || 0));
  publishGiftSplash({
    username: receiverUsername || 'Friend',
    stickerName: amount > 0
      ? `${amount.toLocaleString('en-IN')} Diamonds`
      : 'Diamond Gift',
    icon_name: 'diamond',
    icon_color: '#FFFFFF',
    bg_color: '#00BFFF',
    gift_diamonds: amount,
    emoji: '💎',
    variant: 'sent',
  });
}