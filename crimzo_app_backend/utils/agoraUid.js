/** Agora RTC requires a numeric UID — stable derivation from Mongo user id. */
function deriveAgoraUid(userId) {
  const uidStr = String(userId || '').replace(/[^0-9]/g, '');
  const parsed = parseInt(uidStr.slice(-9) || '0', 10);
  if (parsed > 0) return parsed;
  return (Date.now() % 1000000) + 10000;
}

function toAgoraUid(userId) {
  return deriveAgoraUid(userId);
}

module.exports = { deriveAgoraUid, toAgoraUid };