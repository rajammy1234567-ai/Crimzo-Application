export type DiamondPackage = {
  id: number;
  diamonds: number;
  bonus?: number;
  price: number;
  tier: string;
};

export type BeanPackage = {
  id: number;
  beans: number;
  price: number;
};

export const DIAMOND_PACKAGES: DiamondPackage[] = [
  { id: 1, diamonds: 13800, bonus: 12000, price: 272, tier: 'basic' },
  { id: 2, diamonds: 49000, bonus: 40000, price: 944, tier: 'bronze' },
  { id: 3, diamonds: 156000, bonus: 120000, price: 2978, tier: 'silver' },
  { id: 4, diamonds: 540000, bonus: 400000, price: 10118, tier: 'gold' },
  { id: 5, diamonds: 1680000, bonus: 1200000, price: 31250, tier: 'platinum' },
  { id: 6, diamonds: 5800000, bonus: 4000000, price: 109000, tier: 'diamond' },
];

export const BEAN_PACKAGES: BeanPackage[] = [
  { id: 1, beans: 5000, price: 100 },
  { id: 2, beans: 25000, price: 450 },
  { id: 3, beans: 100000, price: 1700 },
  { id: 4, beans: 500000, price: 8000 },
];

export function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return n.toLocaleString();
}

export function formatInr(n: number): string {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}