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
};

/** Fallback when API has no showcase_model_key yet. */
export const SHOWCASE_TYPE_TO_MODEL_KEY: Record<string, string> = {
  car: 'golf_gti',
  supercar: 'golf_gti',
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
  return null;
}

export function hasShowcaseModel(source: ShowcaseModelSource): boolean {
  return resolveShowcaseModelAsset(source) != null;
}