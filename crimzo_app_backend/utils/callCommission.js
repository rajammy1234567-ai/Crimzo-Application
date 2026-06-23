const { inrToBeans } = require('./beanConversion');
const { CALL_RECEIVER_SHARE, CALL_PLATFORM_SHARE } = require('../config/commission');

function splitCallBeans(grossBeans) {
  const gross = Math.max(0, Math.floor(Number(grossBeans) || 0));
  if (gross <= 0) {
    return { grossBeans: 0, receiverBeans: 0, platformBeans: 0 };
  }
  const receiverBeans = Math.floor(gross * CALL_RECEIVER_SHARE);
  const platformBeans = gross - receiverBeans;
  return { grossBeans: gross, receiverBeans, platformBeans };
}

function receiverBeansFromInr(inr) {
  return splitCallBeans(inrToBeans(inr)).receiverBeans;
}

function platformBeansFromInr(inr) {
  return splitCallBeans(inrToBeans(inr)).platformBeans;
}

module.exports = {
  CALL_RECEIVER_SHARE,
  CALL_PLATFORM_SHARE,
  splitCallBeans,
  receiverBeansFromInr,
  platformBeansFromInr,
};