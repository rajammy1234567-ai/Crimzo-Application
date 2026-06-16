/** Agora RTC requires a numeric UID. Derive a stable value from a Mongo id string. */
export function toAgoraUid(userId?: string | number | null): number {
  if (typeof userId === 'number' && userId > 0) return userId;
  const uidStr = String(userId || '').replace(/[^0-9]/g, '');
  const parsed = parseInt(uidStr.slice(-9) || '0', 10);
  if (parsed > 0) return parsed;
  return (Date.now() % 1000000) + 10000;
}

export function sameUserId(a?: string | number | null, b?: string | number | null): boolean {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}