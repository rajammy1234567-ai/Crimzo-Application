import { Platform } from 'react-native';
import { apiFetch } from './apiClient';
import type { ReelAudioSelection, ReelVideoAsset } from './reelTypes';

type UploadReelOptions = {
  asset: ReelVideoAsset;
  caption: string;
  token?: string | null;
  audio?: ReelAudioSelection | null;
  onProgress?: (pct: number) => void;
};

export async function uploadReel({
  asset,
  caption,
  token,
  audio,
  onProgress,
}: UploadReelOptions) {
  const formData = new FormData();

  if (Platform.OS === 'web') {
    const resp = await fetch(asset.uri);
    const blob = await resp.blob();
    const file = new File([blob], asset.fileName || 'reel.mp4', {
      type: asset.mimeType || 'video/mp4',
    });
    formData.append('video', file);
  } else {
    const filename = asset.fileName || asset.uri.split('/').pop() || `reel_${Date.now()}.mp4`;
    formData.append('video', {
      uri: asset.uri,
      type: asset.mimeType || 'video/mp4',
      name: filename,
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

  onProgress?.(30);

  const response = await apiFetch<{ success?: boolean; error?: string }>('/api/reels/upload', {
    method: 'POST',
    token,
    body: formData,
    timeoutMs: 5 * 60 * 1000,
  });

  onProgress?.(100);
  return response;
}