import { apiGet, resolveMediaUrl } from './apiClient';

const RESOLVABLE_SOURCES = new Set(['audius', 'epidemic', 'soundstripe']);

/** Licensed + Audius stream URLs expire — refresh before playback */
export async function resolveReelAudioUrl(
  audioUrl: string,
  externalSource?: string | null,
  externalId?: string | null,
  token?: string | null,
): Promise<string> {
  const base = resolveMediaUrl(audioUrl);

  if (!externalSource || !externalId || !RESOLVABLE_SOURCES.has(externalSource) || !token) {
    return base;
  }

  try {
    const data = await apiGet<{ audio_url?: string }>(
      `/api/sounds/resolve/${externalSource}/${externalId}`,
      token,
    );
    return data.audio_url ? resolveMediaUrl(data.audio_url) : base;
  } catch {
    return base;
  }
}