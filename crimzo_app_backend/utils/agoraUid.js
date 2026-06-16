/** Agora RTC requires a numeric UID (uint32). Derive a stable value from a Mongo id string. */
function toAgoraUid(userId) {
  const uidStr = String(userId || '').replace(/[^0-9]/g, '');
  const parsed = parseInt(uidStr.slice(-9) || '0', 10);
  if (parsed > 0) return parsed;
  return (Date.now() % 1000000) + 10000;
}

module.exports = { toAgoraUid };