// Silhouettes for the far bank, drawn once into canvases: coconut palms, undergrowth and a family house.
// They are white on clear, so the scene can tint them for day or night and let the mist take them.

export type Rand = () => number;

/** A small seeded generator, so the grove is the same on every visit and in the poster. */
export function seeded(seed: number): Rand {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(width: number, height: number) {
  const node = document.createElement('canvas');
  node.width = width;
  node.height = height;
  const ctx = node.getContext('2d');
  if (!ctx) throw new Error('Canvas drawing is unavailable.');
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  return { node, ctx };
}

/** One frond: a drooping midrib with leaflets hanging from both sides. */
function frond(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, length: number, droop: number, rand: Rand) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const mx = x + c * length * 0.55;
  const my = y + s * length * 0.55 - length * 0.12;
  const ex = x + c * length;
  const ey = y + s * length * 0.7 + length * droop;
  ctx.lineWidth = Math.max(1, length * 0.02);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(mx, my, ex, ey);
  ctx.stroke();

  const steps = Math.max(12, Math.round(length / 4));
  ctx.lineWidth = Math.max(0.9, length * 0.011);
  ctx.beginPath();
  for (let i = 2; i <= steps; i++) {
    const t = i / steps;
    const k = 1 - t;
    const bx = k * k * x + 2 * k * t * mx + t * t * ex;
    const by = k * k * y + 2 * k * t * my + t * t * ey;
    let tx = 2 * k * (mx - x) + 2 * t * (ex - mx);
    let ty = 2 * k * (my - y) + 2 * t * (ey - my);
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const leaf = length * 0.3 * Math.sin(Math.PI * t ** 0.75) * (0.8 + rand() * 0.3);
    for (const side of [-1, 1]) {
      let lx = -ty * side * 0.75 + tx * 0.35;
      let ly = tx * side * 0.75 + ty * 0.35 + 0.5;
      const ll = Math.hypot(lx, ly) || 1;
      lx /= ll;
      ly /= ll;
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + lx * leaf, by + ly * leaf);
    }
  }
  ctx.stroke();
}

function palm(ctx: CanvasRenderingContext2D, x: number, ground: number, height: number, lean: number, rand: Rand) {
  const topX = x + lean * height;
  const topY = ground - height;
  const bendX = x + lean * height * 0.2;
  const bendY = ground - height * 0.55;
  // The trunk tapers from the foot to the crown.
  const base = height * 0.022;
  const tip = height * 0.012;
  ctx.beginPath();
  ctx.moveTo(x - base, ground);
  ctx.quadraticCurveTo(bendX - base * 0.8, bendY, topX - tip, topY);
  ctx.lineTo(topX + tip, topY);
  ctx.quadraticCurveTo(bendX + base * 0.8, bendY, x + base, ground);
  ctx.closePath();
  ctx.fill();

  const fronds = 11 + Math.floor(rand() * 3);
  for (let i = 0; i < fronds; i++) {
    const spread = i / (fronds - 1);
    const angle = -Math.PI * (-0.12 + 1.24 * spread) + (rand() - 0.5) * 0.22;
    const sideways = Math.abs(Math.cos(angle));
    const length = height * (0.3 + rand() * 0.1) * (0.82 + 0.18 * sideways);
    frond(ctx, topX, topY, angle, length, 0.12 + 0.5 * sideways * sideways + rand() * 0.08, rand);
  }
  // Coconuts under the crown.
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(topX + (rand() - 0.5) * height * 0.035, topY + height * (0.015 + rand() * 0.02), height * 0.012, 0, Math.PI * 2);
    ctx.fill();
  }
}

function undergrowth(ctx: CanvasRenderingContext2D, from: number, to: number, ground: number, height: number, rand: Rand) {
  for (let x = from; x < to; x += height * (0.25 + rand() * 0.3)) {
    const r = height * (0.35 + rand() * 0.65);
    ctx.beginPath();
    ctx.ellipse(x, ground - r * 0.45, r * (0.9 + rand() * 0.5), r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export interface GroveOptions {
  seed: number;
  /** canvas size in pixels */
  width: number;
  height: number;
  /** how many palms, and how tall the tallest is as a share of the canvas height */
  palms: number;
  tallest: number;
  /** blur in pixels: far groves sit outside the depth of field */
  blur: number;
}

export function paintGrove({ seed, width, height, palms, tallest, blur }: GroveOptions) {
  const { node, ctx } = canvas(width, height);
  const rand = seeded(seed);
  if (blur > 0 && 'filter' in ctx) ctx.filter = `blur(${blur}px)`;
  const ground = height * 0.97;
  undergrowth(ctx, width * 0.08, width * 0.92, ground, height * 0.13, rand);
  for (let i = 0; i < palms; i++) {
    const x = width * (0.16 + (0.68 * (i + 0.5 + (rand() - 0.5) * 0.7)) / palms);
    const tall = height * tallest * (0.62 + rand() * 0.38);
    palm(ctx, x, ground, tall, (rand() - 0.5) * 0.3, rand);
  }
  return node;
}

/** A joglo: the steep crown of the roof over its wide skirt, on a low veranda. */
export function paintHouse(blur: number) {
  const { node, ctx } = canvas(256, 160);
  if (blur > 0 && 'filter' in ctx) ctx.filter = `blur(${blur}px)`;
  const w = node.width;
  const h = node.height;
  const shape = (points: [number, number][]) => {
    ctx.beginPath();
    points.forEach(([px, py], i) => (i ? ctx.lineTo(px * w, py * h) : ctx.moveTo(px * w, py * h)));
    ctx.closePath();
    ctx.fill();
  };
  shape([[0.42, 0.1], [0.58, 0.1], [0.67, 0.4], [0.33, 0.4]]);
  shape([[0.31, 0.38], [0.69, 0.38], [0.94, 0.64], [0.06, 0.64]]);
  shape([[0.16, 0.62], [0.84, 0.62], [0.84, 0.94], [0.16, 0.94]]);
  shape([[0.04, 0.9], [0.96, 0.9], [0.96, 0.97], [0.04, 0.97]]);
  return node;
}

/** A soft round glow, for the lamp in the window after dark. */
export function paintGlow() {
  const { node, ctx } = canvas(64, 64);
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.35)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return node;
}
