# Layered rice-field landscape experiment

The Pusaka flower stands in the reflective water as a blue water lily grown from the logo, built in code in `app/src/screens/home/sawahFlower.ts` so it can glow and be turned. The environment uses separate photographic plates, so each part can be replaced or repositioned independently. The visual direction is a natural Indonesian rice field with a spacious, hazy sky, thin clouds, and detailed vegetation and terrain.

| Layer | Master | Runtime | Placement |
| --- | --- | --- | --- |
| Sky | [sky-quiet.png](sky-quiet.png) | `app/public/hero/landscape-v2/sky.webp` | Quiet directional sky dome, also used for lighting and water reflections |
| Mountains | [mountains.png](mountains.png) | `app/public/hero/landscape-v2/mountains.webp` | Independent alpha plate over the sky, with a softly blended outer edge |
| Coconut palms | [palms.png](palms.png) | `app/public/hero/landscape-v2/palms.webp` | Separate near and far cutouts; near roots extend below the water surface |
| House | [house.png](house.png) | `app/public/hero/landscape-v2/house.webp` | The hut on a level earthen landing, with contact shadow |
| Terraces | [terraces.png](terraces.png) | `app/public/hero/landscape-v2/terraces.webp` | Curving rice terraces replacing the flat horizon bands; the lower strip also textures the bank |

Master PNGs and their `.prompt.txt` art-direction notes remain here. Runtime images are WebP with the source transparency preserved. The original model (no longer loaded by the page), earlier landscape assets and the v1 and v2 posters are preserved.

Art-direction notes: [sky](sky-quiet.prompt.txt), [mountains](mountains.prompt.txt), [palms](palms.prompt.txt), [house](house.prompt.txt), [terraces](terraces.prompt.txt). The earlier, cloudier sky remains in `sky.png` and `sky.prompt.txt`.

Pointer and scroll parallax translate the camera and its target together, with no camera tilt. The directional sky, sun/moon, stars and distant mountains therefore stay anchored while the nearby bloom moves slightly more than the rice, hut and palms. The same camera movement is mirrored in the water. Reduced motion keeps the resting view still.

The hut's landing is defined by `bankHeight()` in `app/src/screens/home/flowerScene.ts`. Its billboard is lowered by the source image's clear foot margin so the feet meet the ground. The lower strip of `terraces.webp` supplies the bank's texture without changing the master image. The sky, mountains, trees, terraces and house all participate in the same water reflection.

## Refresh the stills

The four v3 posters come from the resting pose of the live scene, in wide/tall and light/dark compositions. Run the development server, then the renderer from the repository root:

```powershell
cd app
npm run dev -- --host 127.0.0.1 --port 5199 --strictPort
```

```powershell
node brand/hero/source/render_sawah_posters.mjs --version v3 --quality 0.9 --png-out brand/hero/previews/landscape-v2
```

The active page uses `pusaka-sawah-v3-*.webp`. PNG versions remain in `brand/hero/previews/landscape-v2/` for inspection. Touch devices and reduced-motion sessions load a still first; landscape-loading failures keep that still visible.

## Verification

```powershell
$env:HERO_TEST_URL = 'http://127.0.0.1:5199/?mock=1'
node work/hero-qa/verify-landscape.mjs
```

The check exercises all five separate image loads, that no model is downloaded, desktop WebGL, light/dark switching, touch widths 320/390/768, explicit mobile 3D, reduced motion, and missing-landscape fallbacks. Screenshots go to `work/design/previews/landscape-v2/`. The app build and lint are separate checks.

Verified on 17 November 2026 against the production build: the checks above pass, the app builds, and lint reports no errors (nine warnings, all in other app files). The four v3 posters were refreshed from the final scene, with the water-lily bloom. Turning the bloom was checked separately in the browser: a grab cursor over it, no text selected while dragging across the copy, the hero actions still work, and a horizontal swipe turns it on a touch screen without scrolling the page sideways. Desktop and touch checks use browser emulation.

The quiet-sky update refreshes all four v3 posters. A focused production check confirms that pointer movement and scrolling translate the camera without changing the direction of the sky or stars, while nearby objects retain subtle parallax. Verification captures and camera measurements are in `work/design/previews/quiet-sky/`.
