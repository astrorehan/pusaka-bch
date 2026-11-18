// GLSL for the paddy at first light: separate sky and mountain plates, mirror water, seedlings and mist.
// Every colour arrives in linear space and leaves through colorspace_fragment, so it matches the page.

const noise = /* glsl */ `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
// Two and three octaves are all this soft a picture needs; integrated graphics pay for every one.
float fbm2(vec2 p) {
  return 0.5 * vnoise(p) + 0.25 * vnoise(p * 2.03 + vec2(17.3, 9.1));
}
float fbm3(vec2 p) {
  return fbm2(p) + 0.125 * vnoise(p * 4.12 + vec2(52.4, 27.6));
}
`;

// ---------------------------------------------------------------- sky, sun and mountains

export const domeVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vDir = world.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

// The backdrop is a function of direction only: azimuth and elevation in degrees. It sits at infinity,
// so it never shifts when the camera slides, and the water mirrors it without extra work.
export const domeFragment = /* glsl */ `
uniform vec3 uSkyTop;
uniform vec3 uSkyMid;
uniform vec3 uSkyLow;
uniform sampler2D tSky;
uniform sampler2D tMountains;
uniform float uLandscapeBlur;
uniform float uNight;
uniform vec2 uMountainAngles;
uniform vec3 uHaze;
uniform vec3 uGlow;
uniform float uGlowPower;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform vec2 uSunAngles;
uniform float uSunSize;
uniform float uStars;
uniform float uTime;
uniform float uEnv;
uniform vec3 uWaterTint;
varying vec3 vDir;
${noise}
const float DEG = 57.29578;

vec3 landscape(vec3 d) {
  float el = asin(clamp(d.y, -1.0, 1.0)) * DEG;
  float az = atan(d.x, -d.z) * DEG;
  float sunAz = uSunAngles.x;
  float sunEl = uSunAngles.y;

  // The photo covers 110 degrees of azimuth and 35 degrees of elevation. Both the
  // visible dome and its environment/reflection use the same directional mapping.
  vec2 skyUv = vec2(clamp(0.5 + az / 110.0, 0.0, 1.0), clamp(el / 35.0, 0.0, 1.0));
  vec3 photograph = texture2D(tSky, skyUv, uLandscapeBlur).rgb;
  float t = clamp(el / 25.0, 0.0, 1.0);
  vec3 night = mix(uSkyLow, uSkyMid, smoothstep(0.0, 0.5, t));
  night = mix(night, uSkyTop, smoothstep(0.35, 1.0, t));
  night += photograph * vec3(0.025, 0.035, 0.07);
  vec3 col = mix(photograph, night, uNight);

  // The glow is wider than it is tall, as a low sun through haze is.
  float ang = length(vec2((az - sunAz) * 0.6, el - sunEl));
  float glow = exp(-ang / 2.6) * 0.85 + exp(-ang / 9.5) * 0.42;
  col = mix(col, uGlow, clamp(glow * uGlowPower, 0.0, 0.92));

  if (uStars > 0.0) {
    vec2 grid = vec2(az, el) * 1.9;
    vec2 id = floor(grid);
    float rnd = hash21(id);
    vec2 spot = (vec2(hash21(id + 3.1), hash21(id + 7.7)) - 0.5) * 0.7;
    float star = (1.0 - smoothstep(0.0, 0.085, length(fract(grid) - 0.5 - spot))) * step(0.7, rnd);
    float twinkle = 0.65 + 0.35 * sin(uTime * (0.8 + rnd * 2.0) + rnd * 40.0);
    col += vec3(0.86, 0.9, 1.0) * star * twinkle * uStars * smoothstep(2.0, 7.0, el) * (0.4 + 0.6 * rnd);
  }

  float sunAng = acos(clamp(dot(d, uSunDir), -1.0, 1.0)) * DEG;
  float disc = 1.0 - smoothstep(uSunSize * 0.82, uSunSize, sunAng) + 0.3 * exp(-sunAng / (uSunSize * 0.9));
  col = mix(col, uSunColor, clamp(disc, 0.0, 1.0) * (1.0 - uEnv));

  // The mountain plate has real alpha above the skyline; the sky remains its own asset.
  vec2 mountainUv = vec2(0.5 + (az - uMountainAngles.x) / 72.0, el / uMountainAngles.y);
  if (mountainUv.x >= 0.0 && mountainUv.x <= 1.0 && mountainUv.y >= 0.0 && mountainUv.y <= 1.0) {
    vec4 terrain = texture2D(tMountains, mountainUv, uLandscapeBlur);
    float edge = smoothstep(0.0, 0.045, mountainUv.x) * (1.0 - smoothstep(0.955, 1.0, mountainUv.x));
    vec3 rock = mix(terrain.rgb, terrain.rgb * vec3(0.06, 0.09, 0.18), uNight);
    rock = mix(rock, uHaze, 0.12 + 0.5 * (1.0 - smoothstep(0.0, 3.0, el)));
    col = mix(col, rock, terrain.a * edge);
  }
  return mix(col, uHaze, 1.0 - smoothstep(0.0, 0.7, el));
}

void main() {
  vec3 d = normalize(vDir);
  float below = step(d.y, 0.0);
  vec3 col = uHaze;
  if (uEnv > 0.5) {
    d.y = abs(d.y);
    col = landscape(d);
    col = mix(col, col * uWaterTint, below);
  } else if (d.y >= 0.0) {
    col = landscape(d);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------- water

export const waterVertex = /* glsl */ `
uniform mat4 uTextureMatrix;
varying vec4 vProj;
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vProj = uTextureMatrix * world;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

