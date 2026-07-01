import { Asset } from 'expo-asset';
import { cacheDirectory, readAsStringAsync, writeAsStringAsync } from 'expo-file-system/legacy';
import { loadAsync } from 'expo-three';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const SHOWROOM_SCALE = 3.15;
const CAR_BODY_COLOR = 0xc8d0dc;

let patchApplied = false;
let meshoptReady: Promise<void> | null = null;

async function attachMeshoptDecoder(loader: GLTFLoader): Promise<void> {
  if (!meshoptReady) {
    meshoptReady = (async () => {
      try {
        if (typeof WebAssembly === 'object' && MeshoptDecoder.supported) {
          await MeshoptDecoder.ready;
          loader.setMeshoptDecoder(MeshoptDecoder);
        }
      } catch (e) {
        console.warn('MeshoptDecoder unavailable:', e);
      }
    })();
  }
  await meshoptReady;
}
let blobCounter = 0;
const embeddedImages = new Map<string, { bytes: Uint8Array; mime: string }>();
const bufferCache = new Map<number, ArrayBuffer>();

function normalizeFileUri(uri: string): string {
  if (uri.startsWith('file://') || uri.startsWith('http://') || uri.startsWith('https://')) return uri;
  if (uri.startsWith('/')) return `file://${uri}`;
  return uri;
}

function toBytes(part: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (part instanceof ArrayBuffer) return new Uint8Array(part);
  return new Uint8Array(part.buffer, part.byteOffset, part.byteLength);
}

function bytesToBase64(bytes: Uint8Array): string {
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    output += table[(triple >> 18) & 63];
    output += table[(triple >> 12) & 63];
    output += i + 1 < bytes.length ? table[(triple >> 6) & 63] : '=';
    output += i + 2 < bytes.length ? table[triple & 63] : '=';
  }
  return output;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const normalized = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  const byteLength = (normalized.length * 3) / 4 - padding;
  const bytes = new Uint8Array(byteLength);
  let byteIndex = 0;
  for (let i = 0; i < normalized.length; i += 4) {
    const enc1 = table.indexOf(normalized[i]);
    const enc2 = table.indexOf(normalized[i + 1]);
    const enc3 = table.indexOf(normalized[i + 2]);
    const enc4 = table.indexOf(normalized[i + 3]);
    const triple = (enc1 << 18) | (enc2 << 12) | ((enc3 >= 0 ? enc3 : 0) << 6) | (enc4 >= 0 ? enc4 : 0);
    if (byteIndex < byteLength) bytes[byteIndex++] = (triple >> 16) & 255;
    if (byteIndex < byteLength) bytes[byteIndex++] = (triple >> 8) & 255;
    if (byteIndex < byteLength) bytes[byteIndex++] = triple & 255;
  }
  return bytes.buffer;
}

async function readAssetArrayBuffer(modelAsset: number): Promise<ArrayBuffer> {
  const hit = bufferCache.get(modelAsset);
  if (hit) return hit;

  const asset = Asset.fromModule(modelAsset);
  await asset.downloadAsync();
  const uri = normalizeFileUri(asset.localUri || asset.uri || '');
  if (!uri) throw new Error('GLB URI missing');

  let buffer: ArrayBuffer | null = null;
  try {
    const res = await fetch(uri);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      if (buf.byteLength > 1000) buffer = buf;
    }
  } catch {
    // filesystem fallback
  }

  if (!buffer) {
    const base64 = await readAsStringAsync(uri, { encoding: 'base64' });
    buffer = base64ToArrayBuffer(base64);
  }

  if (buffer.byteLength < 1000) throw new Error(`Invalid GLB (${buffer.byteLength}b)`);
  bufferCache.set(modelAsset, buffer);
  return buffer;
}

async function textureFromBytes(bytes: Uint8Array, mime: string): Promise<THREE.Texture> {
  const ext = mime.includes('png') ? 'png' : 'jpg';
  const uri = `${cacheDirectory}gltf_${bytes.length}_${blobCounter++}.${ext}`;
  await writeAsStringAsync(uri, bytesToBase64(bytes), { encoding: 'base64' });
  const texture = new THREE.Texture();
  texture.image = { data: { localUri: normalizeFileUri(uri) }, width: 512, height: 512 };
  (texture as THREE.Texture & { isDataTexture?: boolean }).isDataTexture = true;
  texture.needsUpdate = true;
  return texture;
}

