import { Dimensions } from 'react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export const REEL_MAX_DURATION_SEC = 60;
export const REEL_MIN_DURATION_SEC = 3;

export const reelStudioColors = {
  bg: '#000000',
  surface: 'rgba(255,255,255,0.08)',
  surfaceStrong: 'rgba(255,255,255,0.14)',
  border: 'rgba(255,255,255,0.12)',
  primary: '#FF2D55',
  primarySoft: 'rgba(255,45,85,0.22)',
  accent: '#9333EA',
  text: '#FFFFFF',
  textMuted: 'rgba(255,255,255,0.55)',
  textSubtle: 'rgba(255,255,255,0.35)',
  success: '#4CD964',
};

/** 9:16 capture guide dimensions */
export const REEL_ASPECT = 9 / 16;
export const reelFrameWidth = SCREEN_W;
export const reelFrameHeight = Math.min(SCREEN_H * 0.72, SCREEN_W / REEL_ASPECT);
export const reelFrameTop = Math.max((SCREEN_H - reelFrameHeight) * 0.42, 80);

export function formatReelTime(sec: number) {
  const clamped = Math.max(0, Math.floor(sec));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatMs(ms?: number | null) {
  if (!ms) return '0:00';
  return formatReelTime(ms / 1000);
}