import { apiGet, resolveMediaUrl } from './apiClient';

/** Audius stream URLs expire — refresh before playback */
export async function resolveReelAudioUrl(
  audioUrl: string,
  externalSource?: string | null,
  externalId?: string | null,
  token?: string | null,
): Promise<string> {
  const base = resolveMediaUrl(audioUrl);
  if (!externalSource || !externalId || externalSource !== 'audius' || !token) {
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