// Still paddy water: the mirrored scene, nudged by small ripples. A tilt of the surface moves a reflection
// by twice its angle, and mostly up and down at a low viewpoint, which is what draws reflections into streaks.
export const waterFragment = /* glsl */ `
uniform sampler2D tReflection;
uniform float uTime;
uniform float uFocal;
uniform vec3 uSunDir;
uniform vec3 uGlitter;
uniform vec3 uBody;
uniform float uReflectMin;
uniform vec3 uHaze;
uniform float uFogDensity;
uniform vec3 uStem;
uniform vec4 uDrops[3];
uniform vec4 uLamp;
uniform vec3 uLampColor;
varying vec4 vProj;
varying vec3 vWorld;
${noise}

// A wave fades out once its crests are closer than a few pixels on screen; far water becomes a mirror.
vec2 wave(vec2 p, vec2 dir, float k, float speed, float amp, float pixelsPerMetre) {
  float fade = smoothstep(1.2, 4.5, 6.2832 / k * pixelsPerMetre);
  return dir * (amp * fade * cos(dot(dir, p) * k + uTime * speed));
}

void main() {
  vec3 toCamera = cameraPosition - vWorld;
  float dist = length(toCamera);
  vec3 view = toCamera / dist;
  vec2 p = vWorld.xz;
  float pixelsPerMetre = uFocal * abs(cameraPosition.y) / max(dist * dist, 1.0);

  vec2 warp = vec2(vnoise(p * 0.21 + uTime * 0.05), vnoise(p * 0.21 + 31.7 - uTime * 0.04)) - 0.5;
  vec2 q = p + warp * 1.6;
  float breeze = smoothstep(0.27, 0.66, fbm3(p * 0.035 + vec2(uTime * 0.012, 0.0)));
  vec2 slope = vec2(0.0);
  slope += wave(q, vec2(0.86, 0.51), 1.7, 0.9, 0.0032, pixelsPerMetre);
  slope += wave(q, vec2(-0.42, 0.91), 2.9, 1.3, 0.0024, pixelsPerMetre);
  slope += wave(q, vec2(0.25, 0.97), 5.3, 1.9, 0.0017, pixelsPerMetre);
  slope += wave(q, vec2(-0.91, 0.41), 8.7, 2.6, 0.0011, pixelsPerMetre);
  slope *= mix(0.28, 1.0, breeze);

  // Rings leave the stem where it meets the water.
  vec2 fromStem = p - uStem.xy;
  float r = length(fromStem);
  float ring = cos(r * 6.5 - uTime * 2.3) * exp(-r * 0.55) * smoothstep(0.04, 0.3, r);
  slope += fromStem / max(r, 0.001) * ring * 0.011 * uStem.z;

  // And from wherever the pointer last touched the water.
  for (int i = 0; i < 3; i++) {
    vec4 drop = uDrops[i];
    float age = uTime - drop.z;
    if (drop.w > 0.0 && age > 0.0 && age < 6.0) {
      vec2 fromDrop = p - drop.xy;
      float rd = length(fromDrop);
      float x = rd - age * 1.5;
      float envelope = exp(-x * x * 1.5) * exp(-age * 0.7) * drop.w;
      slope += fromDrop / max(rd, 0.001) * cos(x * 7.0) * envelope * 0.02;
    }
  }

  vec2 uv = vProj.xy / vProj.w;
  uv += vec2(slope.x * 0.7, slope.y * 3.8);
  // Moving water smears what it mirrors; near the viewer a little more.
  float smear = 0.001 + 0.003 * (1.0 - smoothstep(5.0, 40.0, dist)) + 0.6 * length(slope);
  vec3 reflection = texture2D(tReflection, uv).rgb * 0.5
    + texture2D(tReflection, uv + vec2(0.0, smear)).rgb * 0.25
    + texture2D(tReflection, uv - vec2(0.0, smear)).rgb * 0.25;

  float facing = clamp(view.y, 0.0, 1.0);
  float fresnel = mix(uReflectMin, 1.0, pow(1.0 - facing, 5.0));
  vec3 col = mix(uBody, reflection, fresnel);

  // Sun glitter where ripples catch the light.
  vec3 normal = normalize(vec3(-slope.x * 22.0, 1.0, -slope.y * 22.0));
  float sun = max(dot(reflect(-view, normal), uSunDir), 0.0);
  col += uGlitter * (pow(sun, 700.0) * 0.9 + pow(sun, 90.0) * 0.1);

  // After dark the bloom lights the shallow water around its stem, not only its own reflection.
  vec3 toLamp = uLamp.xyz - vWorld;
  col += uLampColor * uLamp.w * 0.32 / (1.0 + dot(toLamp, toLamp) * 1.4);

  float fog = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
  col = mix(col, uHaze, fog);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------- rice seedlings

export const riceVertex = /* glsl */ `
attribute vec3 aRoot;
attribute vec3 aBend;
attribute vec2 aTone;
uniform float uTime;
uniform float uSway;
uniform float uLeftEdge;
varying float vAlong;
varying vec2 vTone;
varying vec3 vWorld;
void main() {
  float along = aBend.z;
  float phase = aRoot.z * 6.2832;
  float wind = sin(uTime * 1.25 + phase + aRoot.x * 0.31 + aRoot.y * 0.17) + 0.5 * sin(uTime * 2.1 + phase * 1.7 + aRoot.y * 0.4);
  float bend = along * along * uSway;
  vec3 pos = position;
  pos.xz += (vec2(0.07, 0.02) * wind + aBend.xy * 0.018 * sin(uTime * 3.1 + phase * 3.0)) * bend;
  pos.y -= 0.02 * abs(wind) * bend;
  // Left of the planted edge the paddy is still open water.
  if (aRoot.x < uLeftEdge) pos = vec3(aRoot.x, -1.0, aRoot.y);
  vec4 world = modelMatrix * vec4(pos, 1.0);
  vWorld = world.xyz;
  vAlong = along;
  vTone = aTone;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const riceFragment = /* glsl */ `
uniform vec3 uBase;
uniform vec3 uTip;
uniform vec3 uBack;
uniform vec3 uSunDir;
uniform vec3 uHaze;
uniform float uFogDensity;
uniform vec4 uLamp;
uniform vec3 uLampColor;
varying float vAlong;
varying vec2 vTone;
varying vec3 vWorld;
void main() {
  vec3 view = vWorld - cameraPosition;
  float dist = length(view);
  view /= dist;
  vec3 col = mix(uBase, uTip, smoothstep(0.0, 0.85, vAlong));
  col *= 0.84 + 0.3 * vTone.x;
  // A leaf folds along its midrib: lighter down the middle, darker at the edges.
  col *= mix(1.08, 0.8, vTone.y * vTone.y);
  // Young leaves glow when the sun is behind them.
  col += uBack * pow(max(dot(view, uSunDir), 0.0), 14.0) * (0.25 + 0.75 * vAlong);
  // The seedlings nearest the bloom catch its light after dark, the tips most.
  vec3 toLamp = uLamp.xyz - vWorld;
  col += uLampColor * uLamp.w * (0.3 + 0.7 * vAlong) / (1.0 + dot(toLamp, toLamp) * 0.9);
  float fog = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
  col = mix(col, uHaze, fog);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------- mist

export const mistVertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const mistFragment = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uGlow;
uniform float uGlowPower;
uniform vec3 uSunDir;
uniform float uOpacity;
uniform float uDensity;
uniform float uTime;
uniform float uSeed;
varying vec2 vUv;
varying vec3 vWorld;
${noise}
void main() {
  float n = fbm3(vec2(vWorld.x * 0.03 + uTime * 0.011 + uSeed, vUv.y * 1.4 + uSeed * 0.37));
  float body = smoothstep(0.24 - uDensity, 0.66 - uDensity, n);
  float rise = pow(1.0 - vUv.y, 1.7);
  float sides = smoothstep(0.0, 0.18, vUv.x) * (1.0 - smoothstep(0.82, 1.0, vUv.x));
  vec3 view = normalize(vWorld - cameraPosition);
  vec3 col = uColor + uGlow * pow(max(dot(view, uSunDir), 0.0), 22.0) * uGlowPower * 0.5;
  gl_FragColor = vec4(col, body * rise * sides * uOpacity);
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------- fireflies

export const fireflyVertex = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform float uFocal;
varying float vGlow;
void main() {
  float t = uTime * aSeed.y + aSeed.x * 6.2832;
  vec3 pos = position + vec3(sin(t * 0.7), sin(t * 1.3 + aSeed.x * 4.0) * 0.45, cos(t * 0.5 + aSeed.x)) * aSeed.z;
  vec4 mv = viewMatrix * modelMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  vGlow = smoothstep(0.15, 0.9, sin(uTime * (0.5 + aSeed.y) + aSeed.x * 30.0) * 0.5 + 0.5);
  gl_PointSize = aSeed.w * uFocal / max(-mv.z, 0.1);
}
`;

export const fireflyFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vGlow;
void main() {
  float r = length(gl_PointCoord - 0.5);
  float core = 1.0 - smoothstep(0.0, 0.5, r);
  gl_FragColor = vec4(uColor * core * core * vGlow * uOpacity, 1.0);
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------- the bloom's petals

// Spliced into MeshPhysicalMaterial, so the petals keep the scene's lights and sky and add a light of their own.
// aPetal is (along, across): 0 at the claw to 1 at the tip, and -1 to 1 from margin to margin.
export const petalVertexPars = /* glsl */ `
attribute vec2 aPetal;
varying vec2 vPetal;
`;

export const petalVertexMain = /* glsl */ `
vPetal = aPetal;
`;

export const petalFragmentPars = /* glsl */ `
varying vec2 vPetal;
uniform vec3 uThroat;
uniform vec3 uBody;
uniform vec3 uTip;
uniform vec3 uBackBase;
uniform vec3 uBackTip;
uniform vec3 uLightCore;
uniform vec3 uLightBody;
uniform float uLight;
uniform vec3 uTransColor;
uniform float uTrans;
uniform vec3 uSunDir;
// Veins fan out from the claw, so each one keeps its place across the petal; they fade toward the tip.
float petalVein(vec2 p) {
  float v = abs(fract(p.y * 4.5 + 0.5) - 0.5) * 2.0;
  return (1.0 - smoothstep(0.0, 0.2, v)) * smoothstep(0.02, 0.15, p.x) * (1.0 - 0.7 * p.x);
}
`;

// The inner face pales to a warm throat round the seed and deepens toward the tip; the outer face is greener.
export const petalColor = /* glsl */ `
float vein = petalVein(vPetal);
vec3 innerFace = mix(uThroat, uBody, smoothstep(0.0, 0.42, vPetal.x));
innerFace = mix(innerFace, uTip, smoothstep(0.4, 1.0, vPetal.x));
vec3 outerFace = mix(uBackBase, uBackTip, smoothstep(0.05, 0.8, vPetal.x));
// The colour gathers a little along the veins and toward the margin.
float margin = smoothstep(0.8, 1.0, abs(vPetal.y)) * smoothstep(0.15, 0.5, vPetal.x);
diffuseColor.rgb = (gl_FrontFacing ? innerFace : outerFace) * (1.0 - 0.17 * vein) * (1.0 - 0.14 * margin);
`;

// What the petal gives off: the sun (or moon) shining through thin tissue, and the seed's glow carried up the veins.
export const petalLight = /* glsl */ `
{
  vec3 toEye = normalize(vViewPosition);
  vec3 toSun = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  float through = max(dot(-toEye, toSun), 0.0);
  float behind = max(dot(-normal, toSun), 0.0);
  // The margins and the tip are thinnest, so they pass the most light; what comes through takes the petal's colour.
  float thin = 0.45 + 0.55 * max(smoothstep(0.5, 1.0, abs(vPetal.y)), smoothstep(0.7, 1.0, vPetal.x));
  vec3 tissue = diffuseColor.rgb * (0.6 + 0.6 * diffuseColor.rgb);
  totalEmissiveRadiance += uTransColor * tissue * thin * uTrans
    * (0.12 * behind + 0.06 * pow(through, 6.0) + 0.9 * pow(through, 240.0));
  float rim = pow(1.0 - abs(dot(normal, toEye)), 3.0);
  float core = exp(-vPetal.x * 3.2);
  totalEmissiveRadiance += (uLightCore * core * 0.55 + uLightBody * ((0.1 + 0.45 * vein) * (1.0 - 0.6 * vPetal.x) + 0.4 * rim)) * uLight;
}
`;

// ---------------------------------------------------------------- the bloom's light

// Pollen that leaves the seed and drifts up on the breeze, each grain in a loop of its own.
export const moteVertex = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform float uFocal;
uniform vec3 uOrigin;
uniform float uWind;
varying float vLife;
varying float vTwinkle;
void main() {
  float life = fract(uTime * aSeed.y + aSeed.x);
  float angle = aSeed.x * 37.0 + life * (aSeed.z - 0.5) * 4.0;
  float radius = (0.1 + aSeed.z * 0.5) * (0.2 + life);
  vec3 pos = uOrigin + vec3(cos(angle) * radius, 0.04 + life * (0.7 + aSeed.z * 0.9), sin(angle) * radius * 0.6);
  pos.x += uWind * life * life;
  vec4 mv = viewMatrix * modelMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSeed.w * uFocal / max(-mv.z, 0.1);
  vLife = life;
  vTwinkle = 0.65 + 0.35 * sin(uTime * (2.0 + aSeed.z * 3.0) + aSeed.x * 50.0);
}
`;

export const moteFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vLife;
varying float vTwinkle;
void main() {
  float r = length(gl_PointCoord - 0.5);
  float core = 1.0 - smoothstep(0.0, 0.5, r);
  float fade = smoothstep(0.0, 0.12, vLife) * (1.0 - smoothstep(0.55, 1.0, vLife));
  gl_FragColor = vec4(uColor * core * core * fade * vTwinkle * uOpacity, 1.0);
  #include <colorspace_fragment>
}
`;

// The light the bloom gives to the air: a soft round glow, drawn in the shader so it never bands.
export const haloVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const haloFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTight;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float glow = (exp(-r * r * uTight) * 0.65 + exp(-r * 3.2) * 0.35) * (1.0 - smoothstep(0.6, 1.0, r));
  gl_FragColor = vec4(uColor * glow * uOpacity, 1.0);
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------- egrets

// A few white egrets cross the paddy on a long lane, as they do at first light. Each is one point,
// drawn as two beating wings and a body.
export const egretVertex = /* glsl */ `
attribute vec3 aSeed;
uniform float uTime;
uniform float uFocal;
uniform float uFogDensity;
uniform vec2 uLane;
varying float vBeat;
varying float vFade;
varying float vFog;
void main() {
  float span = uLane.x - uLane.y;
  float travelled = mod(uLane.x - position.x + uTime * 2.2, span);
  vec3 pos = vec3(uLane.x - travelled, position.y + sin(uTime * 0.35 + aSeed.x * 6.2832) * 0.35, position.z);
  vec4 mv = viewMatrix * modelMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSeed.y * uFocal / max(-mv.z, 0.1);
  vBeat = sin(uTime * 5.5 + aSeed.x * 6.2832);
  // They come out of the haze on the right and are gone before they reach the copy.
  vFade = smoothstep(0.0, 5.0, min(travelled, span - travelled));
  vFog = 1.0 - exp(-pow(length(mv.xyz) * uFogDensity, 2.0));
}
`;

export const egretFragment = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uHaze;
uniform float uOpacity;
varying float vBeat;
varying float vFade;
varying float vFog;
void main() {
  vec2 p = (gl_PointCoord - 0.5) * 2.0;
  float reach = abs(p.x);
  // The wing line rises or falls with the beat and bends at the wrist; it thins toward the tip.
  float line = -0.5 * vBeat * reach + 0.28 * reach * reach;
  float thick = mix(0.13, 0.03, reach);
  float wings = (1.0 - smoothstep(thick * 0.5, thick, abs(p.y - line))) * (1.0 - smoothstep(0.86, 0.96, reach));
  float body = 1.0 - smoothstep(0.7, 1.0, length(vec2((p.x + 0.06) / 0.3, p.y / 0.1)));
  float alpha = max(wings, body) * vFade * uOpacity;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(mix(uColor, uHaze, vFog * 0.75), alpha);
  #include <colorspace_fragment>
}
`;
