// The paddy at first light: mirror water, the bloom on its stem, and the land behind it in mist.
// One scene holds everything, so light, haze, reflection and what hides what always agree.
import * as THREE from 'three';
import { FRAMES, WIDE_QUERY } from './sawahFrame';
import { paintGlow, seeded, type Rand } from './sawahPaint';
import { disposeLandscapeTextures, loadLandscapeTextures } from './sawahAssets';
import { createFlower, GRASP, SEED_HEIGHT } from './sawahFlower';
import {
  domeFragment, domeVertex, egretFragment, egretVertex, fireflyFragment, fireflyVertex, mistFragment, mistVertex,
  riceFragment, riceVertex, waterFragment, waterVertex,
} from './sawahShaders';

type FrameName = keyof typeof FRAMES;

/** Where the camera stands for each frame, and where the volcano sits in its sky (degrees). */
interface Shot {
  eye: [number, number, number];
  look: [number, number, number];
  fov: number;
  peakAz: number;
  peakEl: number;
  /** seedlings left of this x are not planted yet; the copy sits over that open water */
  leftEdge: number;
}

const SHOTS: Record<FrameName, Shot> = {
  wide: { eye: [-1.77, 0.92, 8.11], look: [-1.77, 0.92, 0], fov: 30, peakAz: 4, peakEl: 9.4, leftEdge: -1.9 },
  tall: { eye: [0, 0.92, 7.46], look: [0, 0.92, 0], fov: 30, peakAz: -10, peakEl: 9.4, leftEdge: -1000 },
};

/** The sun rests this far above the seed, in the V between the two upper petals. */
const SUN_CRADLE = 0.78;
const TAU = Math.PI * 2;
/** A drag across the bloom's own radius turns it by this many radians, so it feels the same on any screen. */
const TURN_PER_RADIUS = 1.5;

// Use coarser texture mip levels as the landscape recedes, without blurring the foreground render.
const blurBias = (strength: number) => strength * 0.3;

function softenLandscapeMap(material: THREE.MeshBasicMaterial, strength: number) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uLandscapeBlur = { value: blurBias(strength) };
    const mapFragment = THREE.ShaderChunk.map_fragment.replace(
      'texture2D( map, vMapUv )', 'texture2D( map, vMapUv, uLandscapeBlur )',
    );
    shader.fragmentShader = `uniform float uLandscapeBlur;\n${shader.fragmentShader}`
      .replace('#include <map_fragment>', mapFragment);
  };
}

// ---------------------------------------------------------------- palettes

const COLOR_KEYS = [
  'skyTop', 'skyMid', 'skyLow', 'haze', 'glow', 'sun', 'peak', 'peakLit', 'ridge', 'body', 'glitter', 'waterTint',
  'riceBase', 'riceTip', 'riceBack', 'bank', 'terrace', 'grove', 'groveFar', 'house', 'window', 'mist', 'firefly', 'egret',
  'sunLight', 'hemiSky', 'hemiGround', 'key', 'lantern', 'seedLight', 'petalLight', 'petalAura', 'translucent', 'halo', 'mote',
] as const;
const LEVEL_KEYS = [
  'glowPower', 'sunSize', 'reflectMin', 'windowGlow', 'mistOpacity', 'sunIntensity', 'hemiIntensity', 'keyIntensity',
  'env', 'lanternIntensity', 'seedGlow', 'petalGlow', 'translucency', 'halo', 'motes', 'lampReach', 'flare', 'stars',
  'fireflies', 'egrets', 'exposure', 'fog',
] as const;
type ColorKey = (typeof COLOR_KEYS)[number];
type LevelKey = (typeof LEVEL_KEYS)[number];
interface Palette { color: Record<ColorKey, THREE.Color>; level: Record<LevelKey, number> }

function palette(colors: Record<ColorKey, string>, level: Record<LevelKey, number>): Palette {
  const color = {} as Record<ColorKey, THREE.Color>;
  for (const key of COLOR_KEYS) color[key] = new THREE.Color(colors[key]);
  return { color, level: { ...level } };
}

function blend(out: Palette, a: Palette, b: Palette, k: number) {
  for (const key of COLOR_KEYS) out.color[key].lerpColors(a.color[key], b.color[key], k);
  for (const key of LEVEL_KEYS) out.level[key] = a.level[key] + (b.level[key] - a.level[key]) * k;
}

/** First light: photographic clouds and terrain with a warm, quiet waterline. The low sun shines through the petals. */
const firstLight = () => palette({
  skyTop: '#F3F0E9', skyMid: '#F3E9D8', skyLow: '#F3DDBC', haze: '#EFE1CC', glow: '#FFD591', sun: '#FFFBF0',
  peak: '#9AA7C8', peakLit: '#C9B9B4', ridge: '#7F93A8', body: '#B7B596', glitter: '#FFE2A8', waterTint: '#D9D3BC',
  riceBase: '#3F6B38', riceTip: '#94B457', riceBack: '#D3E08C', bank: '#6E7F56', terrace: '#8A9A66',
  grove: '#3F5A55', groveFar: '#58707A', house: '#5A4A42', window: '#FFD08A', mist: '#F6ECDC', firefly: '#FFE9A8', egret: '#FFFDF7',
  sunLight: '#FFD7A1', hemiSky: '#FFF4E3', hemiGround: '#CFC8AE', key: '#FFF3E2', lantern: '#FFB868',
  seedLight: '#FFB443', petalLight: '#FFD58C', petalAura: '#AFA3FF', translucent: '#FFC98C', halo: '#FFE2B4', mote: '#FFE7AE',
}, {
  glowPower: 0.18, sunSize: 0.32, reflectMin: 0.8, windowGlow: 0, mistOpacity: 0.5, sunIntensity: 3.2, hemiIntensity: 0.9,
  keyIntensity: 2.8, env: 1.4, lanternIntensity: 0.3, seedGlow: 0.35, petalGlow: 0.08, translucency: 1, halo: 0.06, motes: 0.35,
  lampReach: 0, flare: 0.05, stars: 0, fireflies: 0, egrets: 0.95, exposure: 1, fog: 0.0045,
});

