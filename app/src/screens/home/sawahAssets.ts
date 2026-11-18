import * as THREE from 'three';
import { BASE } from '../../lib/asset';

// Each plate stays separate so the landscape can be adjusted without flattening the live scene.
export const LANDSCAPE_ASSETS = {
  sky: `${BASE}hero/landscape-v2/sky.webp`,
  mountains: `${BASE}hero/landscape-v2/mountains.webp`,
  palms: `${BASE}hero/landscape-v2/palms.webp`,
  house: `${BASE}hero/landscape-v2/house.webp`,
  terraces: `${BASE}hero/landscape-v2/terraces.webp`,
} as const;

type AssetName = keyof typeof LANDSCAPE_ASSETS;
type LandscapeTextures = Record<AssetName, THREE.Texture<ImageBitmap>>;

export function disposeLandscapeTextures(textures: LandscapeTextures) {
  for (const texture of Object.values(textures)) {
    texture.image.close();
    texture.dispose();
  }
}

export async function loadLandscapeTextures(signal: AbortSignal): Promise<LandscapeTextures> {
  const names = Object.keys(LANDSCAPE_ASSETS) as AssetName[];
  const results = await Promise.allSettled(names.map(async (name) => {
    const response = await fetch(LANDSCAPE_ASSETS[name], { signal });
    if (!response.ok) throw new Error(`The landscape ${name} could not be loaded.`);
    // WebGL ignores Texture.flipY for ImageBitmap; orient it at decode time instead.
    const bitmap = await createImageBitmap(await response.blob(), {
      imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none',
    });
    if (signal.aborted) { bitmap.close(); throw new DOMException('Landscape loading was cancelled.', 'AbortError'); }
    const texture = new THREE.Texture(bitmap);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return [name, texture] as const;
  }));
  const textures = Object.fromEntries(results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])) as LandscapeTextures;
  const failure = results.find((result) => result.status === 'rejected');
  if (failure || signal.aborted) {
    disposeLandscapeTextures(textures);
    throw failure?.reason ?? new DOMException('Landscape loading was cancelled.', 'AbortError');
  }
  return textures;
}
