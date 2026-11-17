# Studio hero prototype

The home page now uses centered Geist typography, the four-petal flower in an ivory studio, and a single Family plan example. The stone slab and lighting are constructed in Three.js around the existing GLB. The create and plan screens keep their existing layouts.

## Implementation

- `app/src/screens/home/FlowerStage.tsx`: still-image first, desktop enhancement, explicit touch-device opt-in, theme synchronization, and fallback after load/context failure.
- `app/src/screens/home/flowerScene.ts`: camera, environment, lights, stone slab, model loading, subtle cursor response, and resource cleanup. Rendering runs on demand and pauses outside the viewport or while the document is hidden.
- `app/src/screens/home/FamilyPlanPreview.tsx`: Equal, Custom, and Faraid examples, keyboard-accessible tabs, shared bigint share math, and links into the selected create preset. Its 0.12 BCH is example data; no funds move.
- `app/src/screens/home/home-hero.css`: the studio composition, scoped home styling, and responsive panel.

Four still WebP renders in `app/public/hero/` come from the same web scene, with desktop/phone framing and light/dark variants. They are approximately 9.4–11.5 KiB each. Their PNG sources are `brand/hero/previews/pusaka-flower-web-*.png`.

## Verification on 16 November 2026

Checked in headless Microsoft Edge with software WebGL, against both the Vite development server and the production build:

- Desktop: the actual GLB loads and renders. No uncaught page errors or unexpected console errors on the tested path.
- Light/dark: the header theme switch updates the studio and the still-image selection.
- Touch widths 320, 390, and 768 px: no horizontal overflow, including the six-heir Faraid example.
- Touch devices: no model or Three.js scene download until View in 3D is pressed. The explicit 3D view was tested at 390 px.
- Reduced motion: starts with the still image without downloading the 3D scene.
- Failed model download: still image stays visible, the canvas is removed, and the page remains usable.
- Presets: Custom displays 0.06, 0.036, and 0.024 BCH; Faraid displays six heirs and the expected amounts from the shared share math.
- Keyboard: Home and arrow-key navigation update tab selection; the selected preset links to `/new?split=...` and the route change removes the home-specific shell styling.
- Production type-check/build passes. Lint reports the existing seven warnings and no errors.

The browser checks use desktop/touch emulation, not a physical phone. This pass does not verify wallet signing or mainnet transactions. Native-phone appearance and slow-network behavior remain follow-up checks before release.

Local verification helpers and screenshots are under `work/hero-qa/` and `work/design/previews/`.
