/**
 * Bundled GLB showroom models.
 *
 * Add a new vehicle:
 * 1. Put `scene.glb` in `assets/models/your_key/` (e.g. golf_gti/scene-v1.glb)
 * 2. Register below in SHOWCASE_MODEL_ASSETS
 * 3. Set `showcase_model_key: 'your_key'` on the level (admin or levelSeed.js)
 */
/** Registry of bundled GLB showroom models (add folder under assets/models/). */
export const SHOWCASE_MODEL_ASSETS: Record<string, number> = {
  golf_gti: require('../assets/models/golf_gti/scene-v1.glb'),
  golf_gti_v2: require('../assets/models/golf_gti/scene-v2.glb'),
  golf_gti_v3: require('../assets/models/golf_gti/scene-v3.glb'),
};

/** Human-readable labels for garage UI. */
export const SHOWCASE_MODEL_LABELS: Record<string, string> = {
  golf_gti: 'Golf GTI',
  golf_gti_v2: 'Golf GTI V2',
  golf_gti_v3: 'Golf GTI V3',
};

/** Default bundled model for showroom until more assets are added. */
export const DEFAULT_SHOWCASE_MODEL_KEY = 'golf_gti';

/** Fallback when API has no showcase_model_key yet. */
export const SHOWCASE_TYPE_TO_MODEL_KEY: Record<string, string> = {
  scooter: 'golf_gti',
  bike: 'golf_gti',
  car: 'golf_gti',
  rath: 'golf_gti_v3',
  supercar: 'golf_gti_v2',
};

export type ShowcaseModelSource = {
  showcase_model_key?: string | null;
  showcase_type?: string;
};

export function resolveShowcaseModelAsset(source: ShowcaseModelSource): number | null {
  const explicit = source.showcase_model_key?.trim();
  if (explicit && SHOWCASE_MODEL_ASSETS[explicit]) {
    return SHOWCASE_MODEL_ASSETS[explicit];
  }
  const typeKey = source.showcase_type ? SHOWCASE_TYPE_TO_MODEL_KEY[source.showcase_type] : undefined;
  if (typeKey && SHOWCASE_MODEL_ASSETS[typeKey]) {
    return SHOWCASE_MODEL_ASSETS[typeKey];
  }
  if (SHOWCASE_MODEL_ASSETS[DEFAULT_SHOWCASE_MODEL_KEY]) {
    return SHOWCASE_MODEL_ASSETS[DEFAULT_SHOWCASE_MODEL_KEY];
  }
  return null;
}

export function hasShowcaseModel(source: ShowcaseModelSource): boolean {
  return resolveShowcaseModelAsset(source) != null;
}

export function resolveShowcaseModelLabel(source: ShowcaseModelSource): string {
  const explicit = source.showcase_model_key?.trim();
  if (explicit && SHOWCASE_MODEL_LABELS[explicit]) return SHOWCASE_MODEL_LABELS[explicit];
  const typeKey = source.showcase_type ? SHOWCASE_TYPE_TO_MODEL_KEY[source.showcase_type] : undefined;
  if (typeKey && SHOWCASE_MODEL_LABELS[typeKey]) return SHOWCASE_MODEL_LABELS[typeKey];
  return SHOWCASE_MODEL_LABELS[DEFAULT_SHOWCASE_MODEL_KEY] || '3D Vehicle';
}