export const PK_GIFTS = [
  { id: 1, name: 'Rose', value: 10, icon: 'flower', color: '#FF6B8A' },
  { id: 2, name: 'Heart', value: 50, icon: 'heart', color: '#FF2D55' },
  { id: 3, name: 'Crown', value: 100, icon: 'trophy', color: '#FFD700' },
  { id: 4, name: 'Rocket', value: 500, icon: 'rocket', color: '#FF9500' },
] as const;

export type PKGift = (typeof PK_GIFTS)[number];

export function findPkGiftByValue(value: number): PKGift | undefined {
  return PK_GIFTS.find((g) => g.value === value);
}