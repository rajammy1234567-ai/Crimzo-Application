import { apiGet, resolveMediaUrl } from './apiClient';

const RESOLVABLE_SOURCES = new Set(['audius', 'epidemic', 'soundstripe']);

/** Licensed + Audius stream URLs expire — refresh before playback */
export async function resolveReelAudioUrl(
  audioUrl: string,
  externalSource?: string | null,
  externalId?: string | null,
  token?: string | null,
): Promise<string> {
  if (externalSource && externalId && RESOLVABLE_SOURCES.has(externalSource) && token) {
    try {
      const data = await apiGet<{ audio_url?: string }>(
        `/api/sounds/resolve/${externalSource}/${externalId}`,
        token,
      );
      if (data.audio_url) return resolveMediaUrl(data.audio_url);
    } catch {
      // fall through to stored url
    }
  }

  return resolveMediaUrl(audioUrl);
}