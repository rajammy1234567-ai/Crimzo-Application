import { Platform } from 'react-native';
import { apiFetch, ApiError } from './apiClient';
import type { ReelAudioSelection, ReelVideoAsset } from './reelTypes';
import {
  cleanupPreparedGalleryUri,
  getReelAssetSizeBytes,
  prepareGalleryVideoForUpload,
  REEL_MAX_UPLOAD_BYTES,
  reelUploadErrorMessage,
} from './reelVideoUtils';

type UploadReelOptions = {
  asset: ReelVideoAsset;
  caption: string;
  token?: string | null;
  audio?: ReelAudioSelection | null;
  onProgress?: (pct: number) => void;
};

export { reelUploadErrorMessage };

export async function uploadReel({
  asset,
  caption,
  token,
  audio,
  onProgress,
}: UploadReelOptions) {
  const prepared = await prepareGalleryVideoForUpload({
    uri: asset.uri,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    duration: asset.duration,
  });

  const sizeBytes = await getReelAssetSizeBytes(prepared.uri);
  if (sizeBytes != null && sizeBytes > REEL_MAX_UPLOAD_BYTES) {
    await cleanupPreparedGalleryUri(prepared.cleanupUri);
    throw new ApiError(
      `Video is too large (${Math.round(sizeBytes / (1024 * 1024))}MB). Max 200MB — use a shorter clip.`,
      400,
    );
  }

  const formData = new FormData();

  try {
    if (Platform.OS === 'web') {
      const resp = await fetch(prepared.uri);
      const blob = await resp.blob();
      const file = new File([blob], prepared.fileName, {
        type: prepared.mimeType,
      });
      formData.append('video', file);
    } else {
      formData.append('video', {
        uri: prepared.uri,
        type: prepared.mimeType,
        name: prepared.fileName,
      } as any);
    }

    formData.append('caption', caption || '');

    if (audio?.sound) {
      formData.append('audio_start_ms', String(audio.startMs || 0));

      const licensedSources = new Set(['audius', 'epidemic', 'soundstripe']);
      const source = audio.sound.source;
      const prefixedId = audio.sound.id.includes(':') ? audio.sound.id.split(':')[0] : null;

      if (licensedSources.has(source) || (prefixedId && licensedSources.has(prefixedId))) {
        const resolvedSource = licensedSources.has(source) ? source : prefixedId!;
        const extId = audio.sound.external_id || audio.sound.id.replace(/^[^:]+:/, '');
        formData.append('external_source', resolvedSource);
        formData.append('external_id', extId);
        if (audio.sound.audio_url) formData.append('audio_url', audio.sound.audio_url);
        formData.append('audio_title', audio.sound.title);
        formData.append('audio_artist', audio.sound.artist);
        formData.append('language', audio.sound.language || 'all');
      } else if (audio.sound.id && !audio.sound.id.includes(':')) {
        formData.append('audio_id', audio.sound.id);
      }
    }

    onProgress?.(20);

    const response = await apiFetch<{ success?: boolean; error?: string; hint?: string }>(
      '/api/reels/upload',
      {
        method: 'POST',
        token,
        body: formData,
        timeoutMs: 5 * 60 * 1000,
      },
    );

    onProgress?.(100);
    return response;
  } catch (err) {
    if (err instanceof ApiError) {
      const payload = err.data as { hint?: string } | undefined;
      const hint = payload?.hint;
      if (hint && !String(err.message).includes(hint)) {
        throw new ApiError(`${err.message}\n\n${hint}`, err.status, err.data);
      }
    }
    throw err;
  } finally {
    await cleanupPreparedGalleryUri(prepared.cleanupUri);
  }
}