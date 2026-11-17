# Pusaka 3D Hero Flower Asset

Volumetric 3D hero emblem derived from the four-petal brand mark (`app/public/favicon.svg`, `brand/logo-light.svg`) and the approved `brand/hero/masters/hero-keyvisual-v2.png` studio art direction.

## Deliverables

- Runtime Three.js asset: `app/public/hero/pusaka-flower-v1.glb`
- Editable Blender source: `brand/hero/source/pusaka-flower-v1.blend`
- Deterministic build script: `brand/hero/source/build_pusaka_flower.py`
- Binary GLB inspector: `brand/hero/source/inspect_glb.py`
- Generated PBR textures: `brand/hero/source/textures/`
- Rendered previews: `brand/hero/previews/`
  - `pusaka-flower-v1-studio.png` (16:9 ivory studio and pale limestone staging)
  - `pusaka-flower-v1-front.png` (front elevation)
  - `pusaka-flower-v1-angle.png` (3/4 perspective)
  - `pusaka-flower-v1-side.png` (side profile showing sculpted ceramic thickness)

## Rebuild and Verification

Requires Blender 5.1+ (for `.blend` generation, glTF export, and Cycles previews) and Python 3 with `numpy` (for `inspect_glb.py`):

```powershell
# Rebuild textures, .blend source, clean GLB export, and Cycles previews
& "D:\Program Files\Blender Foundation\Blender 5.1\blender.exe" --background --python brand/hero/source/build_pusaka_flower.py

# Inspect exported GLB header, hierarchy, triangle counts, bounds, normals, and materials
python brand/hero/source/inspect_glb.py app/public/hero/pusaka-flower-v1.glb
```

Note: Staging meshes (`Staging_LimestoneSlab`, `Staging_LowerFloor`, `Staging_IvoryBackdrop`), cameras, and lights reside in the separate `StudioStaging` collection inside `pusaka-flower-v1.blend` and are excluded from the exported GLB.

## Model Structure, Axes, and Origin

- **Coordinate convention (glTF / Three.js)**: `+X` right, `+Y` up, `+Z` front (facing camera).
- **Origin**: `(0, 0, 0)` at the exact geometric center of the emblem (the center of `Seed`).
- **Dimensions**: `2.0000 m` (W) × `2.0000 m` (H) × `0.3405 m` (D), bounded `[-1.0, +1.0]` in X and Y and `[-0.1703, +0.1703]` in Z.
- **Hierarchy**:
  - `PusakaFlower` (root group at `(0, 0, 0)`)
    - `Petal_NE` (`+X, +Y` upper-right petal, local pivot at petal center)
    - `Petal_NW` (`-X, +Y` upper-left petal, local pivot at petal center)
    - `Petal_SE` (`+X, -Y` lower-right petal, local pivot at petal center)
    - `Petal_SW` (`-X, -Y` lower-left petal, local pivot at petal center)
    - `Seed` (center sphere, diameter `0.2816 m`, `14.1%` of total emblem width)

Each petal uses a pole-free subdivided quad-box mapped into a cushioned almond-oval form with rounded ends and a subtly tapered inner end, keeping a clean negative-space gap around `Seed` and between adjacent petals.

## Materials

1. **`M_IndigoCeramic`** (applied to all four `Petal_*` meshes)
   - Satin midnight indigo ceramic anchored on `#131B33` (tuned to `#192144` base albedo for rich studio tonal depth without crushing shadows).
   - Band-limited `256×256` PNG textures: subtle stoneware color variation, roughness map (`~0.36`), and fine tactile normal micro-grain, plus subtle clearcoat (`KHR_materials_clearcoat`, weight `0.14`, roughness `0.28`).
2. **`M_BrushedBronze`** (applied to `Seed`)
   - Satin brushed bronze-gold anchored on `#93633A` (tuned toward `#B5844E` lit bronze-gold), `metallic = 0.88`.
   - `256×256` PNG textures with concentric circular brush strokes centered on the front and back hemispheres (`baseColor`, `roughness ~0.30`, `normal`).

## Verified GLB Metrics

Measured directly from `app/public/hero/pusaka-flower-v1.glb` via `inspect_glb.py`:

- **File size**: `601,352 bytes` (`587.3 KB` / `0.573 MB`)
- **Nodes / Meshes / Primitives**: `6` nodes (`1` group + `5` meshes), `5` primitives
- **Total geometry**: `6,726` vertices, `12,992` triangles (`2,816` tris per petal, `1,728` tris for `Seed`)
- **Attributes**: `POSITION`, `NORMAL` (unit-length verified, max deviation `1.10e-07`), `TEXCOORD_0`, `TANGENT`
- **Embedded images**: `6` PNG textures (`24.0 KB`–`70.2 KB` each)
- **Round-trip load**: verified via Blender glTF 2.0 importer (`0.03 s`, all 6 nodes intact)

## Limitations

- Verified visually in Blender Cycles (AgX) and structurally via binary GLB parsing plus Blender glTF round-trip import; live rendering inside a Three.js / WebGL browser canvas is deferred until homepage integration (`app/` has no Three.js dependency yet).
- `M_IndigoCeramic` uses standard glTF PBR extensions (`KHR_materials_clearcoat`, `KHR_materials_specular`, `KHR_materials_ior`), which Three.js `GLTFLoader` supports natively via `MeshPhysicalMaterial`, while simpler viewers fall back to base `pbrMetallicRoughness`.
- The `.glb` contains the flower emblem only (`PusakaFlower`); if a limestone pedestal or studio backdrop is desired in WebGL, stage it separately in the Three.js scene.