function applyGltfNativePatches() {
  if (patchApplied) return;
  patchApplied = true;

  const g = global as typeof global & { createImageBitmap?: unknown };
  g.createImageBitmap = undefined;

  const ExpoTextureLoad = THREE.TextureLoader.prototype.load;

  class ReactNativeBlob {
    bytes: Uint8Array;
    type: string;
    constructor(parts: Array<ArrayBuffer | ArrayBufferView>, options?: { type?: string }) {
      this.bytes = toBytes(parts[0]);
      this.type = options?.type || 'image/png';
    }
  }

  // @ts-expect-error RN Blob shim
  global.Blob = ReactNativeBlob;

  // @ts-expect-error RN Blob shim — not browser Blob
  URL.createObjectURL = (blob: ReactNativeBlob) => {
    const key = `__gltf_embed_${blobCounter++}`;
    embeddedImages.set(key, { bytes: blob.bytes, mime: blob.type });
    return key;
  };

  URL.revokeObjectURL = (url: string) => embeddedImages.delete(url);

  THREE.TextureLoader.prototype.load = function loadWithEmbedded(
    url: string,
    onLoad?: (t: THREE.Texture) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: Error) => void,
  ) {
    if (typeof url === 'string' && url.startsWith('__gltf_embed_')) {
      const entry = embeddedImages.get(url);
      const placeholder = new THREE.Texture();
      if (!entry) {
        onLoad?.(placeholder);
        return placeholder;
      }
      void textureFromBytes(entry.bytes, entry.mime)
        .then((tex) => { embeddedImages.delete(url); onLoad?.(tex); })
        .catch(() => onLoad?.(placeholder));
      return placeholder;
    }
    return ExpoTextureLoad.call(this, url, onLoad, onProgress, onError as ((err: unknown) => void) | undefined);
  };
}

function toVisibleMaterial(mat: THREE.Material, index: number): THREE.MeshStandardMaterial {
  const src = mat as THREE.MeshStandardMaterial & { color?: THREE.Color };
  const hue = CAR_BODY_COLOR - (index * 0x080808);
  const color = src.color?.getHex?.() ? src.color.clone() : new THREE.Color(hue);
  const visible = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.55,
    roughness: 0.32,
    side: THREE.DoubleSide,
  });
  mat.dispose?.();
  return visible;
}

/** Visible materials — strip physical/transmission mats that crash expo-gl. */
function applyVisibleMaterials(root: THREE.Object3D) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    const next = mats.map((mat, i) => toVisibleMaterial(mat, i));
    child.material = Array.isArray(child.material) ? next : next[0];
  });
}

function buildPreparedCarGroup(scene: THREE.Object3D): THREE.Group {
  applyVisibleMaterials(scene);

  const carGroup = new THREE.Group();
  carGroup.add(scene);

  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  // Center X/Z; sit bottom of mesh on y = 0 (floor plane) before scale
  scene.position.set(-center.x, -box.min.y, -center.z);

  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = SHOWROOM_SCALE / maxDim;
  carGroup.scale.setScalar(scale);

  // Tiny lift so tyres rest on the disc, not clip into it
  carGroup.position.y = 0.04;

  return carGroup;
}

export function createFallbackCarGroup(): THREE.Group {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0x3b82f6, metalness: 0.55, roughness: 0.28 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.1, roughness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x88aacc, metalness: 0.8, roughness: 0.1, transparent: true, opacity: 0.7 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 3.8), paint);
  body.position.y = 0.55;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 2), glass);
  cabin.position.set(0, 0.95, -0.2);
  group.add(cabin);

  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 16);
  const wheelPos = [
    [-0.85, 0.32, 1.2], [0.85, 0.32, 1.2],
    [-0.85, 0.32, -1.2], [0.85, 0.32, -1.2],
  ];
  wheelPos.forEach(([x, y, z]) => {
    const w = new THREE.Mesh(wheelGeo, rubber);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, y, z);
    group.add(w);
  });

  group.scale.setScalar(0.85);
  group.position.y = 0.04;
  return group;
}

async function parseGltfFromAsset(modelAsset: number): Promise<THREE.Object3D> {
  applyGltfNativePatches();

  try {
    const gltf = await loadAsync(modelAsset);
    if (gltf?.scene) return gltf.scene;
  } catch (e) {
    console.warn('loadAsync failed:', e);
  }

  const buffer = await readAssetArrayBuffer(modelAsset);
  const loader = new GLTFLoader();
  await attachMeshoptDecoder(loader);
  const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) => {
    loader.parse(buffer, '', resolve, (err) => reject(err instanceof Error ? err : new Error(String(err))));
  });
  return gltf.scene;
}

/** Load car group for the active GL context (no cross-context clone). */
export async function loadShowroomCarGroup(modelAsset: number): Promise<THREE.Group> {
  try {
    const scene = await parseGltfFromAsset(modelAsset);
    return buildPreparedCarGroup(scene);
  } catch (err) {
    console.error('loadShowroomCarGroup fallback:', err);
    return createFallbackCarGroup();
  }
}

export function preloadShowroomModel(modelAsset: number): void {
  void readAssetArrayBuffer(modelAsset).catch(() => {});
}