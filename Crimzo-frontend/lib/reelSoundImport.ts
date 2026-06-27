import { Platform } from 'react-native';
import { apiUpload, ApiError } from './apiClient';
import type { ReelSound } from './reelTypes';
import {
  cleanupPreparedGalleryUri,
  normalizeGalleryDurationMs,
  prepareGalleryVideoForUpload,
  type GalleryVideoLike,
} from './reelVideoUtils';

export type GalleryVideoForImport = GalleryVideoLike;

export async function importSoundFromGalleryVideo(
  asset: GalleryVideoLike,
  token?: string | null,
  title?: string,
): Promise<ReelSound> {
  const prepared = await prepareGalleryVideoForUpload(asset);
  const formData = new FormData();

  try {
    if (Platform.OS === 'web') {
      const resp = await fetch(prepared.uri);
      const blob = await resp.blob();
      if (!blob.size) {
        throw new Error('Selected video is empty. Try another clip from gallery.');
      }
      const file = new File([blob], prepared.fileName, { type: prepared.mimeType });
      formData.append('video', file);
    } else {
      formData.append('video', {
        uri: prepared.uri,
        type: prepared.mimeType,
        name: prepared.fileName,
      } as any);
    }

    if (title?.trim()) formData.append('title', title.trim());

    const durationMs = normalizeGalleryDurationMs(asset.duration);
    if (durationMs) formData.append('duration_ms', String(durationMs));

    const data = await apiUpload<{ success?: boolean; sound?: ReelSound; error?: string; hint?: string }>(
      '/api/sounds/import-from-video',
      formData,
      token,
      5 * 60 * 1000,
    );

    if (!data.sound) {
      throw new Error(data.error || 'Failed to import sound from video');
    }

    return data.sound;
  } catch (err) {
    if (err instanceof ApiError) {
      const payload = err.data as { hint?: string } | undefined;
      const hint = payload?.hint;
      if (hint && !err.message.includes(hint)) {
        throw new Error(`${err.message}\n\n${hint}`);
      }
    }
    throw err;
  } finally {
    await cleanupPreparedGalleryUri(prepared.cleanupUri);
  }
}