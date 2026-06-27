export type ReelSound = {
  id: string;
  title: string;
  artist: string;
  audio_url: string;
  cover_url: string | null;
  duration_ms: number;
  category: string;
  usage_count: number;
};

export type ReelVideoAsset = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  duration?: number | null;
};

export type ReelAudioSelection = {
  sound: ReelSound;
  startMs: number;
};