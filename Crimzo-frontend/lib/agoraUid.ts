/** Agora RTC requires a unique numeric UID per channel. Hash the full user id. */
export function toAgoraUid(userId?: string | number | null): number {
  if (typeof userId === 'number' && userId > 0 && userId < 4294967295) return userId;

  const str = String(userId || '').trim();
  if (!str) return (Date.now() % 1000000) + 10001;

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }

  const uid = (hash % 0x7ffffffe) + 1;
  return uid > 0 ? uid : 10001;
}

export function sameUserId(a?: string | number | null, b?: string | number | null): boolean {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}