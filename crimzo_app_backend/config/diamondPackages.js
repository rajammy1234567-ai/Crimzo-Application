/** Diamond top-up packages (prices in INR) — Official Diamond List. Minimum 15k diamonds. */
const DIAMOND_PACKAGES = [
  { id: 1,  diamonds: 15000,   price: 275,    tier: 'basic' },
  { id: 2,  diamonds: 20000,   price: 365,    tier: 'basic' },
  { id: 3,  diamonds: 25000,   price: 460,    tier: 'basic' },
  { id: 4,  diamonds: 30000,   price: 550,    tier: 'bronze' },
  { id: 5,  diamonds: 35000,   price: 640,    tier: 'bronze' },
  { id: 6,  diamonds: 40000,   price: 730,    tier: 'bronze' },
  { id: 7,  diamonds: 50000,   price: 900,    tier: 'silver' },
  { id: 8,  diamonds: 60000,   price: 1080,   tier: 'silver' },
  { id: 9,  diamonds: 70000,   price: 1250,   tier: 'silver' },
  { id: 10, diamonds: 80000,   price: 1430,   tier: 'gold' },
  { id: 11, diamonds: 90000,   price: 1600,   tier: 'gold' },
  { id: 12, diamonds: 100000,  price: 1750,   tier: 'gold' },
  { id: 13, diamonds: 200000,  price: 3500,   tier: 'platinum' },
  { id: 14, diamonds: 300000,  price: 5250,   tier: 'platinum' },
  { id: 15, diamonds: 400000,  price: 7000,   tier: 'platinum' },
  { id: 16, diamonds: 500000,  price: 8750,   tier: 'diamond' },
  { id: 17, diamonds: 700000,  price: 12250,  tier: 'diamond' },
  { id: 18, diamonds: 1000000, price: 17500,  tier: 'diamond' },
  { id: 19, diamonds: 1500000, price: 26250,  tier: 'diamond' },
  { id: 20, diamonds: 2000000, price: 35000,  tier: 'diamond' },
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