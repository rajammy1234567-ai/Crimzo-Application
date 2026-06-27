import { Platform } from 'react-native';
import {
  cacheDirectory,
  copyAsync,
  deleteAsync,
  getInfoAsync,
} from 'expo-file-system/legacy';

/** Keep in sync with backend multer limit (cloudinary.js) */
export const REEL_MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

const GALLERY_CACHE_PREFIX = 'crimzo_gallery_';

export type GalleryVideoLike = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  duration?: number | null;
};

export type PreparedGalleryVideo = {
  uri: string;
  fileName: string;
  mimeType: string;
  /** Set when a temp cache copy was created and should be deleted after upload */
  cleanupUri?: string;
};

function guessMimeFromName(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.3gp')) return 'video/3gpp';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mkv')) return 'video/x-matroska';
  return 'video/mp4';
}

export function normalizeGalleryDurationMs(duration?: number | null): number | undefined {
  if (!duration || duration <= 0) return undefined;
  // ImagePicker usually returns ms; some Android builds return seconds
  return duration < 1000 ? Math.round(duration * 1000) : Math.round(duration);
}

function needsGalleryUriCopy(uri: string): boolean {
  return (
    uri.startsWith('content://')
    || uri.startsWith('ph://')
    || uri.startsWith('assets-library://')
    || (Platform.OS === 'android' && !uri.startsWith('file://'))
  );
}

/** Copy content:// / ph:// URIs to cache — required for reliable native multipart upload */
export async function prepareGalleryVideoForUpload(
  asset: GalleryVideoLike,
): Promise<PreparedGalleryVideo> {
  let uri = asset.uri?.trim();
  if (!uri) {
    throw new Error('No video selected from gallery.');
  }

  let fileName = asset.fileName?.trim() || `gallery_${Date.now()}.mp4`;
  let mimeType = asset.mimeType?.trim() || guessMimeFromName(fileName);

  if (!/\.\w{2,5}$/i.test(fileName)) {
    fileName += mimeType.includes('quicktime') ? '.mov' : '.mp4';
  }

  if (Platform.OS === 'web') {
    return { uri, fileName, mimeType };
  }

  if (needsGalleryUriCopy(uri)) {
    if (!cacheDirectory) {
      throw new Error('Could not access app cache to prepare gallery video.');
    }

    const safeName = fileName.replace(/[^\w.\-]/g, '_');
    const dest = `${cacheDirectory}${GALLERY_CACHE_PREFIX}${Date.now()}_${safeName}`;
    await copyAsync({ from: uri, to: dest });

    const info = await getInfoAsync(dest);
    if (!info.exists || !info.size) {
      await deleteAsync(dest, { idempotent: true }).catch(() => {});
      throw new Error('Could not read the selected video from gallery. Try another clip.');
    }

    return { uri: dest, fileName, mimeType, cleanupUri: dest };
  }

  const info = await getInfoAsync(uri).catch(() => null);
  if (!info?.exists || !info.size) {
    throw new Error('Could not read the selected video. Try picking it again from gallery.');
  }

  return { uri, fileName, mimeType };
}

export async function cleanupPreparedGalleryUri(uri?: string | null): Promise<void> {
  if (!uri || Platform.OS === 'web') return;
  if (!uri.includes(GALLERY_CACHE_PREFIX)) return;
  await deleteAsync(uri, { idempotent: true }).catch(() => {});
}

export async function getReelAssetSizeBytes(uri: string): Promise<number | null> {
  if (!uri) return null;

  if (Platform.OS === 'web') {
    try {
      const resp = await fetch(uri);
      const blob = await resp.blob();
      return blob.size;
    } catch {
      return null;
    }
  }

  try {
    const info = await getInfoAsync(uri);
    if (info.exists && typeof info.size === 'number') return info.size;
  } catch {
    // skip client-side size check
  }

  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function reelUploadErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error || '');
  if (/too large|LIMIT_FILE_SIZE|File too large/i.test(msg)) {
    return 'Video is too large (max 200MB). Record a shorter reel (under 60s) or pick a smaller video from gallery.';
  }
  if (/timeout|timed out/i.test(msg)) {
    return 'Upload timed out. Check WiFi and try a shorter video.';
  }
  if (/network|reach backend/i.test(msg)) {
    return msg;
  }
  if (/no audio|audio track/i.test(msg)) {
    return 'This video has no audio to extract. Pick a video with sound.';
  }
  if (/Video file required|gallery upload may have failed/i.test(msg)) {
    return 'Gallery video did not upload correctly. Re-open the app and try a shorter clip.';
  }
  return msg || 'Could not upload reel. Please try again.';
}