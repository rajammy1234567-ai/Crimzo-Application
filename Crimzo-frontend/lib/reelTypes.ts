export type SoundLanguage = {
  code: string;
  label: string;
  emoji?: string;
};

export type ReelSound = {
  id: string;
  title: string;
  artist: string;
  audio_url: string;
  cover_url: string | null;
  duration_ms: number;
  category: string;
  language: string;
  usage_count: number;
  reels_count?: number;
  is_trending?: boolean;
  source: 'crimzo' | 'audius' | string;
  external_id?: string | null;
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