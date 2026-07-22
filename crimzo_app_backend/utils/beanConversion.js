const { BEAN_PACKAGES } = require('../config/diamondPackages');

/** Base rate from tier-1 package: 5000 beans = ₹100 */
const BEANS_PER_INR = BEAN_PACKAGES[0].beans / BEAN_PACKAGES[0].price;

/**
 * Diamonds → beans on withdrawal.
 * 1 diamond = 1 bean (same unit of gift value; matches frontend + deduct path).
 * Previously 0.01 made UI show ₹500+ while backend rejected as insufficient.
 */
const DIAMONDS_PER_BEAN = 1;

function diamondsToBeans(diamonds) {
  return Math.floor(Math.max(0, Number(diamonds) || 0) / DIAMONDS_PER_BEAN);
}

function beansToInr(beans) {
  const n = Math.max(0, Number(beans) || 0);
  return Math.floor((n / BEANS_PER_INR) * 100) / 100;
}

function inrToBeans(inr) {
  const n = Math.max(0, Number(inr) || 0);
  return Math.ceil(n * BEANS_PER_INR);
}

function totalWithdrawableBeans(diamonds, beans) {
  return (Number(beans) || 0) + diamondsToBeans(diamonds);
}

function beanTiers() {
  return BEAN_PACKAGES.map((p) => ({
    id: p.id,
    beans: p.beans,
    inr: p.price,
    beansPerInr: p.beans / p.price,
  }));
}

/** Deduct beans first, then convert diamonds to beans only as needed */
function deductBeansForWithdraw(diamonds, beans, beansNeeded) {
  const d = Math.max(0, Number(diamonds) || 0);
  const b = Math.max(0, Number(beans) || 0);
  const need = Math.max(0, Number(beansNeeded) || 0);

  if (b >= need) {
    return { diamonds: d, beans: b - need };
  }
  const beansFromDiamonds = need - b;
  const diamondsCost = beansFromDiamonds * DIAMONDS_PER_BEAN;
  return { diamonds: Math.max(0, d - diamondsCost), beans: 0 };
}

module.exports = {
  BEANS_PER_INR,
  DIAMONDS_PER_BEAN,
  diamondsToBeans,
  beansToInr,
  inrToBeans,
  totalWithdrawableBeans,
  beanTiers,
  deductBeansForWithdraw,
};