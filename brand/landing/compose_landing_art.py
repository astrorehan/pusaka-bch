"""Builds the landing art that is composed rather than generated.

Sources: the hero's photographic plates in brand/hero/landscape-v2/ (sky, mountains, palms, house, terraces, each
with its own alpha) and the generated paddy scene in brand/landing/paddy-scene.png. Writes WebP files to
app/public/landing/:

  footer-terraces.webp (2400 x 800) and -1600, footer-terraces-night.webp and -1600
      The terraces with the sky cut out, so the hills rise from the page. Night: the same picture under moonlight,
      the hut's window lit, fireflies over the paddies.
  steps-frame.webp (1920 x 1080)
      Golden hour over the terraces, soft in the middle where the glass card sits.
  paddy-card.webp (1200 x 800)
      Open water from the paddy scene, no bloom, behind the glass cards on phones.
  mist-a.webp, mist-b.webp (2048 x 1024)
      Soft white cloud banks with alpha that rise over the paddy scene into the night.
  bloom-equal.webp, bloom-custom.webp, bloom-faraid.webp, cta-bloom.webp
      The generated bloom renders (brand/landing/*.png), trimmed to what is visible so the page can size them.

Run from the repository root:  python brand/landing/compose_landing_art.py [--preview DIR]
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
PLATES = ROOT / 'brand' / 'hero' / 'landscape-v2'
OUT = ROOT / 'app' / 'public' / 'landing'


def plate(name: str) -> Image.Image:
    return Image.open(PLATES / f'{name}.png').convert('RGBA')


def scaled(im: Image.Image, s: float) -> Image.Image:
    return im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)


def tone(im: Image.Image, mul: tuple[float, float, float], add: tuple[float, float, float] = (0, 0, 0)) -> Image.Image:
    a = np.asarray(im).astype(np.float32)
    a[..., :3] = np.clip(a[..., :3] * np.array(mul) + np.array(add), 0, 255)
    return Image.fromarray(a.astype(np.uint8), im.mode)


def save_webp(im: Image.Image, name: str, quality: int = 80) -> None:
    path = OUT / name
    im.save(path, 'WEBP', quality=quality, method=6)
    print(f'{name:34s} {im.width}x{im.height}  {path.stat().st_size / 1024:.0f} KB')


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def fractal(w: int, h: int, seed: int, octaves=((4, 2, 1.0), (8, 4, 0.5), (16, 8, 0.25), (32, 16, 0.14), (64, 32, 0.08))) -> np.ndarray:
    """Smooth value noise in 0..1, made of upscaled random grids."""
    rng = np.random.default_rng(seed)
    acc = np.zeros((h, w), np.float32)
    total = 0.0
    for gx, gy, amp in octaves:
        grid = (rng.random((gy, gx)) * 255).astype(np.uint8)
        acc += np.asarray(Image.fromarray(grid).resize((w, h), Image.BICUBIC), np.float32) / 255 * amp
        total += amp
    acc /= total
    return (acc - acc.min()) / (acc.max() - acc.min())


# ---------------------------------------------------------------- footer

FW, FH = 3200, 1067


def footer_day() -> tuple[Image.Image, dict]:
    canvas = Image.new('RGBA', (FW, FH), (0, 0, 0, 0))
    s = FW / 2172

    # The far mountains, lifted so the peak stands about a fifth of the way down.
    mountains = scaled(plate('mountains'), s)
    mountains = tone(mountains, (0.98, 1.0, 1.03))
    canvas.alpha_composite(mountains, (0, -400))

    # The far terraces: the land begins a little above the middle.
    far = scaled(plate('terraces'), s)
    canvas.alpha_composite(far, (0, -290))

    # The hut, on the far terraces between the footer brand (left) and its links (right).
    house = plate('house')
    hs = 230 / house.height
    house = scaled(house, hs)
    hx, hy = round(FW * 0.355 - house.width / 2), 340
    canvas.alpha_composite(house, (hx, hy))

    # Coconut palms at both edges, the right group mirrored.
    palms = plate('palms').crop((0, 0, 1536, 1024))
    ps = 0.62
    palms = scaled(palms, ps)
    canvas.alpha_composite(palms, (-150, 690 - palms.height))
    canvas.alpha_composite(palms.transpose(Image.FLIP_LEFT_RIGHT), (FW - palms.width + 220, 720 - palms.height))

    # The near terraces, larger, mirrored and a little darker, covering the palms' feet and the lower half.
    near = plate('terraces').transpose(Image.FLIP_LEFT_RIGHT)
    near = scaled(near, 2.0)
    near = tone(near, (0.8, 0.84, 0.8))
    nx = (FW - near.width) // 2
    canvas.alpha_composite(near, (nx, FH - near.height + 30))

    # A little sharpening after the upscale.
    rgb = canvas.convert('RGB').filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2))
    out = rgb.convert('RGBA')
    out.putalpha(canvas.getchannel('A'))
    window = (hx + round(962 * hs), hy + round(506 * hs), hx + round(1131 * hs), hy + round(704 * hs))
    return out, {'window': window}


def footer_night(day: Image.Image, info: dict) -> Image.Image:
    a = np.asarray(day).astype(np.float32)
    rgb = a[..., :3] / 255
    lum = rgb @ np.array([0.3, 0.59, 0.11], np.float32)
    # Moonlight: a cool, dim rendering that keeps a little of the greens.
    night = lum[..., None] * np.array([0.30, 0.40, 0.66], np.float32) + rgb * np.array([0.05, 0.09, 0.1], np.float32)
    # The upper land catches a little more moon than the lower.
    h = rgb.shape[0]
    ramp = np.linspace(1.15, 0.78, h, dtype=np.float32)[:, None, None]
    night *= ramp

    # The hut's window, warm, with a soft glow around it.
    x0, y0, x1, y1 = info['window']
    yy, xx = np.mgrid[0:h, 0:rgb.shape[1]].astype(np.float32)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    inside = ((xx >= x0) & (xx <= x1) & (yy >= y0) & (yy <= y1)).astype(np.float32)
    inside = np.asarray(Image.fromarray((inside * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2)), np.float32) / 255
    warm = np.array([1.0, 0.72, 0.36], np.float32)
    night = night * (1 - inside[..., None]) + (warm * (0.55 + 0.45 * lum[..., None])) * inside[..., None]
    d2 = ((xx - cx) ** 2 + (yy - cy) ** 2) / (90.0 ** 2)
    night += np.exp(-d2)[..., None] * warm * 0.22

    # Fireflies over the paddies, kept off the hut.
    rng = np.random.default_rng(7)
    glow = np.zeros((h, rgb.shape[1]), np.float32)
    alpha = a[..., 3]
    placed = 0
    while placed < 70:
        x, y = rng.uniform(40, FW - 40), rng.uniform(FH * 0.36, FH * 0.97)
        if alpha[int(y), int(x)] < 250 or abs(x - cx) < 160 and abs(y - cy) < 160:
            continue
        r = rng.uniform(1.6, 3.4) * (0.7 + 0.6 * (y / FH))
        bright = rng.uniform(0.5, 1.0)
        ys, xs = slice(int(y - r * 6), int(y + r * 6) + 1), slice(int(x - r * 6), int(x + r * 6) + 1)
        gy, gx = yy[ys, xs] - y, xx[ys, xs] - x
        dd = (gx * gx + gy * gy) / (r * r)
        glow[ys, xs] += bright * (np.exp(-dd) + 0.28 * np.exp(-dd / 9))
        placed += 1
    night += np.clip(glow, 0, 1.4)[..., None] * np.array([0.92, 0.96, 0.52], np.float32)

    out = np.dstack([np.clip(night, 0, 1) * 255, alpha]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


# ---------------------------------------------------------------- steps frame

def steps_frame() -> Image.Image:
    W, H = 1920, 1080
    sky = Image.open(PLATES / 'sky-quiet.png').convert('RGB')
    s = H / sky.height * 0.92
    sky = scaled(sky, s)
    canvas = Image.new('RGBA', (W, H))
    canvas.paste(sky.crop(((sky.width - W) // 2, 0, (sky.width - W) // 2 + W, H)), (0, 0))

    ls = 1.25
    mountains = scaled(plate('mountains'), ls)
    canvas.alpha_composite(mountains, ((W - mountains.width) // 2 + 120, H - mountains.height - 210))
    terraces = scaled(plate('terraces'), ls * 1.15)
    canvas.alpha_composite(terraces, ((W - terraces.width) // 2 - 200, H - terraces.height + 40))
    near = scaled(plate('terraces').transpose(Image.FLIP_LEFT_RIGHT), ls * 1.9)
    near = tone(near, (0.82, 0.84, 0.78))
    canvas.alpha_composite(near, ((W - near.width) // 2, H - near.height + 330))

    # One palm framing the right edge, close and out of focus; the rest of the group runs off the frame.
    palms = scaled(plate('palms'), 1.15).transpose(Image.FLIP_LEFT_RIGHT)
    palms = palms.filter(ImageFilter.GaussianBlur(6))
    canvas.alpha_composite(palms, (W - round(palms.width * 0.42), H - palms.height + 120))

    img = np.asarray(canvas.convert('RGB')).astype(np.float32) / 255
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    # Golden hour: warm the whole frame, deepen the shadows a little, and a low sun at the left.
    img = img ** 1.08 * np.array([1.08, 0.97, 0.80], np.float32)
    sun = np.exp(-(((xx - W * 0.06) / (W * 0.42)) ** 2 + ((yy - H * 0.5) / (H * 0.55)) ** 2))
    img = img + sun[..., None] * np.array([0.42, 0.26, 0.08], np.float32)
    img = 1 - (1 - img) * (1 - sun[..., None] * 0.18)
    soft = np.asarray(Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(9)), np.float32) / 255
    sharp = np.asarray(Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.6)), np.float32) / 255
    # Soft (like a shallow depth of field) in the middle where the card sits, sharper toward the edges.
    m = np.exp(-(((xx - W / 2) / (W * 0.32)) ** 2 + ((yy - H * 0.5) / (H * 0.42)) ** 2))[..., None]
    img = sharp * (1 - m) + soft * m
    # A gentle vignette.
    v = 1 - 0.22 * smoothstep(0.55, 1.15, np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2))
    img *= v[..., None]
    return Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))


# ---------------------------------------------------------------- paddy card

def paddy_card() -> Image.Image:
    scene = Image.open(ROOT / 'brand' / 'landing' / 'paddy-scene.png').convert('RGB')
    w, h = scene.size
    box = (round(w * 0.55), round(h * 0.04), w, round(h * 0.04) + round((w - round(w * 0.55)) * 2 / 3))
    return scene.crop(box).resize((1200, 800), Image.LANCZOS)


# ---------------------------------------------------------------- mist

def mist(seed: int) -> Image.Image:
    W, H = 2048, 1024
    n = fractal(W, H, seed)
    rng = np.random.default_rng(seed + 100)
    # A billowy top edge: a row of overlapping round heads.
    xs = np.arange(W, dtype=np.float32)
    top = np.full(W, H * 0.62, np.float32)
    x = -100.0
    while x < W + 100:
        r = rng.uniform(H * 0.12, H * 0.26)
        cy = H * rng.uniform(0.42, 0.6)
        inside = np.clip(r * r - (xs - x) ** 2, 0, None)
        top = np.minimum(top, np.where(inside > 0, cy - np.sqrt(inside), top))
        x += r * rng.uniform(0.9, 1.4)
    yy = np.arange(H, dtype=np.float32)[:, None]
    body = smoothstep(top[None, :] - H * 0.02, top[None, :] + H * 0.16, yy)
    body *= 1 - smoothstep(H * 0.72, H * 0.99, yy)
    side = smoothstep(0, W * 0.34, xs) * (1 - smoothstep(W * 0.66, W, xs))
    wisps = smoothstep(0.25, 0.85, n)
    a = body * side[None, :] * (0.25 + 0.95 * wisps)
    a = np.clip(a, 0, 1)
    alpha = Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(10))
    shade = 0.93 + 0.07 * n
    rgb = np.dstack([shade * 252, shade * 251, shade * 247]).astype(np.uint8)
    im = Image.fromarray(rgb, 'RGB').convert('RGBA')
    im.putalpha(alpha)
    return im


# ---------------------------------------------------------------- the generated blooms, trimmed

def trimmed(name: str, pad: int = 12) -> Image.Image:
    im = Image.open(ROOT / 'brand' / 'landing' / f'{name}.png').convert('RGBA')
    seen = im.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    x0, y0, x1, y1 = seen
    return im.crop((max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad)))


def main() -> None:
    preview = None
    if '--preview' in sys.argv:
        preview = Path(sys.argv[sys.argv.index('--preview') + 1])
        preview.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)

    day, info = footer_day()
    night = footer_night(day, info)
    for im, name in ((day, 'footer-terraces'), (night, 'footer-terraces-night')):
        save_webp(im.resize((2400, 800), Image.LANCZOS), f'{name}.webp', 74)
        save_webp(im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS), f'{name}-1600.webp', 80)
        if preview:
            im.save(preview / f'{name}.png')

    sf = steps_frame()
    save_webp(sf, 'steps-frame.webp', 80)
    pc = paddy_card()
    save_webp(pc, 'paddy-card.webp', 80)
    for seed, name in ((3, 'mist-a'), (11, 'mist-b')):
        m = mist(seed)
        save_webp(m, f'{name}.webp', 74)
        if preview:
            m.save(preview / f'{name}.png')
    for name, width in (('bloom-equal', 900), ('bloom-custom', 900), ('bloom-faraid', 900), ('cta-bloom', 1400)):
        im = trimmed(name)
        if im.width > width:
            im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        save_webp(im, f'{name}.webp', 82)
    if preview:
        sf.save(preview / 'steps-frame.png')
        pc.save(preview / 'paddy-card.png')


if __name__ == '__main__':
    main()
