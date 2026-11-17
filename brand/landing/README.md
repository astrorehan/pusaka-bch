# Landing page art

The pictures below the hero on the home page. Two kinds: images generated from a written brief (each master PNG
has its exact prompt beside it in `<name>.prompt.txt`), and images composed in code from art the project already
has, by [`compose_landing_art.py`](compose_landing_art.py). Runtime files are WebP in `app/public/landing/`.

| Runtime file | Made how | Used by |
| --- | --- | --- |
| `paddy-scene.webp` (3600 px), `paddy-scene-2560.webp` | Generated: [paddy-scene.png](paddy-scene.png) | The pinned paddy scene (`PaddyScroll.tsx`) |
| `bloom-equal.webp`, `bloom-custom.webp`, `bloom-faraid.webp` | Generated with alpha, trimmed by the script | The three family cards (`FamilyCards.tsx`) |
| `cta-bloom.webp` | Generated with alpha, trimmed by the script | The closing call (`ClosingSections.tsx`) |
| `paddy-card.webp` | Composed: open water cropped from the paddy scene | Behind the glass cards on phones (`.water-box`) |
| `mist-a.webp`, `mist-b.webp` | Composed: procedural cloud banks with alpha | The mist that rises into the night |
| `steps-frame.webp` | Composed: the hero's sky, volcano, terraces and one palm, at golden hour | The three steps frame (`StepsFrame.tsx`) |
| `footer-terraces.webp` (2400 px) and `-1600` | Composed: the hero's volcano, terraces, hut and palms, sky cut out | The footer (`HomeFooter scene`) |
| `footer-terraces-night.webp` and `-1600` | Composed: the same picture by moonlight, the window lit, fireflies | The footer in the dark theme |

The composed pictures reuse the hero's photographic plates in `brand/hero/landscape-v2/`, so the hut, palms and volcano
at the bottom of the page are the same ones the visitor saw at the top.

## The bloom

Every bloom follows the hero's water lily: exactly four separate oval petals in an X, white-peach at the throat
to blue-violet at the tips, a golden seed with stamens, on notched lily pads. Check each new render for the petal count
before using it. No text, people, animals, coins, padlocks or shields in any image.

## Rebuild

From the repository root (needs Python with Pillow and NumPy):

```powershell
python brand/landing/compose_landing_art.py --preview work/landing-qa/art
```

This rewrites every composed file and re-trims the generated blooms from their masters. `--preview` also writes
full-size PNGs for inspection. To replace a generated image, save the new master PNG here under the same name, update
its `.prompt.txt`, and run the script (the paddy scene is converted by hand: 3600 px and 2560 px WebP, quality 82).

## Checking it in the page

With the dev server on 127.0.0.1:5199:

```powershell
node work/landing-qa/shots.mjs 1600 1000 light
node work/landing-qa/shots.mjs 390 844 dark
```

Screenshots go to `work/landing-qa/out/`. The script prints the horizontal overflow, which must be 0.
