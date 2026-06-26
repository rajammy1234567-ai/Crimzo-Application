import type { IRtcEngine } from '../components/agoraImports';

export type LiveFilterId =
  | 'none'
  | 'natural'
  | 'smooth'
  | 'glow'
  | 'warm'
  | 'cool'
  | 'vivid'
  | 'rose';

export interface LiveFilterPreset {
  id: LiveFilterId;
  label: string;
  icon: string;
  swatch: string;
  /** Semi-transparent tint for expo-camera dev preview */
  overlay?: string;
  beauty: {
    enabled: boolean;
    lighteningLevel?: number;
    smoothnessLevel?: number;
    rednessLevel?: number;
    lighteningContrastLevel?: number;
  };
  colorEnhance: {
    enabled: boolean;
    strengthLevel?: number;
    skinProtectLevel?: number;
  };
}

export const LIVE_FILTERS: LiveFilterPreset[] = [
  {
    id: 'none',
    label: 'Original',
    icon: 'remove-circle-outline',
    swatch: '#6B7280',
    beauty: { enabled: false },
    colorEnhance: { enabled: false },
  },
  {
    id: 'natural',
    label: 'Natural',
    icon: 'leaf-outline',
    swatch: '#E8B4B8',
    beauty: { enabled: true, lighteningLevel: 0.5, smoothnessLevel: 0.4, rednessLevel: 0.1, lighteningContrastLevel: 1 },
    colorEnhance: { enabled: false },
  },
  {
    id: 'smooth',
    label: 'Smooth',
    icon: 'water-outline',
    swatch: '#C9B1FF',
    beauty: { enabled: true, lighteningLevel: 0.4, smoothnessLevel: 0.75, rednessLevel: 0.05, lighteningContrastLevel: 1 },
    colorEnhance: { enabled: false },
  },
  {
    id: 'glow',
    label: 'Glow',
    icon: 'sunny-outline',
    swatch: '#FFD699',
    beauty: { enabled: true, lighteningLevel: 0.8, smoothnessLevel: 0.35, rednessLevel: 0.08, lighteningContrastLevel: 1 },
    colorEnhance: { enabled: true, strengthLevel: 0.45, skinProtectLevel: 0.85 },
  },
  {
    id: 'warm',
    label: 'Warm',
    icon: 'flame-outline',
    swatch: '#FF9F6B',
    overlay: 'rgba(255, 140, 60, 0.12)',
    beauty: { enabled: true, lighteningLevel: 0.55, smoothnessLevel: 0.35, rednessLevel: 0.2, lighteningContrastLevel: 1 },
    colorEnhance: { enabled: true, strengthLevel: 0.35, skinProtectLevel: 0.9 },
  },
  {
    id: 'cool',
    label: 'Cool',
    icon: 'snow-outline',
    swatch: '#7EC8E3',
    overlay: 'rgba(80, 160, 255, 0.14)',
    beauty: { enabled: true, lighteningLevel: 0.45, smoothnessLevel: 0.3, rednessLevel: 0.02, lighteningContrastLevel: 0 },
    colorEnhance: { enabled: true, strengthLevel: 0.25, skinProtectLevel: 0.95 },
  },
  {
    id: 'vivid',
    label: 'Vivid',
    icon: 'color-palette-outline',
    swatch: '#FF6B8A',
    beauty: { enabled: true, lighteningLevel: 0.35, smoothnessLevel: 0.25, rednessLevel: 0.12, lighteningContrastLevel: 2 },
    colorEnhance: { enabled: true, strengthLevel: 0.7, skinProtectLevel: 0.75 },
  },
  {
    id: 'rose',
    label: 'Rose',
    icon: 'heart-outline',
    swatch: '#FF8FAB',
    overlay: 'rgba(255, 80, 120, 0.1)',
    beauty: { enabled: true, lighteningLevel: 0.5, smoothnessLevel: 0.5, rednessLevel: 0.25, lighteningContrastLevel: 1 },
    colorEnhance: { enabled: true, strengthLevel: 0.3, skinProtectLevel: 0.9 },
  },
];

export function getLiveFilterPreset(id: LiveFilterId): LiveFilterPreset {
  return LIVE_FILTERS.find((f) => f.id === id) ?? LIVE_FILTERS[1];
}

type EngineFilterApi = IRtcEngine & {
  setBeautyEffectOptions?: (enabled: boolean, options: Record<string, number>) => number;
  setColorEnhanceOptions?: (enabled: boolean, options: Record<string, number>) => number;
};

export function applyLiveFilterToEngine(engine: IRtcEngine | null, preset: LiveFilterPreset): void {
  if (!engine) return;
  const eng = engine as EngineFilterApi;

  try {
    if (typeof eng.setBeautyEffectOptions === 'function') {
      eng.setBeautyEffectOptions(preset.beauty.enabled, preset.beauty.enabled
        ? {
          lighteningContrastLevel: preset.beauty.lighteningContrastLevel ?? 1,
          lighteningLevel: preset.beauty.lighteningLevel ?? 0,
          smoothnessLevel: preset.beauty.smoothnessLevel ?? 0,
          rednessLevel: preset.beauty.rednessLevel ?? 0,
        }
        : {});
    }
  } catch (err) {
    console.warn('[LiveFilter] setBeautyEffectOptions failed:', err);
  }

  try {
    if (typeof eng.setColorEnhanceOptions === 'function') {
      eng.setColorEnhanceOptions(preset.colorEnhance.enabled, preset.colorEnhance.enabled
        ? {
          strengthLevel: preset.colorEnhance.strengthLevel ?? 0.5,
          skinProtectLevel: preset.colorEnhance.skinProtectLevel ?? 1,
        }
        : {});
    }
  } catch (err) {
    console.warn('[LiveFilter] setColorEnhanceOptions failed:', err);
  }
}