/** The same paddy after dark: moon for sun, and the bloom lit from its seed like a lamp left on for the family. */
const moonrise = () => palette({
  skyTop: '#171B28', skyMid: '#1A2238', skyLow: '#273356', haze: '#222C4A', glow: '#5F78C8', sun: '#FFF4DA',
  peak: '#141B33', peakLit: '#27345C', ridge: '#101730', body: '#0E1424', glitter: '#DCE6FF', waterTint: '#6F7FA8',
  riceBase: '#132B27', riceTip: '#2F5645', riceBack: '#6F9584', bank: '#101A28', terrace: '#16223A',
  grove: '#0C1326', groveFar: '#141D36', house: '#0B0F1E', window: '#FFC46A', mist: '#3A4670', firefly: '#F3FF9E', egret: '#6F7FA8',
  sunLight: '#BFD0FF', hemiSky: '#3B4C82', hemiGround: '#141B30', key: '#9FB2E6', lantern: '#FFC27A',
  seedLight: '#FFA22E', petalLight: '#FFC872', petalAura: '#9D8CFF', translucent: '#A9B9FF', halo: '#B3A2FF', mote: '#FFE6A6',
}, {
  glowPower: 0.45, sunSize: 0.55, reflectMin: 0.78, windowGlow: 1, mistOpacity: 0.5, sunIntensity: 2.4, hemiIntensity: 0.8,
  keyIntensity: 1.1, env: 1.3, lanternIntensity: 1.4, seedGlow: 0.95, petalGlow: 0.55, translucency: 0.5, halo: 0.32, motes: 1,
  lampReach: 0.5, flare: 0.16, stars: 1, fireflies: 1, egrets: 0, exposure: 1.1, fog: 0.0125,
});

// ---------------------------------------------------------------- geometry

/** A level landing under the hut, becoming an uneven grassy bank away from its feet. */
function bankHeight(x: number) {
  const landing = 1 - THREE.MathUtils.smoothstep(Math.abs(x + 2), 7, 18);
  const rolling = 0.65 + 0.18 * Math.sin(x * 0.035) + 0.12 * Math.sin(x * 0.13);
  return THREE.MathUtils.lerp(rolling, 1.2, landing);
}

