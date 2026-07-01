/** Offline fallback when /api/user/levels is 404 (e.g. production not redeployed yet). */
export type LevelCatalogEntry = {
  level_number: number;
  name: string;
  description: string;
  price_diamonds: number;
  showcase_type: string;
  showcase_model_key?: string | null;
  showcase_emoji: string;
  badge_color: string;
  is_default?: boolean;
};

export const LEVEL_CATALOG: LevelCatalogEntry[] = [
  { level_number: 1, name: 'Rookie', description: 'Welcome to Crimzo — your journey starts here.', price_diamonds: 0, showcase_type: 'scooter', showcase_emoji: '🛵', badge_color: '#6B7280', is_default: true },
  { level_number: 2, name: 'Rider', description: 'Sport bike unlocked — ride in style.', price_diamonds: 500, showcase_type: 'bike', showcase_emoji: '🏍️', badge_color: '#22C55E' },
  { level_number: 3, name: 'Driver', description: 'Sports car for the fast lane.', price_diamonds: 2000, showcase_type: 'car', showcase_model_key: 'golf_gti', showcase_emoji: '🚗', badge_color: '#3B82F6' },
  { level_number: 4, name: 'Royal', description: 'Raja ka Rath — royal entry guaranteed.', price_diamonds: 5000, showcase_type: 'rath', showcase_emoji: '🐎', badge_color: '#A855F7' },
  { level_number: 5, name: 'Elite', description: 'Supercar status — elite showcase.', price_diamonds: 15000, showcase_type: 'supercar', showcase_model_key: 'golf_gti', showcase_emoji: '🏎️', badge_color: '#F59E0B' },
  { level_number: 6, name: 'Emperor', description: 'Luxury yacht on the open sea.', price_diamonds: 50000, showcase_type: 'yacht', showcase_emoji: '🛥️', badge_color: '#06B6D4' },
  { level_number: 7, name: 'Legend', description: 'Private jet — sky is yours.', price_diamonds: 150000, showcase_type: 'jet', showcase_emoji: '🚁', badge_color: '#EC4899' },
  { level_number: 8, name: 'Crimzo King', description: 'Golden throne — ultimate prestige.', price_diamonds: 500000, showcase_type: 'throne', showcase_emoji: '👑', badge_color: '#FFD700' },
];

export function buildFallbackLevels(userLevel = 1, equippedLevel = 1, diamonds = 0) {
  const owned = Array.from({ length: userLevel }, (_, i) => i + 1);
  const nextLevel = userLevel + 1;
  return {
    success: true,
    user_level: userLevel,
    equipped_level: equippedLevel,
    owned_levels: owned,
    diamonds,
    next_level: nextLevel,
    levels: LEVEL_CATALOG.map((l) => ({
      ...l,
      owned: owned.includes(l.level_number),
      equipped: equippedLevel === l.level_number,
      is_next: l.level_number === nextLevel,
      can_purchase: !owned.includes(l.level_number) && l.level_number === nextLevel,
      locked: !owned.includes(l.level_number) && l.level_number > nextLevel,
    })),
  };
}