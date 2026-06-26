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
}

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
  } satisfies GiftSplashPayload);
}

export function subscribeGiftSplash(cb: (payload: GiftSplashPayload) => void): () => void {
  return subscribe(GIFT_SPLASH_EVENT, (raw) => {
    const data = raw as GiftSplashPayload;
    if (!data?.stickerName) return;
    cb(data);
  });
}

export function giftSplashTier(diamonds?: number): 'normal' | 'premium' | 'mega' {
  const n = Number(diamonds) || 0;
  if (n >= 80) return 'mega';
  if (n >= 25) return 'premium';
  return 'normal';
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
  });
}