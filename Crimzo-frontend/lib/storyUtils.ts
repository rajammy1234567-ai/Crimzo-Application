/** Normalize story owner id — avoids "[object Object]" when API sends populated user objects */
export function normalizeStoryUserId(userId: unknown): string | null {
  if (userId == null || userId === '') return null;
  if (typeof userId === 'string') return userId;
  if (typeof userId === 'number' && !Number.isNaN(userId)) return String(userId);
  if (typeof userId === 'object') {
    const obj = userId as { _id?: unknown; id?: unknown };
    if (obj._id != null) return String(obj._id);
    if (obj.id != null) return String(obj.id);
  }
  const asString = String(userId);
  if (asString === '[object Object]' || asString === 'undefined' || asString === 'null') {
    return null;
  }
  return asString;
}