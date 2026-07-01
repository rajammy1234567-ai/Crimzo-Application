import { Image } from 'react-native';
import { Asset } from 'expo-asset';
import { cacheDirectory, writeAsStringAsync } from 'expo-file-system/legacy';
import 'expo-three/build/polyfillTextureLoader.fx';
import { loadArrayBufferAsync } from 'expo-three/build/loaders/loadModelsAsync';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

type GltfResult = { scene: THREE.Group };

let patchApplied = false;
let blobCounter = 0;
const embeddedImages = new Map<string, { bytes: Uint8Array; mime: string }>();

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

function toBytes(part: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (part instanceof ArrayBuffer) return new Uint8Array(part);
  return new Uint8Array(part.buffer, part.byteOffset, part.byteLength);
}

async function textureFromBytes(bytes: Uint8Array, mime: string): Promise<THREE.Texture> {
  const ext = mime.includes('png') ? 'png' : mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'img';
  const uri = `${cacheDirectory}gltf_tex_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  await writeAsStringAsync(uri, bytesToBase64(bytes), { encoding: 'base64' });

  const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    Image.getSize(uri, (w, h) => resolve({ width: w, height: h }), reject);
  });

  const texture = new THREE.Texture();
  texture.image = {
    data: { localUri: uri },
    width,
    height,
  };
  (texture as THREE.Texture & { isDataTexture?: boolean }).isDataTexture = true;
  texture.needsUpdate = true;
  return texture;
}

function applyGltfEmbeddedTexturePatch() {
  if (patchApplied) return;
  patchApplied = true;

  const ExpoTextureLoad = THREE.TextureLoader.prototype.load;

  // RN has no Blob(ArrayBuffer) — stub it and route embedded GLB images through FileSystem.
  class ReactNativeBlob {
    bytes: Uint8Array;
    type: string;
    constructor(parts: Array<ArrayBuffer | ArrayBufferView>, options?: { type?: string }) {
      this.bytes = toBytes(parts[0]);
      this.type = options?.type || 'application/octet-stream';
    }
  }

  const NativeBlob = global.Blob;
  // @ts-expect-error RN Blob polyfill for GLTF embedded images
  global.Blob = ReactNativeBlob;

  const nativeCreateObjectURL = URL.createObjectURL?.bind(URL);
  URL.createObjectURL = (blob: ReactNativeBlob) => {
    const key = `__gltf_embed_${blobCounter++}`;
    embeddedImages.set(key, { bytes: blob.bytes, mime: blob.type });
    return key;
  };

  const nativeRevokeObjectURL = URL.revokeObjectURL?.bind(URL);
  URL.revokeObjectURL = (url: string) => {
    embeddedImages.delete(url);
    nativeRevokeObjectURL?.(url);
  };

  THREE.TextureLoader.prototype.load = function loadWithEmbedded(
    url: string,
    onLoad?: (texture: THREE.Texture) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: Error) => void,
  ) {
    if (typeof url === 'string' && url.startsWith('__gltf_embed_')) {
      const entry = embeddedImages.get(url);
      const placeholder = new THREE.Texture();
      if (!entry) {
        onError?.(new Error('Missing embedded GLTF image'));
        return placeholder;
      }
      void textureFromBytes(entry.bytes, entry.mime)
        .then((tex) => {
          embeddedImages.delete(url);
          onLoad?.(tex);
        })
        .catch((err: Error) => onError?.(err));
      return placeholder;
    }
    return ExpoTextureLoad.call(this, url, onLoad, onProgress, onError);
  };

  // Restore if something else needs native Blob later (unlikely in this loader path).
  if (NativeBlob) {
    (global as typeof global & { __crimzoNativeBlob?: typeof Blob }).__crimzoNativeBlob = NativeBlob;
  }
}

export async function loadGltfFromAsset(modelAsset: number): Promise<GltfResult> {
  applyGltfEmbeddedTexturePatch();

  const asset = Asset.fromModule(modelAsset);
  await asset.downloadAsync();
  const uri = asset.localUri || asset.uri;
  if (!uri) throw new Error('GLB asset URI missing');

  const arrayBuffer = await loadArrayBufferAsync({ uri });
  const loader = new GLTFLoader();

  return new Promise<GltfResult>((resolve, reject) => {
    loader.parse(
      arrayBuffer,
      uri.substring(0, uri.lastIndexOf('/') + 1),
      (gltf) => resolve(gltf as GltfResult),
      reject,
    );
  });
}