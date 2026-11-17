// Renders the four posters of the home hero from the live scene, so the still and the 3D view are one picture.
//
// The scene is opened through the app itself with reduced motion (its resting pose), pinned to each base
// frame of app/src/screens/home/sawahFrame.ts, and the canvas alone is saved as WebP:
//
//   app/public/hero/pusaka-sawah-v1-wide.webp        1920 x 800   light
//   app/public/hero/pusaka-sawah-v1-wide-dark.webp   1920 x 800   dark
//   app/public/hero/pusaka-sawah-v1-tall.webp        1000 x 800   light
//   app/public/hero/pusaka-sawah-v1-tall-dark.webp   1000 x 800   dark
//
// Run it again whenever the look of the scene changes:
//
//   cd app && npx vite --host 127.0.0.1 --port 5199 --strictPort        (in one terminal)
//   node brand/hero/source/render_sawah_posters.mjs                      (in another, from the repository root)
//
// Options: --url <page>  --out <folder>  --png-out <folder>  --quality <0..1>  --version <v1|v2>
//          --browser <Chromium path>
// Needs playwright-core; it is looked up from work/hero-qa, then from the usual module paths.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = Object.fromEntries(process.argv.slice(2).reduce((list, value, i, all) => {
  if (value.startsWith('--')) list.push([value.slice(2), all[i + 1]]);
  return list;
}, []));
const url = args.url ?? 'http://127.0.0.1:5199/?mock=1';
const out = path.resolve(args.out ?? path.join(repo, 'app/public/hero'));
const pngOut = args['png-out'] ? path.resolve(args['png-out']) : undefined;
const quality = Number(args.quality ?? 0.8);
const version = args.version ?? 'v1';
const browserPath = args.browser ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

function loadPlaywright() {
  for (const from of [path.join(repo, 'work/hero-qa/'), import.meta.url]) {
    try { return createRequire(from)('playwright-core'); } catch { /* try the next place */ }
  }
  throw new Error('playwright-core was not found. Install it, for example in work/hero-qa.');
}
const { chromium } = loadPlaywright();

// The scene picks its frame from the viewport: wide from 900 px, tall below. width x height are the
// stage in CSS pixels; scale brings them to the poster's pixels.
const FRAMES = [
  { name: 'wide', viewport: { width: 1920, height: 900 }, scale: 1, width: 1920, height: 800 },
  { name: 'tall', viewport: { width: 800, height: 900 }, scale: 1.25, width: 800, height: 640 },
];
// Pin the stage to the corner at the exact frame size, above everything, and remove what lies over the canvas.
const pin = ({ width, height }) => `.home--studio .home-hero { z-index: 9999 !important; }
  .home-hero__scene { position: fixed !important; inset: 0 auto auto 0 !important; width: ${width}px !important; height: ${height}px !important; margin: 0 !important; z-index: 9999 !important; }
  .flower-stage__toggle { visibility: hidden !important; }
  .home-hero__scene::before, .home-hero__scene::after { display: none !important; }`;

await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: browserPath, headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
try {
  if (pngOut) await mkdir(pngOut, { recursive: true });
  for (const frame of FRAMES) {
    for (const dark of [false, true]) {
      const context = await browser.newContext({
        viewport: frame.viewport, deviceScaleFactor: frame.scale, colorScheme: dark ? 'dark' : 'light', reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'networkidle' });
      // Reduced motion keeps the scene behind its "View in 3D" button; press it, then wait for the scene.
      await page.locator('.flower-stage__toggle').click();
      await page.locator('.flower-stage[data-scene="ready"]').waitFor({ timeout: 120000 });
      await page.addStyleTag({ content: pin(frame) });
      await page.waitForTimeout(800);
      const png = await page.locator('.flower-stage__canvas canvas').screenshot({ type: 'png' });
      if (pngOut) await writeFile(path.join(pngOut, `pusaka-sawah-${version}-${frame.name}${dark ? '-dark' : ''}.png`), png);
      // The browser encodes the WebP, so no other tool is needed.
      const webp = await page.evaluate(async ({ data, q }) => {
        const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
        const sheet = new OffscreenCanvas(image.width, image.height);
        sheet.getContext('2d').drawImage(image, 0, 0);
        const bytes = new Uint8Array(await (await sheet.convertToBlob({ type: 'image/webp', quality: q })).arrayBuffer());
        let text = '';
        for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return { base64: btoa(text), width: image.width, height: image.height };
      }, { data: png.toString('base64'), q: quality });
      const file = path.join(out, `pusaka-sawah-${version}-${frame.name}${dark ? '-dark' : ''}.webp`);
      const bytes = Buffer.from(webp.base64, 'base64');
      await writeFile(file, bytes);
      console.log(`${path.basename(file)}  ${webp.width}x${webp.height}  ${(bytes.length / 1024).toFixed(1)} KB`);
      await context.close();
    }
  }
} finally {
  await browser.close();
}
