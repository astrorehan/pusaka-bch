// The bloom in the paddy: a water lily grown from the logo. Four petals on the diagonals hold the seed;
// the seed is a lamp, and the petals are thin enough for it, and for the sun behind them, to shine through.
// Every part is built here from numbers, so there is no model to download and each part can move on its own.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seeded, type Rand } from './sawahPaint';
import {
  haloFragment, haloVertex, moteFragment, moteVertex, petalColor, petalFragmentPars, petalLight, petalVertexMain,
  petalVertexPars,
} from './sawahShaders';

/** The seed of the bloom, in metres above the water. */
export const SEED_HEIGHT = 1.32;
/** How near the pointer's ray must pass to the seed, in metres, to take hold of the bloom. */
export const GRASP = 1.25;
/** Where the stem meets the back of the head, in the plant's own space. */
const NECK = new THREE.Vector3(0, SEED_HEIGHT - 0.12, -0.17);
/** The petals rise from a ring this far from the seed's centre, as in the logo. */
const PETAL_GAP = 0.13;
/** At rest the petals lean toward the viewer by this much (radians); near the pointer they open toward flat. */
const LEAN_REST = 0.32;
const LEAN_OPEN = 0.18;
/** The petals in the order the logo blooms: clockwise from the top right. */
const ARMS = [-45, -135, 135, 45].map((deg) => THREE.MathUtils.degToRad(deg));
const smoothstep = THREE.MathUtils.smoothstep;

// ---------------------------------------------------------------- geometry

interface LeafShape {
  length: number;
  width: number;
  /** how far the margins rise toward the face, as a share of the width */
  cup: number;
  /** forward bow along the length, as a share of the length; the tip then turns back by `recurve` */
  arch: number;
  recurve: number;
  /** a slight wave in the margin */
  ruffle: number;
  /** turn about the midrib from claw to tip, radians */
  twist: number;
  /** 0 keeps the tip round like the logo; 1 draws it to a soft point */
  point: number;
  rows: number;
  columns: number;
  phase: number;
}

