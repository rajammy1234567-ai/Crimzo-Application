/** Diamond & bean top-up packages (prices in INR). */
const DIAMOND_PACKAGES = [
  { id: 1, diamonds: 13800, bonus: 12000, price: 272, tier: 'basic' },
  { id: 2, diamonds: 49000, bonus: 40000, price: 944, tier: 'bronze' },
  { id: 3, diamonds: 156000, bonus: 120000, price: 2978, tier: 'silver' },
  { id: 4, diamonds: 540000, bonus: 400000, price: 10118, tier: 'gold' },
  { id: 5, diamonds: 1680000, bonus: 1200000, price: 31250, tier: 'platinum' },
  { id: 6, diamonds: 5800000, bonus: 4000000, price: 109000, tier: 'diamond' },
];

const BEAN_PACKAGES = [
  { id: 1, beans: 5000, price: 100 },
  { id: 2, beans: 25000, price: 450 },
  { id: 3, beans: 100000, price: 1700 },
  { id: 4, beans: 500000, price: 8000 },
];

function getDiamondPackage(id) {
  return DIAMOND_PACKAGES.find((p) => p.id === Number(id)) || null;
}

function getBeanPackage(id) {
  return BEAN_PACKAGES.find((p) => p.id === Number(id)) || null;
}

module.exports = {
  DIAMOND_PACKAGES,
  BEAN_PACKAGES,
  getDiamondPackage,
  getBeanPackage,
};