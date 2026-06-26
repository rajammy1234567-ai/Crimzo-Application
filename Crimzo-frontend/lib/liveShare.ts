import AsyncStorage from '@react-native-async-storage/async-storage';
import { Share } from 'react-native';

const PENDING_LIVE_SESSION_KEY = 'pending_live_session_id';

/** Full HTTPS base — required for Android App Links and clickable shares. */
export const LIVE_SHARE_WEB_BASE = 'https://www.crimzo.live';

/** Short display form in share text (still includes full path). */
export const LIVE_SHARE_DISPLAY_BASE = 'www.crimzo.live';

export function buildLiveShareLink(sessionId: string): string {
  const id = String(sessionId || '').trim();
  if (!id) return LIVE_SHARE_WEB_BASE;
  return `${LIVE_SHARE_WEB_BASE}/live/${encodeURIComponent(id)}`;
}

export function buildLiveWatchRoute(sessionId: string): string {
  const id = String(sessionId || '').trim();
  return `/live/watch?sessionId=${encodeURIComponent(id)}`;
}

export function buildLiveShareMessage(
  hostUsername: string,
  sessionId: string,
  options?: { isSelf?: boolean },
): string {
  const isSelf = options?.isSelf ?? false;
  const name = hostUsername?.trim() || 'Host';
  const link = buildLiveShareLink(sessionId);
  const headline = isSelf ? "I'm live on Crimzo!" : `${name} is live on Crimzo!`;
  const subline = isSelf ? 'Tap the link to join me in the app.' : 'Tap the link to join the live stream in the app.';
  return [headline, subline, '', link].join('\n');
}

export async function shareLiveStream(
  hostUsername: string,
  sessionId: string,
  options?: { isSelf?: boolean },
): Promise<void> {
  const id = String(sessionId || '').trim();
  if (!id) {
    throw new Error('Live session is not ready yet.');
  }
  await Share.share({
    message: buildLiveShareMessage(hostUsername, id, options),
  });
}

export function extractLiveSessionIdFromUrl(url: string): string | null {
  if (!url) return null;
  const patterns = [
    /\/live\/([^/?#]+)/i,
    /crimzo:\/\/live\/watch\?sessionId=([^&#]+)/i,
    /crimzo:\/\/live\/([^/?#]+)/i,
    /[?&]sessionId=([^&#]+)/i,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      const id = decodeURIComponent(match[1]).trim();
      if (id) return id;
    }
  }
  return null;
}

export async function savePendingLiveSession(sessionId: string): Promise<void> {
  const id = String(sessionId || '').trim();
  if (!id) return;
  await AsyncStorage.setItem(PENDING_LIVE_SESSION_KEY, id);
}

export async function getPendingLiveSession(): Promise<string | null> {
  return AsyncStorage.getItem(PENDING_LIVE_SESSION_KEY);
}

export async function clearPendingLiveSession(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_LIVE_SESSION_KEY);
}

/** After login/register — open pending live if user arrived via share link. */
export async function resolvePostAuthRoute(): Promise<string> {
  const sessionId = await getPendingLiveSession();
  if (sessionId) {
    await clearPendingLiveSession();
    return buildLiveWatchRoute(sessionId);
  }
  return '/(tabs)/home';
}