/** The waterline curves in depth and has an earthen lip; the land extends behind the hut. */
function buildBank() {
  const position: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  const columns = 240;
  for (let i = 0; i <= columns; i++) {
    const x = -180 + i * 1.5;
    const front = -87 + 6 * Math.sin(x * 0.045) + 2 * Math.sin(x * 0.13);
    const top = bankHeight(x);
    const section = [
      [front + 1.6, -0.18, 0.015],
      [front, top * 0.6, 0.045],
      [front - 1.6, top, 0.1],
      [-178, top, 0.19],
    ];
    for (const [z, y, v] of section) {
      position.push(x, y, z);
      // Only the opaque grass/soil at the foot of the terrace plate is used on the bank.
      uv.push(i / columns, v);
    }
    if (i < columns) {
      for (let row = 0; row < 3; row++) {
        const a = i * 4 + row;
        index.push(a, a + 4, a + 1, a + 4, a + 5, a + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** Rows of young rice as one mesh. Detail falls with distance; the wind is added in the shader. */
function buildRice(rand: Rand) {
  const position: number[] = [];
  const root: number[] = [];
  const bend: number[] = [];
  const tone: number[] = [];
  const index: number[] = [];
  const rowGap = 1.15;
  const plantGap = 1.3;

  function tuft(x: number, z: number, detail: number) {
    const blades = detail === 0 ? 8 : detail === 1 ? 5 : 3;
    const segments = detail === 0 ? 4 : detail === 1 ? 2 : 1;
    const phase = rand();
    const shade = rand();
    const height = 0.44 + rand() * 0.2;
    for (let b = 0; b < blades; b++) {
      const angle = rand() * Math.PI * 2;
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      const tall = height * (0.72 + rand() * 0.4);
      const lean = tall * (0.16 + rand() * 0.44);
      const half = (detail === 2 ? 0.028 : 0.017) + rand() * 0.01;
      // A blade is flat; turn its face mostly toward the viewer so it never thins to a line.
      let wx = -dz * 0.45 + 0.9;
      let wz = dx * 0.45;
      const wl = Math.hypot(wx, wz);
      wx /= wl;
      wz /= wl;
      const bladeTone = shade * 0.6 + rand() * 0.4;
      const start = position.length / 3;
      const vertex = (px: number, py: number, pz: number, along: number, side: number) => {
        position.push(px, py, pz);
        root.push(x, z, phase);
        bend.push(dx, dz, along);
        tone.push(bladeTone, side);
      };
      for (let j = 0; j <= segments; j++) {
        const t = j / segments;
        const cx = x + dx * lean * t * t;
        const cz = z + dz * lean * t * t;
        const cy = tall * (t - 0.14 * t * t);
        if (j === segments) vertex(cx, cy, cz, t, 0);
        else {
          const w = half * (1 - 0.55 * t);
          vertex(cx - wx * w, cy, cz - wz * w, t, -1);
          vertex(cx + wx * w, cy, cz + wz * w, t, 1);
        }
      }
      for (let j = 0; j < segments - 1; j++) {
        const a = start + j * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      const a = start + (segments - 1) * 2;
      index.push(a, a + 1, a + 2);
    }
  }

  for (let z = 2.3; z > -80; z -= plantGap) {
    const ahead = 8.2 - z;
    const reach = ahead * 0.76 + 4;
    const first = Math.ceil((-0.9 - reach) / rowGap - 0.5);
    const last = Math.floor((-0.9 + reach) / rowGap - 0.5);
    for (let i = first; i <= last; i++) {
      const x = (i + 0.5) * rowGap + (rand() - 0.5) * 0.16;
      const pz = z + (rand() - 0.5) * 0.3;
      // The lane in front of the bloom stays clear, so its reflection lies on open water.
      if (Math.abs(x) < 1.5 && pz > -6) continue;
      tuft(x, pz, ahead < 15 ? 0 : ahead < 42 ? 1 : 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('aRoot', new THREE.Float32BufferAttribute(root, 3));
  geometry.setAttribute('aBend', new THREE.Float32BufferAttribute(bend, 3));
  geometry.setAttribute('aTone', new THREE.Float32BufferAttribute(tone, 2));
  geometry.setIndex(index);
  return geometry;
}

function buildFireflies(rand: Rand, count: number) {
  const position: number[] = [];
  const seed: number[] = [];
  for (let i = 0; i < count; i++) {
    // Mostly to the right of the copy, so a firefly seldom crosses a line of text.
    position.push(-4 + rand() * 20, 0.3 + rand() * 2.3, -14 + rand() * 18);
    seed.push(rand(), 0.25 + rand() * 0.5, 0.3 + rand() * 0.7, 0.05 + rand() * 0.06);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 4));
  return geometry;
}

/** A loose skein of egrets. At rest (and in the poster) it hangs before the volcano's flank. */
function buildEgrets(rand: Rand, count: number) {
  const position: number[] = [];
  const seed: number[] = [];
  for (let i = 0; i < count; i++) {
    const rank = Math.ceil(i / 2);
    const side = i % 2 ? 1 : -1;
    position.push(-1.5 + rank * 2.1 + rand() * 0.6, 8.6 + side * rank * 0.55 + rand() * 0.3, -58 + side * rank * 1.6);
    seed.push(rand(), 1.8 + rand() * 0.4, rand());
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 3));
  return geometry;
}

function disposeTree(...roots: THREE.Object3D[]) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  for (const root of roots) root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Points)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    if (material instanceof THREE.ShaderMaterial) {
      for (const uniform of Object.values(material.uniforms)) if (uniform.value instanceof THREE.Texture) textures.add(uniform.value);
    }
    material.dispose();
  }
  for (const geometry of geometries) geometry.dispose();
  const bitmaps = new Set<ImageBitmap>();
  for (const texture of textures) {
    if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) bitmaps.add(texture.image);
    texture.dispose();
  }
  for (const bitmap of bitmaps) bitmap.close();
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

// ---------------------------------------------------------------- the scene

export function mountFlowerScene(host: HTMLElement, reducedMotion: boolean, onContextLost: () => void) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'default' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Neutral keeps the brand indigo and bronze true; only the bloom's own materials pass through it.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.append(renderer.domElement);

  const zone = host.closest<HTMLElement>('.home-hero') ?? host;
  const wideQuery = matchMedia(WIDE_QUERY);
  const scheme = matchMedia('(prefers-color-scheme: dark)');
  const controller = new AbortController();
  const light = firstLight();
  const dark = moonrise();
  const live = firstLight();
  const rand = seeded(20261116);

  const scene = new THREE.Scene();
  const fog = new THREE.FogExp2(0xffffff, 0.0115);
  scene.fog = fog;
  const camera = new THREE.PerspectiveCamera(30, 2.4, 0.5, 2000);
  const mirror = new THREE.PerspectiveCamera(30, 2.4, 0.5, 2000);
  mirror.up.set(0, -1, 0);
  const floats = renderer.extensions.has('EXT_color_buffer_half_float') || renderer.extensions.has('EXT_color_buffer_float');
  // No multisampling here: on some drivers a multisampled float target leaves dark seams in the mirrored sky.
  const reflection = new THREE.WebGLRenderTarget(2, 2, { type: floats ? THREE.HalfFloatType : THREE.UnsignedByteType });
  const textureMatrix = new THREE.Matrix4();

  // Uniforms that several materials share point at the same object.
  const uTime = { value: 0 };
  const uFocal = { value: 1000 };
  const uSunDir = { value: new THREE.Vector3(0, 0.1, -1) };
  const uHaze = { value: live.color.haze };
  const uFogDensity = { value: 0.0115 };
  const uGlow = { value: live.color.glow };
  const uGlowPower = { value: 0.5 };
  // The bloom as a light on the water and the seedlings: where its seed is, and how far its light reaches.
  const uLamp = { value: new THREE.Vector4(0, SEED_HEIGHT, 0, 0) };
  const uLampColor = { value: new THREE.Color() };

  // ---- sky, sun and mountains
  const domeMaterial = new THREE.ShaderMaterial({
    vertexShader: domeVertex, fragmentShader: domeFragment, side: THREE.BackSide, depthWrite: false, toneMapped: false,
    uniforms: {
      uSkyTop: { value: live.color.skyTop }, uSkyMid: { value: live.color.skyMid }, uSkyLow: { value: live.color.skyLow },
      tSky: { value: null }, tMountains: { value: null }, uNight: { value: 0 },
      uLandscapeBlur: { value: blurBias(7) },
      uMountainAngles: { value: new THREE.Vector2() },
      uHaze, uGlow, uGlowPower, uSunColor: { value: live.color.sun }, uSunDir, uSunAngles: { value: new THREE.Vector2() },
      uSunSize: { value: 1.25 },
      uStars: { value: 0 }, uTime, uEnv: { value: 0 },
      uWaterTint: { value: live.color.waterTint },
    },
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), domeMaterial);
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  scene.add(dome);
  // The same sky, without the sun's disc and with the water's bounce below, lights the bloom.
  const skyScene = new THREE.Scene();
  skyScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), domeMaterial));
  const pmrem = new THREE.PMREMGenerator(renderer);
  let environment: THREE.WebGLRenderTarget | undefined;

  // ---- water
  const waterMaterial = new THREE.ShaderMaterial({
    vertexShader: waterVertex, fragmentShader: waterFragment, toneMapped: false,
    uniforms: {
      tReflection: { value: reflection.texture }, uTextureMatrix: { value: textureMatrix }, uTime, uFocal, uSunDir,
      uGlitter: { value: live.color.glitter }, uBody: { value: live.color.body }, uReflectMin: { value: 0.8 },
      uHaze, uFogDensity, uStem: { value: new THREE.Vector3(0, 0, reducedMotion ? 0.6 : 1) },
      uDrops: { value: [new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)] },
      uLamp, uLampColor,
    },
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(2400, 1700), waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.z = -820;
  scene.add(water);

  // ---- rice
  const riceMaterial = new THREE.ShaderMaterial({
    vertexShader: riceVertex, fragmentShader: riceFragment, side: THREE.DoubleSide, toneMapped: false,
    uniforms: {
      uTime, uSway: { value: 0 }, uLeftEdge: { value: -3 }, uBase: { value: live.color.riceBase },
      uTip: { value: live.color.riceTip }, uBack: { value: live.color.riceBack }, uSunDir, uHaze, uFogDensity, uLamp, uLampColor,
    },
  });
  const rice = new THREE.Mesh(buildRice(rand), riceMaterial);
  rice.frustumCulled = false;
  scene.add(rice);

  // ---- a curved, textured waterline supporting the hut and the terraced fields behind it
  const bankMaterial = new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide });
  softenLandscapeMap(bankMaterial, 2.5);
  const bank = new THREE.Mesh(buildBank(), bankMaterial);
  scene.add(bank);

  // ---- individual photographic cutouts, placed in the same space as the water and bloom
  function billboard(width: number, height: number, x: number, y: number, z: number, blur: number) {
    const own = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.04, depthWrite: false, toneMapped: false });
    softenLandscapeMap(own, blur);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), own);
    mesh.position.set(x, y + height / 2, z);
    scene.add(mesh);
    return own;
  }
  const terraceMaterial = billboard(240, 46, 0, -1.8, -145, 6);
  const groveNear = [
    // The texture has a little clear padding below its roots. Submerge that padding
    // and the feet, rather than putting the trees on a floating patch of undergrowth.
    billboard(28, 18.67, 34, -0.55, -64, 1.5),
  ];
  const groveFar = [
    billboard(24, 16, -1.5, 0.28, -110, 4),
    billboard(36, 24, 49, 0.2, -130, 5),
  ];
  // The small clear margin under the house's feet is buried in its level landing.
  const houseMaterial = billboard(12, 8, -2, bankHeight(-2) - 0.24, -93, 3);
  const windowMaterial = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, fog: false });
  const windowPane = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.75), windowMaterial);
  windowPane.position.set(0.1, bankHeight(-2) + 2.8, -92.9);
  scene.add(windowPane);
  const glowTexture = new THREE.CanvasTexture(paintGlow());
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  const contactMaterial = new THREE.MeshBasicMaterial({
    map: glowTexture, color: 0x322c1b, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false,
  });
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(12, 4.5), contactMaterial);
  contact.rotation.x = -Math.PI / 2;
  contact.position.set(-2, bankHeight(-2) + 0.015, -92.5);
  scene.add(contact);
  const glowMaterial = new THREE.MeshBasicMaterial({
    map: glowTexture, transparent: true, depthWrite: false, toneMapped: false, fog: false, blending: THREE.AdditiveBlending,
  });
  const windowGlow = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), glowMaterial);
  windowGlow.position.set(0.1, bankHeight(-2) + 2.8, -92.8);
  scene.add(windowGlow);
  // The sun's light spills a little over the petals that hold it, as it does in a lens.
  const flareMaterial = new THREE.MeshBasicMaterial({
    map: glowTexture, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, fog: false,
    blending: THREE.AdditiveBlending,
  });
  const flare = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), flareMaterial);
  flare.renderOrder = 5;
  scene.add(flare);

  // ---- mist that lies on the water; the bank on the left keeps the copy on calm ground
  const mists: { material: THREE.ShaderMaterial; opacity: number }[] = [];
  const uMistColor = { value: live.color.mist };
  // x, z, width, height, opacity, noise seed, density (how much of the sheet is solid)
  for (const [x, z, width, height, opacity, seed, density] of [
    [-45, -26, 96, 8, 1, 1.3, 0.2], [-52, -46, 120, 13, 1, 4.1, 0.22], [10, -72, 260, 9, 0.7, 7.7, 0],
    [30, -40, 80, 5, 0.5, 2.9, 0], [6, -14, 60, 2.2, 0.35, 5.3, 0],
  ]) {
    const material = new THREE.ShaderMaterial({
      vertexShader: mistVertex, fragmentShader: mistFragment, transparent: true, depthWrite: false, toneMapped: false,
      uniforms: {
        uColor: uMistColor, uGlow, uGlowPower, uSunDir, uOpacity: { value: opacity }, uDensity: { value: density }, uTime,
        uSeed: { value: seed },
      },
    });
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    sheet.position.set(x, height / 2, z);
    scene.add(sheet);
    mists.push({ material, opacity });
  }

  // ---- fireflies over the paddy after dark
  const fireflyMaterial = new THREE.ShaderMaterial({
    vertexShader: fireflyVertex, fragmentShader: fireflyFragment, transparent: true, depthWrite: false, toneMapped: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime, uFocal, uColor: { value: live.color.firefly }, uOpacity: { value: 0 } },
  });
  const fireflies = new THREE.Points(buildFireflies(rand, 36), fireflyMaterial);
  fireflies.frustumCulled = false;
  scene.add(fireflies);

  // ---- egrets crossing by day
  const egretMaterial = new THREE.ShaderMaterial({
    vertexShader: egretVertex, fragmentShader: egretFragment, transparent: true, depthWrite: false, toneMapped: false,
    uniforms: {
      uTime, uFocal, uFogDensity, uHaze, uLane: { value: new THREE.Vector2(118, -5) },
      uColor: { value: live.color.egret }, uOpacity: { value: 0 },
    },
  });
  const egrets = new THREE.Points(buildEgrets(rand, 5), egretMaterial);
  egrets.frustumCulled = false;
  scene.add(egrets);

  // ---- light: the sun behind the bloom for its rim, the sky for fill, and a soft bounce on its face
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.target.position.set(0, SEED_HEIGHT, 0);
  scene.add(sun, sun.target);
  const sky = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
  scene.add(sky);
  const key = new THREE.DirectionalLight(0xffffff, 1);
  key.position.set(-4, 5, 9);
  key.target.position.set(0, SEED_HEIGHT, 0);
  scene.add(key, key.target);

  // ---- the bloom: a water lily on its stem, with pads round its foot and its light in the air
  const flower = createFlower({ uSunDir, uTime, uFocal });
  scene.add(flower.plant, flower.pads, flower.aura, flower.core, flower.motes);
  // A horizontal drag over the bloom turns it; a vertical one still scrolls the page on touch screens.
  renderer.domElement.style.touchAction = 'pan-y';

  // ---------------------------------------------------------------- state

  let disposed = false;
  let started = false;
  let inView = true;
  let frame = 0;
  let lastDraw = 0;
  let idle = 0;
  let clock = 0;
  let motion = 0;
  let quality = 1;
  let load = 1;
  let settled = 0;
  let frameName: FrameName = 'wide';
  let shot = SHOTS.wide;
  let themeMix = 0;
  let themeGoal = 0;
  let staleSky = true;
  let nextDrop = 0;
  let lastDropAt = 0;
  let bloomAt = -10;
  /** Bloom radius on screen, in CSS pixels; a drag is measured against it. */
  let bloomPixels = 200;
  const pointer = { x: 0, y: 0, open: 0, scroll: 0 };
  const eased = { x: 0, y: 0, open: 0, scroll: 0 };
  /**
   * The bloom's turn about its stem and its nod, with their speeds; `rest` is the whole turn it is settling on and
   * `pull` how quickly it gets there. `held` is the drag that has hold of it, if any.
   */
  const turn = { angle: 0, speed: 0, nod: 0, nodSpeed: 0, rest: 0, pull: 3 };
  let held: {
    id: number; x: number; y: number; at: number; lastX: number; lastY: number; lastAt: number; moved: boolean; caught: boolean;
  } | null = null;
  const full = new THREE.Vector2(1, 1);
  const offset = new THREE.Vector2();
  const size = new THREE.Vector2(1, 1);
  const lookAt = new THREE.Vector3();
  const lastDrop = new THREE.Vector3(1e3, 0, 0);
  const hit = new THREE.Vector3();
  const ndc = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

  function isDark() {
    const theme = document.documentElement.dataset.theme;
    return theme === 'dark' || (!theme && scheme.matches);
  }

  /** Write the blended palette into every material, light and uniform that does not already share it. */
  function applyPalette() {
    blend(live, light, dark, themeMix);
    const { color, level } = live;
    fog.color.copy(color.haze);
    fog.density = level.fog;
    uFogDensity.value = level.fog;
    uGlowPower.value = level.glowPower;
    domeMaterial.uniforms.uSunSize.value = level.sunSize;
    domeMaterial.uniforms.uStars.value = level.stars;
    domeMaterial.uniforms.uNight.value = themeMix;
    waterMaterial.uniforms.uReflectMin.value = level.reflectMin;
    bankMaterial.color.setRGB(1, 1, 1).lerp(dark.color.bank, themeMix);
    terraceMaterial.color.setRGB(1, 1, 1).lerp(dark.color.terrace, themeMix);
    // The day plates already carry their own colour and light. Only night needs a tint.
    for (const material of [...groveNear, ...groveFar]) material.color.setRGB(1, 1, 1).lerp(dark.color.grove, themeMix);
    houseMaterial.color.setRGB(1, 1, 1).lerp(dark.color.house, themeMix);
    windowMaterial.color.copy(color.window);
    windowMaterial.opacity = level.windowGlow;
    glowMaterial.color.copy(color.window);
    glowMaterial.opacity = level.windowGlow * 0.5;
    windowPane.visible = windowGlow.visible = level.windowGlow > 0.01;
    flareMaterial.color.copy(color.glow);
    flareMaterial.opacity = level.flare;
    for (const mist of mists) mist.material.uniforms.uOpacity.value = mist.opacity * level.mistOpacity;
    fireflyMaterial.uniforms.uOpacity.value = level.fireflies;
    fireflies.visible = level.fireflies > 0.01;
    egretMaterial.uniforms.uOpacity.value = level.egrets;
    egrets.visible = level.egrets > 0.01;
    sun.color.copy(color.sunLight);
    sun.intensity = level.sunIntensity;
    sky.color.copy(color.hemiSky);
    sky.groundColor.copy(color.hemiGround);
    sky.intensity = level.hemiIntensity;
    key.color.copy(color.key);
    key.intensity = level.keyIntensity;
    renderer.toneMappingExposure = level.exposure;
    flower.setLook({
      env: level.env, light: level.petalGlow, lightCore: color.petalLight, lightBody: color.petalAura,
      translucency: level.translucency, translucent: color.translucent, seedGlow: level.seedGlow, seedLight: color.seedLight,
      lantern: level.lanternIntensity, lanternColor: color.lantern, halo: level.halo, haloColor: color.halo,
      motes: level.motes, moteColor: color.mote,
    });
    uLampColor.value.copy(color.petalAura).lerp(color.lantern, 0.4);
    uLamp.value.w = level.lampReach;
  }

  function refreshSky() {
    staleSky = false;
    domeMaterial.uniforms.uEnv.value = 1;
    const next = pmrem.fromScene(skyScene, 0.035);
    domeMaterial.uniforms.uEnv.value = 0;
    scene.environment = next.texture;
    environment?.dispose();
    environment = next;
  }

  /** The page colour is the top of the sky, so the header above floats on the same morning. */
  function theme() {
    const page = getComputedStyle(host).getPropertyValue('--hero-studio').trim();
    themeGoal = isDark() ? 1 : 0;
    if (page) (themeGoal ? dark : light).color.skyTop.set(page);
    if (reducedMotion || !started) {
      themeMix = themeGoal;
      applyPalette();
      staleSky = true;
    }
    wake();
  }

  function setShot(name: FrameName) {
    frameName = name;
    shot = SHOTS[name];
    // Seen from this camera, the sun rests in the V between the two upper petals.
    uSunDir.value.set(-shot.eye[0], SEED_HEIGHT + SUN_CRADLE - shot.eye[1], -shot.eye[2]).normalize();
    // A light straight behind the bloom would leave it rimless, so the lamp stands higher and to the left.
    const sunAz = Math.atan2(uSunDir.value.x, -uSunDir.value.z);
    domeMaterial.uniforms.uSunAngles.value.set(THREE.MathUtils.radToDeg(sunAz), THREE.MathUtils.radToDeg(Math.asin(uSunDir.value.y)));
    const az = sunAz - THREE.MathUtils.degToRad(26);
    const el = THREE.MathUtils.degToRad(26);
    sun.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(40).add(sun.target.position);
    // The main summit is at 63% across, 45.6% above the bottom of the separate plate.
    domeMaterial.uniforms.uMountainAngles.value.set(shot.peakAz - 9.36, shot.peakEl / 0.456);
    riceMaterial.uniforms.uLeftEdge.value = shot.leftEdge;
    camera.fov = mirror.fov = shot.fov;
    staleSky = true;
  }

  function layout() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height || disposed) return;
    const name: FrameName = wideQuery.matches ? 'wide' : 'tall';
    if (name !== frameName || !started) setShot(name);
    const frameShape = FRAMES[name];
    // Sharp enough, never wasteful: at most 1.5 device pixels and about two million of them.
    const ratio = Math.max(0.75, Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(2e6 / (width * height)))) * quality;
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    reflection.setSize(Math.max(2, Math.round(width * ratio * 0.6)), Math.max(2, Math.round(height * ratio * 0.6)));
    // Crop the base frame exactly as object-fit: cover crops the poster.
    if (width / height < frameShape.aspect) full.set(height * frameShape.aspect, height);
    else full.set(width, width / frameShape.aspect);
    offset.set((full.x - width) * frameShape.anchorX, (full.y - height) * frameShape.anchorY);
    size.set(width, height);
    uFocal.value = (full.y * ratio) / (2 * Math.tan(THREE.MathUtils.degToRad(shot.fov) / 2));
    // The petals reach about a metre from the seed; that is how far a drag must go to turn it by TURN_PER_RADIUS.
    bloomPixels = uFocal.value / ratio / Math.hypot(shot.eye[0], shot.eye[1] - SEED_HEIGHT, shot.eye[2]);
    refresh();
  }

  function placeCameras() {
    const [ex, ey, ez] = shot.eye;
    const [lx, ly, lz] = shot.look;
    // Translate the eye and its target together. Turning the camera would sweep the sky and stars
    // across the frame; a tiny parallel slide keeps them at infinity while nearer objects shift more.
    const slideX = eased.x * 0.055;
    const slideY = -eased.y * 0.025 + eased.scroll * 0.18;
    camera.position.set(ex + slideX, ey + slideY, ez);
    lookAt.set(lx + slideX, ly + slideY, lz);
    camera.lookAt(lookAt);
    camera.setViewOffset(full.x, full.y, offset.x, offset.y, size.x, size.y);
    camera.updateMatrixWorld();
    dome.position.copy(camera.position);
    flare.position.copy(uSunDir.value).multiplyScalar(7.3).add(camera.position);
    flare.quaternion.copy(camera.quaternion);
    // The mirrored camera is upside down, which also swaps left and right; mirror its crop to match.
    mirror.position.set(camera.position.x, -camera.position.y, camera.position.z);
    mirror.lookAt(lookAt.x, -lookAt.y, lookAt.z);
    mirror.setViewOffset(full.x, full.y, full.x - offset.x - size.x, offset.y, size.x, size.y);
    mirror.updateMatrixWorld();
    textureMatrix.copy(bias).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);
  }

  /** It turns a little toward the pointer, as if it had noticed. */
  const facing = () => eased.x * 0.22;

  /**
   * Let the bloom go at this speed. It glides on to wherever it would have stopped, rounded to a whole turn so it
   * comes to rest facing the light again, and lands there without overshooting or swinging back.
   */
  function letGo(speed: number) {
    const glide = turn.angle + speed / 1.4;
    turn.rest = Math.round((glide - facing()) / TAU);
    const distance = turn.rest * TAU + facing() - turn.angle;
    turn.speed = speed;
    turn.pull = Math.sign(distance) === Math.sign(speed) && Math.abs(distance) > 0.05
      ? clamp(Math.abs(speed) / Math.abs(distance), 2.4, 6) : 3;
  }

  /** Advance the bloom's turn and nod: a critically damped spring toward the resting turn and the pointer. */
  function spin(elapsed: number) {
    if (held) return;
    const target = turn.rest * TAU + facing();
    turn.speed += (turn.pull * turn.pull * (target - turn.angle) - 2 * turn.pull * turn.speed) * elapsed;
    turn.angle += turn.speed * elapsed;
    turn.nodSpeed += (-18 * (turn.nod - eased.y * 0.08) - 7 * turn.nodSpeed) * elapsed;
    turn.nod += turn.nodSpeed * elapsed;
    // Keep the numbers small after many turns; only whole turns are removed, so nothing moves.
    if (Math.abs(turn.rest) > 4) {
      turn.angle -= turn.rest * TAU;
      turn.rest = 0;
    }
  }

  function pose() {
    // The petals open for the pointer, and once in greeting (or at a touch), with a swell of light; then home again.
    const since = (clock - bloomAt) / 1.7;
    const greeting = since > 0 && since < 1 ? Math.sin(Math.PI * since) ** 2 : 0;
    flower.pose({
      time: clock, motion, spin: turn.angle, nod: turn.nod, open: Math.max(eased.open, greeting), pulse: greeting,
    }, camera);
    uLamp.value.set(flower.seed.x, flower.seed.y, flower.seed.z, live.level.lampReach);
    riceMaterial.uniforms.uSway.value = motion;
    uTime.value = clock;
  }

  function draw() {
    if (disposed || !started) return;
    if (staleSky) refreshSky();
    placeCameras();
    pose();
    // The mirror pass: everything but the water itself, seen from below. Ripples draw mirrored stars into
    // streaks, so the water keeps only a hint of them.
    water.visible = flare.visible = false;
    domeMaterial.uniforms.uStars.value = live.level.stars * 0.3;
    renderer.setRenderTarget(reflection);
    renderer.render(scene, mirror);
    renderer.setRenderTarget(null);
    domeMaterial.uniforms.uStars.value = live.level.stars;
    water.visible = flare.visible = true;
    renderer.render(scene, camera);
  }

  const running = () => started && !disposed && inView && !document.hidden && !reducedMotion;

  function tick(now: number) {
    frame = 0;
    if (!running()) return;
    frame = requestAnimationFrame(tick);
    const elapsed = Math.min((now - lastDraw) / 1000, 0.1);
    const shifting = themeMix !== themeGoal;
    const turning = held !== null || Math.abs(turn.speed) > 0.02 || Math.abs(turn.nodSpeed) > 0.02;
    idle += elapsed;
    // With nothing to react to, thirty frames a second carry the water and the breeze.
    const budget = idle > 1.5 && !shifting && !turning ? 1 / 30 : 1 / 60;
    if (elapsed < budget - 0.004) { idle -= elapsed; return; }
    lastDraw = now;
    clock += elapsed;
    motion = Math.min(1, motion + elapsed / 1.2);
    const ease = 1 - Math.exp(-elapsed * 5);
    eased.x += (pointer.x - eased.x) * ease;
    eased.y += (pointer.y - eased.y) * ease;
    eased.open += (pointer.open - eased.open) * ease;
    eased.scroll += (pointer.scroll - eased.scroll) * ease;
    spin(elapsed);
    if (shifting) {
      const before = themeMix;
      themeMix = themeGoal > themeMix ? Math.min(themeGoal, themeMix + elapsed / 0.5) : Math.max(themeGoal, themeMix - elapsed / 0.5);
      applyPalette();
      // The bloom's reflections follow the sky: once halfway through the change and once at its end.
      if (themeMix === themeGoal || (before - 0.5) * (themeMix - 0.5) < 0) staleSky = true;
    }
    draw();
    // A device that cannot keep up gets fewer pixels, twice at most.
    load = load * 0.92 + (elapsed / budget) * 0.08;
    if (++settled > 90 && load > 1.5 && quality > 0.65) {
      quality *= 0.8;
      settled = 0;
      load = 1;
      layout();
    }
  }

  function wake() {
    if (disposed || !started) return;
    if (reducedMotion) { draw(); return; }
    if (!frame && running()) {
      lastDraw = performance.now();
      frame = requestAnimationFrame(tick);
    }
  }

  /** Draw now when nothing else will: under reduced motion, or while the loop is paused. */
  function refresh() {
    if (!started) return;
    if (reducedMotion || !running()) draw();
    else wake();
  }

  function ring(x: number, z: number, strength: number) {
    waterMaterial.uniforms.uDrops.value[nextDrop].set(x, z, clock, strength);
    nextDrop = (nextDrop + 1) % 3;
    lastDropAt = clock;
    lastDrop.set(x, 0, z);
  }

  /** Cast the pointer into the scene: how near it passes to the seed, and where it meets the water (in hit). */
  function aim(event: PointerEvent) {
    const stage = host.getBoundingClientRect();
    ndc.set(((event.clientX - stage.left) / stage.width) * 2 - 1, 1 - ((event.clientY - stage.top) / stage.height) * 2);
    raycaster.setFromCamera(ndc, camera);
    const { origin, direction } = raycaster.ray;
    const reach = direction.y < -0.01 ? -origin.y / direction.y : Infinity;
    if (reach < 60) hit.copy(direction).multiplyScalar(reach).add(origin);
    return { near: raycaster.ray.distanceToPoint(flower.seed), onWater: reach < 60 };
  }

  /** Turn the held bloom with the pointer: across for its stem, up and down for a nod. */
  function drag(event: PointerEvent) {
    if (!held) return;
    const dx = event.clientX - held.lastX;
    const dy = event.clientY - held.lastY;
    const seconds = Math.max((event.timeStamp - held.lastAt) / 1000, 1 / 240);
    if (!held.moved && Math.hypot(event.clientX - held.x, event.clientY - held.y) > 5) held.moved = true;
    if (held.moved) {
      const step = (dx / bloomPixels) * TURN_PER_RADIUS;
      turn.angle += step;
      turn.nod = clamp(turn.nod + (dy / bloomPixels) * TURN_PER_RADIUS * 0.6, -0.5, 0.5);
      // How fast it was turning, so letting go can throw it.
      turn.speed = turn.speed * 0.5 + (step / seconds) * 0.5;
      turn.nodSpeed = 0;
    }
    held.lastX = event.clientX;
    held.lastY = event.clientY;
    held.lastAt = event.timeStamp;
    idle = 0;
    wake();
  }

  function onPointerMove(event: PointerEvent) {
    if (held && event.pointerId === held.id) {
      drag(event);
      return;
    }
    if (event.pointerType === 'touch') return;
    const area = zone.getBoundingClientRect();
    pointer.x = clamp(((event.clientX - area.left) / area.width - 0.5) * 2, -1, 1);
    pointer.y = clamp(((event.clientY - area.top) / area.height - 0.5) * 2, -1, 1);
    // Near the bloom the petals open and it can be taken hold of; over the water the pointer leaves a ring.
    const { near, onWater } = aim(event);
    pointer.open = 1 - THREE.MathUtils.smoothstep(near, 0.9, 2.3);
    renderer.domElement.style.cursor = near < GRASP ? 'grab' : '';
    if (onWater && near >= GRASP && clock - lastDropAt > 0.35 && hit.distanceTo(lastDrop) > 0.7) ring(hit.x, hit.z, 1);
    idle = 0;
    wake();
  }

  /** A press on the bloom takes hold of it; a press elsewhere on the water leaves a ring. */
  function onPointerDown(event: PointerEvent) {
    if (held) return;
    const { near, onWater } = aim(event);
    if (near < GRASP && event.target instanceof Node && host.contains(event.target)) {
      held = {
        id: event.pointerId, x: event.clientX, y: event.clientY, at: event.timeStamp, lastX: event.clientX, lastY: event.clientY,
        lastAt: event.timeStamp, moved: false, caught: Math.abs(turn.speed) > 1,
      };
      // Keep the drag even when the pointer leaves the canvas; without capture it still works inside it.
      try { renderer.domElement.setPointerCapture(event.pointerId); } catch { /* not an active pointer */ }
      renderer.domElement.style.cursor = 'grabbing';
      // No text selection or image drag while the bloom is held; catching a spinning bloom stops it.
      event.preventDefault();
      turn.speed = 0;
      turn.nodSpeed = 0;
    } else if (onWater) ring(hit.x, hit.z, 1.3);
    idle = 0;
    wake();
  }

  function release() {
    if (!held) return;
    const { id } = held;
    held = null;
    if (renderer.domElement.hasPointerCapture(id)) renderer.domElement.releasePointerCapture(id);
  }

  /** Letting go throws the bloom if it was dragged; a short press that did not move is a tap, and the bloom answers it. */
  function onPointerUp(event: PointerEvent) {
    if (!held || event.pointerId !== held.id) return;
    const { moved, caught, at, lastAt } = held;
    release();
    renderer.domElement.style.cursor = event.pointerType === 'mouse' ? 'grab' : '';
    if (moved) {
      // A drag that came to rest before letting go is set down, not thrown.
      letGo(event.timeStamp - lastAt > 90 ? 0 : clamp(turn.speed, -18, 18));
    } else if (!caught && event.timeStamp - at < 500) {
      // It greets, sends a ring across the water and turns once on its stem.
      bloomAt = clock;
      ring(0.02, 0, 1);
      letGo(9);
    } else {
      letGo(0);
    }
    idle = 0;
    wake();
  }

  function onPointerCancel(event: PointerEvent) {
    if (!held || event.pointerId !== held.id) return;
    release();
    renderer.domElement.style.cursor = '';
    letGo(0);
    wake();
  }

  function onPointerLeave() {
    pointer.x = pointer.y = pointer.open = 0;
    idle = 0;
    wake();
  }

  function onScroll() {
    pointer.scroll = clamp(window.scrollY / Math.max(zone.offsetHeight, 1), 0, 1);
    idle = 0;
    wake();
  }

  const resized = new ResizeObserver(layout);
  resized.observe(host);
  const visible = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (inView) refresh();
    else { cancelAnimationFrame(frame); frame = 0; }
  });
  visible.observe(host);
  const themed = new MutationObserver(theme);
  themed.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  scheme.addEventListener('change', theme);
  wideQuery.addEventListener('change', layout);
  document.addEventListener('visibilitychange', refresh);
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);
  if (!reducedMotion) {
    zone.addEventListener('pointermove', onPointerMove);
    zone.addEventListener('pointerleave', onPointerLeave);
    zone.addEventListener('pointerdown', onPointerDown);
    zone.addEventListener('pointerup', onPointerUp);
    zone.addEventListener('pointercancel', onPointerCancel);
    renderer.domElement.addEventListener('lostpointercapture', onPointerCancel);
    window.addEventListener('scroll', onScroll, { passive: true });
  }
  theme();
  layout();

  const ready = (async () => {
    // The bloom is built in code; only the photographic plates of the land come over the network.
    let landscape: Awaited<ReturnType<typeof loadLandscapeTextures>>;
    try {
      landscape = await loadLandscapeTextures(controller.signal);
    } catch (error) {
      if (disposed) return;
      throw error;
    }
    if (disposed) {
      disposeLandscapeTextures(landscape);
      return;
    }
    const { sky: skyTexture, mountains, palms, house, terraces } = landscape;
    domeMaterial.uniforms.tSky.value = skyTexture;
    domeMaterial.uniforms.tMountains.value = mountains;
    for (const material of [...groveNear, ...groveFar]) { material.map = palms; material.needsUpdate = true; }
    houseMaterial.map = house;
    houseMaterial.needsUpdate = true;
    terraceMaterial.map = bankMaterial.map = terraces;
    terraceMaterial.needsUpdate = bankMaterial.needsUpdate = true;
    applyPalette();
    refreshSky();
    placeCameras();
    await renderer.compileAsync(scene, camera);
    if (disposed) return;
    started = true;
    // A greeting once the scene is live: the petals open once in a swell of light and a ring leaves the stem.
    if (!reducedMotion) {
      bloomAt = 0.25;
      ring(0.02, 0, 1);
    }
    layout();
    draw();
    wake();
  })();

  return {
    ready,
    dispose() {
      if (disposed) return;
      disposed = true;
      controller.abort();
      cancelAnimationFrame(frame);
      resized.disconnect();
      visible.disconnect();
      themed.disconnect();
      scheme.removeEventListener('change', theme);
      wideQuery.removeEventListener('change', layout);
      document.removeEventListener('visibilitychange', refresh);
      zone.removeEventListener('pointermove', onPointerMove);
      zone.removeEventListener('pointerleave', onPointerLeave);
      zone.removeEventListener('pointerdown', onPointerDown);
      zone.removeEventListener('pointerup', onPointerUp);
      zone.removeEventListener('pointercancel', onPointerCancel);
      renderer.domElement.removeEventListener('lostpointercapture', onPointerCancel);
      window.removeEventListener('scroll', onScroll);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      disposeTree(scene, skyScene);
      reflection.dispose();
      environment?.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