/** A petal or sepal: one curved sheet, its face toward +z, from the claw at the origin up +y to the tip. */
function buildLeaf(shape: LeafShape) {
  const { length, width, rows, columns } = shape;
  const position: number[] = [];
  const petal: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    // An ellipse like the logo's petal, a little narrower at the claw and drawn to a soft point at the tip.
    let half = (width / 2) * (4 * t * (1 - t)) ** 0.55;
    half *= (1 - 0.3 * (1 - smoothstep(t, 0, 0.35))) * (1 - shape.point * smoothstep(t, 0.62, 1) * 0.3);
    half = Math.max(half, width * 0.04 * (1 - t));
    const bow = length * (shape.arch * t * t - shape.recurve * t ** 4);
    const turn = shape.twist * t;
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    for (let j = 0; j <= columns; j++) {
      const s = (j / columns) * 2 - 1;
      const x = s * half;
      const z = bow
        + shape.cup * width * s * s * (0.25 + 0.75 * Math.sin(Math.PI * Math.min(1, t * 1.15)))
        - 0.008 * (1 - smoothstep(Math.abs(s), 0, 0.3)) * Math.sin(Math.PI * t)
        + shape.ruffle * width * Math.abs(s) ** 3 * Math.sin(t * 13 + s * 2.3 + shape.phase) * Math.sin(Math.PI * t);
      position.push(x * cos - z * sin, t * length, x * sin + z * cos);
      petal.push(t, s);
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < columns; j++) {
      const a = i * (columns + 1) + j;
      const b = a + columns + 1;
      index.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('aPetal', new THREE.Float32BufferAttribute(petal, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** Paint a geometry one colour per vertex, so it can share a material that reads vertex colours. */
function paint(geometry: THREE.BufferGeometry, pick: (x: number, y: number, z: number) => THREE.Color) {
  const position = geometry.attributes.position;
  const color = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const c = pick(position.getX(i), position.getY(i), position.getZ(i));
    color.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  return geometry;
}

/** A living stem: thick and dark at the water, slimmer and fresher under the head, bending back into it. */
function buildStem() {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.03, 0.38, -0.02), new THREE.Vector3(-0.018, 0.78, -0.07),
    new THREE.Vector3(0.006, 1.04, -0.14), NECK.clone(),
  ], false, 'centripetal');
  const tubular = 64;
  const radial = 10;
  const geometry = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
  const position = geometry.attributes.position;
  const point = new THREE.Vector3();
  const low = new THREE.Color('#3B5A2B');
  const high = new THREE.Color('#79A24C');
  const shade = new THREE.Color();
  const color = new Float32Array(position.count * 3);
  for (let i = 0; i <= tubular; i++) {
    const u = i / tubular;
    curve.getPointAt(u, point);
    const radius = THREE.MathUtils.lerp(0.032, 0.021, u);
    shade.lerpColors(low, high, smoothstep(u, 0, 0.75));
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      position.setXYZ(
        k,
        point.x + (position.getX(k) - point.x) * radius,
        point.y + (position.getY(k) - point.y) * radius,
        point.z + (position.getZ(k) - point.z) * radius,
      );
      color.set([shade.r, shade.g, shade.b], k * 3);
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  return geometry;
}

/** The stamens round the seed: fine filaments with glowing anthers, leaning out toward the petals. */
function buildStamens(rand: Rand) {
  const reach = 0.16;
  const filament = new THREE.CylinderGeometry(0.005, 0.007, reach, 5, 1);
  filament.translate(0, reach / 2, 0);
  const anther = new THREE.SphereGeometry(0.019, 8, 6);
  anther.scale(1, 1.6, 1);
  anther.translate(0, reach, 0);
  const pale = new THREE.Color('#F6DFA0');
  const ripe = new THREE.Color('#FFC14D');
  paint(filament, () => pale);
  paint(anther, () => ripe);
  const geometry = mergeGeometries([filament, anther]);
  filament.dispose();
  anther.dispose();
  const count = 22;
  const matrices: THREE.Matrix4[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.18;
    const lean = THREE.MathUtils.degToRad(26 + rand() * 18);
    dir.set(Math.cos(a) * Math.cos(lean), Math.sin(a) * Math.cos(lean), Math.sin(lean)).normalize();
    turn.setFromUnitVectors(up, dir);
    matrices.push(new THREE.Matrix4().compose(
      new THREE.Vector3(Math.cos(a) * 0.07, Math.sin(a) * 0.07, -0.02), turn, new THREE.Vector3().setScalar(0.9 + rand() * 0.25),
    ));
  }
  return { geometry, matrices };
}

/** A floating pad with its notch, its rim turned up a little; red underneath, as a water lily's is. */
function buildPad(radius: number, rand: Rand) {
  const rings = 7;
  const spokes = 44;
  const notch = 0.42;
  const position: number[] = [];
  const index: number[] = [];
  const color: number[] = [];
  const top = new THREE.Color('#4C7E37');
  const vein = new THREE.Color('#6C9A49');
  const rim = new THREE.Color('#7B4030');
  const c = new THREE.Color();
  const wobble = rand() * 10;
  for (let i = 0; i <= rings; i++) {
    const r = (i / rings) * radius;
    for (let j = 0; j <= spokes; j++) {
      const a = notch / 2 + (j / spokes) * (Math.PI * 2 - notch);
      const edge = r / radius;
      const lift = 0.022 * edge ** 6 + 0.006 * Math.sin(a * 5 + wobble) * edge ** 2;
      position.push(Math.cos(a) * r, lift, Math.sin(a) * r);
      const ribs = Math.abs(Math.sin(a * 9)) ** 12 * (1 - edge) * 0.6;
      c.copy(top).lerp(vein, ribs).lerp(rim, smoothstep(edge, 0.9, 1) * 0.7);
      color.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < spokes; j++) {
      const a = i * (spokes + 1) + j;
      const b = a + spokes + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** Grains of pollen, each with its own place in a slow loop up from the seed. */
function buildMotes(rand: Rand, count: number) {
  const position = new Float32Array(count * 3);
  const seed: number[] = [];
  for (let i = 0; i < count; i++) seed.push(rand(), 0.06 + rand() * 0.07, rand(), 0.03 + rand() * 0.035);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 4));
  return geometry;
}

// ---------------------------------------------------------------- the plant

/** How the bloom looks in the current light. Colours are in the working (linear) space. */
export interface FlowerLook {
  env: number;
  /** the petals' own light, and its colour at the throat and along the veins */
  light: number;
  lightCore: THREE.Color;
  lightBody: THREE.Color;
  /** sun or moon through the petals */
  translucency: number;
  translucent: THREE.Color;
  seedGlow: number;
  seedLight: THREE.Color;
  lantern: number;
  lanternColor: THREE.Color;
  halo: number;
  haloColor: THREE.Color;
  motes: number;
  moteColor: THREE.Color;
}

export interface FlowerPose {
  time: number;
  /** 0 is the resting pose of the poster; 1 once the scene is alive */
  motion: number;
  /** turn about the stem, and nod about the viewer's horizontal, in radians */
  spin: number;
  nod: number;
  /** 0 to 1: how far the petals open for the pointer or a greeting */
  open: number;
  /** 0 to 1: the extra light of a greeting */
  pulse: number;
}

export function createFlower(shared: { uSunDir: { value: THREE.Vector3 }; uTime: { value: number }; uFocal: { value: number } }) {
  const rand = seeded(1307);
  const plant = new THREE.Group();
  const twirl = new THREE.Group();
  const neck = new THREE.Group();
  const head = new THREE.Group();
  plant.add(twirl);
  twirl.add(neck);
  neck.add(head);
  neck.position.copy(NECK);
  head.position.set(-NECK.x, SEED_HEIGHT - NECK.y, -NECK.z);

  // ---- materials
  // A blue water lily, the paddy's own flower: white at the throat, blue-violet toward the tips, green outside.
  const petalUniforms = {
    uThroat: { value: new THREE.Color('#FFF6E2') },
    uBody: { value: new THREE.Color('#979BE3') },
    uTip: { value: new THREE.Color('#5355C4') },
    uBackBase: { value: new THREE.Color('#C6D29E') },
    uBackTip: { value: new THREE.Color('#6C6BC4') },
    uLightCore: { value: new THREE.Color() },
    uLightBody: { value: new THREE.Color() },
    uLight: { value: 0 },
    uTransColor: { value: new THREE.Color() },
    uTrans: { value: 0 },
    uSunDir: shared.uSunDir,
  };
  const petalMaterial = new THREE.MeshPhysicalMaterial({
    roughness: 0.5, metalness: 0, specularIntensity: 0.45, sheen: 0.7, sheenRoughness: 0.42,
    sheenColor: new THREE.Color('#EEE8FF'), side: THREE.DoubleSide, fog: false,
  });
  petalMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, petalUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${petalVertexPars}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${petalVertexMain}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${petalFragmentPars}`)
      .replace('#include <color_fragment>', petalColor)
      .replace('#include <emissivemap_fragment>', petalLight);
  };
  petalMaterial.customProgramCacheKey = () => 'pusaka-petal';

  const uBend = { value: new THREE.Vector2() };
  const stemMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.52, fog: false });
  // The breeze bends the stem from its foot; the head rides on its tip (see pose()).
  stemMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uBend = uBend;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uBend;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float rise = clamp(transformed.y / ${NECK.y.toFixed(4)}, 0.0, 1.0);
        transformed.xz += uBend * rise * rise;`);
  };
  stemMaterial.customProgramCacheKey = () => 'pusaka-stem';
  const greenMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide, fog: false });
  const seedMaterial = new THREE.MeshPhysicalMaterial({
    color: '#E6B866', roughness: 0.3, metalness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.18, emissive: '#FFAE3D', fog: false,
  });
  const stamenMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, emissive: '#FFB547', fog: false });
  const padMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.34, side: THREE.DoubleSide, fog: false });
  const materials = [petalMaterial, stemMaterial, greenMaterial, seedMaterial, stamenMaterial, padMaterial];

  // ---- stem, and the green cup behind the head that it carries
  twirl.add(new THREE.Mesh(buildStem(), stemMaterial));
  const cupGreen = new THREE.Color('#5E8B3F');
  const receptacle = new THREE.Mesh(paint(new THREE.SphereGeometry(0.085, 20, 14), () => cupGreen), greenMaterial);
  receptacle.scale.set(1, 1, 1.35);
  receptacle.position.set(0, -0.01, -0.1);
  head.add(receptacle);

  // ---- petals and the sepals behind them
  const petals: { hinge: THREE.Group; order: number }[] = [];
  const sepalBase = new THREE.Color('#557F39');
  const sepalTip = new THREE.Color('#7E8F57');
  ARMS.forEach((angle, order) => {
    const arm = new THREE.Group();
    arm.rotation.z = angle;
    head.add(arm);
    const hinge = new THREE.Group();
    hinge.position.set(0, PETAL_GAP, -0.03);
    hinge.rotation.x = LEAN_REST;
    arm.add(hinge);
    hinge.add(new THREE.Mesh(buildLeaf({
      length: 1.22 * (0.98 + rand() * 0.04), width: 0.7, cup: 0.17, arch: 0.07, recurve: 0.09, ruffle: 0.02,
      twist: (rand() - 0.5) * 0.12, point: 0.55, rows: 28, columns: 14, phase: rand() * 10,
    }), petalMaterial));
    petals.push({ hinge, order });

    const sepalHinge = new THREE.Group();
    sepalHinge.position.set(0, 0.05, -0.11);
    sepalHinge.rotation.x = -0.55;
    arm.add(sepalHinge);
    const sepal = buildLeaf({
      length: 0.5, width: 0.3, cup: 0.12, arch: -0.04, recurve: 0, ruffle: 0, twist: 0, point: 1, rows: 10, columns: 6, phase: 0,
    });
    sepalHinge.add(new THREE.Mesh(paint(sepal, (_x, y) => sepalBase.clone().lerp(sepalTip, y / 0.5)), greenMaterial));
  });

  // ---- the seed and its stamens
  const seed = new THREE.Mesh(new THREE.SphereGeometry(0.11, 40, 28), seedMaterial);
  head.add(seed);
  const stamenParts = buildStamens(rand);
  const stamens = new THREE.InstancedMesh(stamenParts.geometry, stamenMaterial, stamenParts.matrices.length);
  stamenParts.matrices.forEach((matrix, i) => stamens.setMatrixAt(i, matrix));
  head.add(stamens);
  // The seed lights what is near it: the throat of each petal, the stamens, the top of the stem.
  const lantern = new THREE.PointLight(0xffffff, 0, 5, 2);
  lantern.position.set(0, 0, 0.16);
  head.add(lantern);

  // ---- pads on the water round the foot, clear of the lane where the bloom's reflection lies
  const pads = new THREE.Group();
  for (const [x, z, radius, turn] of [[0.62, -0.42, 0.42, 1.2], [-0.58, -0.2, 0.3, 2.7], [0.18, -1.15, 0.26, 4.4]]) {
    const pad = new THREE.Mesh(buildPad(radius, rand), padMaterial);
    pad.position.set(x, 0.012, z);
    pad.rotation.y = turn;
    pads.add(pad);
  }

  // ---- light in the air: an aura behind the bloom, a bright core over the seed, and pollen
  const halo = (tight: number) => new THREE.ShaderMaterial({
    vertexShader: haloVertex, fragmentShader: haloFragment, transparent: true, depthWrite: false, toneMapped: false, fog: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 0 }, uTight: { value: tight } },
  });
  const auraMaterial = halo(5);
  const coreMaterial = halo(10);
  const aura = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), auraMaterial);
  aura.scale.setScalar(3.6);
  const core = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), coreMaterial);
  core.scale.setScalar(0.95);
  const moteMaterial = new THREE.ShaderMaterial({
    vertexShader: moteVertex, fragmentShader: moteFragment, transparent: true, depthWrite: false, toneMapped: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: shared.uTime, uFocal: shared.uFocal, uOrigin: { value: new THREE.Vector3(0, SEED_HEIGHT, 0) }, uWind: { value: 0 },
      uColor: { value: new THREE.Color() }, uOpacity: { value: 0 },
    },
  });
  const motes = new THREE.Points(buildMotes(rand, 26), moteMaterial);
  motes.frustumCulled = false;

  // ---- pose
  let look: FlowerLook | undefined;
  const seedWorld = new THREE.Vector3(0, SEED_HEIGHT, 0);
  const toEye = new THREE.Vector3();
  const tilt = new THREE.Euler();
  const nodAxis = new THREE.Vector3();
  const nodTurn = new THREE.Quaternion();

  function setLook(next: FlowerLook) {
    look = next;
    for (const material of materials) material.envMapIntensity = next.env;
    petalUniforms.uLightCore.value.copy(next.lightCore);
    petalUniforms.uLightBody.value.copy(next.lightBody);
    petalUniforms.uTransColor.value.copy(next.translucent);
    petalUniforms.uTrans.value = next.translucency;
    seedMaterial.emissive.copy(next.seedLight);
    stamenMaterial.emissive.copy(next.seedLight);
    lantern.color.copy(next.lanternColor);
    auraMaterial.uniforms.uColor.value.copy(next.haloColor);
    coreMaterial.uniforms.uColor.value.copy(next.seedLight);
    moteMaterial.uniforms.uColor.value.copy(next.moteColor);
    motes.visible = next.motes > 0.01;
  }

  function pose(p: FlowerPose, camera: THREE.Camera) {
    // The breeze that moves the rice moves the stem too, a little slower for the head it carries.
    const gust = Math.sin(p.time * 1.25 + 0.9) + 0.5 * Math.sin(p.time * 2.1 + 1.53);
    const bendX = 0.042 * gust * p.motion;
    const bendZ = 0.014 * Math.sin(p.time * 0.83 + 0.4) * p.motion;
    twirl.rotation.y = p.spin;
    // The bend is the world's; the stem turns with the twirl, so carry it into the stem's own frame.
    const cos = Math.cos(p.spin);
    const sin = Math.sin(p.spin);
    const bx = bendX * cos - bendZ * sin;
    const bz = bendX * sin + bendZ * cos;
    uBend.value.set(bx, bz);
    neck.position.set(NECK.x + bx, NECK.y, NECK.z + bz);
    // The head follows the tip of the stem, and nods about the viewer's horizontal whichever way it faces.
    tilt.set(Math.atan((2 * bz) / NECK.y), 0, -Math.atan((2 * bx) / NECK.y));
    nodTurn.setFromAxisAngle(nodAxis.set(cos, 0, sin), p.nod);
    neck.quaternion.setFromEuler(tilt).premultiply(nodTurn);
    for (const { hinge, order } of petals) {
      const breath = Math.sin(p.time * 0.9 - order * 0.55) * 0.022;
      const flutter = Math.sin(p.time * 3.3 + order * 1.9) * 0.012 * (0.6 + 0.4 * Math.abs(gust));
      hinge.rotation.x = LEAN_REST - LEAN_OPEN * p.open + (breath + flutter) * p.motion;
    }

    plant.updateMatrixWorld(true);
    seed.getWorldPosition(seedWorld);
    toEye.subVectors(camera.position, seedWorld).normalize();
    aura.position.copy(seedWorld).addScaledVector(toEye, -0.5);
    aura.quaternion.copy(camera.quaternion);
    core.position.copy(seedWorld).addScaledVector(toEye, 0.28);
    core.quaternion.copy(camera.quaternion);
    moteMaterial.uniforms.uOrigin.value.copy(seedWorld);
    moteMaterial.uniforms.uWind.value = 0.35 + bendX * 4;

    if (!look) return;
    // The light breathes slowly, and swells for a greeting.
    const swell = 1 + 0.08 * Math.sin(p.time * 1.1) * p.motion + 0.9 * p.pulse;
    petalUniforms.uLight.value = look.light * swell;
    seedMaterial.emissiveIntensity = look.seedGlow * swell;
    stamenMaterial.emissiveIntensity = look.seedGlow * 0.7 * swell;
    lantern.intensity = look.lantern * swell;
    auraMaterial.uniforms.uOpacity.value = look.halo * swell;
    coreMaterial.uniforms.uOpacity.value = look.halo * 0.55 * swell;
    moteMaterial.uniforms.uOpacity.value = look.motes * (1 + p.pulse);
  }

  return { plant, pads, aura, core, motes, seed: seedWorld, setLook, pose };
}
