import { Platform } from 'react-native';
import { apiUpload } from './apiClient';
import type { ReelSound } from './reelTypes';

export type GalleryVideoForImport = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  duration?: number | null;
};

export async function importSoundFromGalleryVideo(
  asset: GalleryVideoForImport,
  token?: string | null,
  title?: string,
): Promise<ReelSound> {
  const formData = new FormData();

  if (Platform.OS === 'web') {
    const resp = await fetch(asset.uri);
    const blob = await resp.blob();
    const file = new File([blob], asset.fileName || 'video.mp4', {
      type: asset.mimeType || 'video/mp4',
    });
    formData.append('video', file);
  } else {
    const filename = asset.fileName || asset.uri.split('/').pop() || `import_${Date.now()}.mp4`;
    formData.append('video', {
      uri: asset.uri,
      type: asset.mimeType || 'video/mp4',
      name: filename,
    } as any);
  }

  if (title?.trim()) formData.append('title', title.trim());
  if (asset.duration && asset.duration > 0) {
    formData.append('duration_ms', String(Math.round(asset.duration)));
  }

  const data = await apiUpload<{ success?: boolean; sound?: ReelSound; error?: string }>(
    '/api/sounds/import-from-video',
    formData,
    token,
    5 * 60 * 1000,
  );

  if (!data.sound) {
    throw new Error(data.error || 'Failed to import sound from video');
  }

  return data.sound;
}