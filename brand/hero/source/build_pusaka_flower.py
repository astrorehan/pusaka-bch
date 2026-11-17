"""Deterministic Blender 5.1+ builder for the Pusaka 3D hero flower emblem.

Produces:
1. Editable source scene: brand/hero/source/pusaka-flower-v1.blend
2. Generated PBR texture maps: brand/hero/source/textures/*.png
3. Clean Three.js-ready glTF binary: app/public/hero/pusaka-flower-v1.glb
4. Studio & inspection PNG previews: brand/hero/previews/*.png

Usage (headless):
    blender --background --python brand/hero/source/build_pusaka_flower.py
"""

from __future__ import annotations

import math
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector


ROOT_DIR = Path(__file__).resolve().parents[3]
SOURCE_DIR = ROOT_DIR / "brand" / "hero" / "source"
TEXTURE_DIR = SOURCE_DIR / "textures"
PREVIEW_DIR = ROOT_DIR / "brand" / "hero" / "previews"
PUBLIC_HERO_DIR = ROOT_DIR / "app" / "public" / "hero"

BLEND_PATH = SOURCE_DIR / "pusaka-flower-v1.blend"
GLB_PATH = PUBLIC_HERO_DIR / "pusaka-flower-v1.glb"
STUDIO_PREVIEW_PATH = PREVIEW_DIR / "pusaka-flower-v1-studio.png"
INSPECT_FRONT_PATH = PREVIEW_DIR / "pusaka-flower-v1-front.png"
INSPECT_ANGLE_PATH = PREVIEW_DIR / "pusaka-flower-v1-angle.png"
INSPECT_SIDE_PATH = PREVIEW_DIR / "pusaka-flower-v1-side.png"

# Geometry parameters harmonizing app/public/favicon.svg silhouette with hero-keyvisual-v2 proportions
# Raw units before normalizing overall X/Y span to exactly 2.000 m
RAW_PETAL_HALF_LENGTH = 5.45
RAW_PETAL_HALF_WIDTH = 2.92
RAW_PETAL_HALF_DEPTH = 1.62
RAW_PETAL_INNER_RADIUS = 1.92
RAW_SEED_RADIUS = 1.34
TARGET_SPAN_METERS = 2.000

PETAL_SUBDIV_U = 24  # along length
PETAL_SUBDIV_V = 16  # across width
PETAL_SUBDIV_W = 8   # across depth (even -> clean equator)
SEED_SUBDIV = 12     # pole-free quad-sphere subdivisions per face


def ensure_dirs() -> None:
    TEXTURE_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_HERO_DIR.mkdir(parents=True, exist_ok=True)


def clear_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def hex_to_srgb_tuple(hex_str: str) -> tuple[float, float, float]:
    h = hex_str.lstrip("#")
    return (
        int(h[0:2], 16) / 255.0,
        int(h[2:4], 16) / 255.0,
        int(h[4:6], 16) / 255.0,
    )


def periodic_fbm(size: int, seed: int, octaves: list[tuple[int, float]]) -> np.ndarray:
    """Deterministic tileable 2D smooth value noise."""
    rng = np.random.default_rng(seed)
    acc = np.zeros((size, size), dtype=np.float32)
    weight_sum = 0.0
    for freq, weight in octaves:
        grid = rng.normal(0.0, 1.0, size=(freq, freq)).astype(np.float32)
        ys = np.linspace(0.0, freq, size, endpoint=False)
        xs = np.linspace(0.0, freq, size, endpoint=False)
        y0 = np.floor(ys).astype(np.int32) % freq
        x0 = np.floor(xs).astype(np.int32) % freq
        y1 = (y0 + 1) % freq
        x1 = (x0 + 1) % freq
        fy = ys - np.floor(ys)
        fx = xs - np.floor(xs)
        fy = fy * fy * (3.0 - 2.0 * fy)
        fx = fx * fx * (3.0 - 2.0 * fx)

        v00 = grid[y0[:, None], x0[None, :]]
        v10 = grid[y0[:, None], x1[None, :]]
        v01 = grid[y1[:, None], x0[None, :]]
        v11 = grid[y1[:, None], x1[None, :]]

        top = v00 * (1.0 - fx[None, :]) + v10 * fx[None, :]
        bot = v01 * (1.0 - fx[None, :]) + v11 * fx[None, :]
        layer = top * (1.0 - fy[:, None]) + bot * fy[:, None]
        acc += layer * weight
        weight_sum += weight

    acc /= max(weight_sum, 1e-6)
    std = float(np.std(acc))
    if std > 1e-6:
        acc /= std
    return acc


def height_to_normal(height: np.ndarray, strength: float) -> np.ndarray:
    """Convert periodic 2D height map to tangent-space RGB normal map in [0, 1]."""
    dx = np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)
    dy = np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)
    nx = -dx * strength
    ny = dy * strength
    nz = np.ones_like(height, dtype=np.float32)
    inv_len = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz)
    nx *= inv_len
    ny *= inv_len
    nz *= inv_len
    rgb = np.stack([0.5 + 0.5 * nx, 0.5 + 0.5 * ny, 0.5 + 0.5 * nz], axis=-1)
    return np.clip(rgb, 0.0, 1.0)


def save_array_as_png(
    arr: np.ndarray,
    filepath: Path,
    colorspace: str = "sRGB",
    is_grayscale: bool = False,
) -> bpy.types.Image:
    """Save a [0, 1] float32 HxWx3 or HxW array to PNG via Blender's image API."""
    h, w = arr.shape[:2]
    if is_grayscale or arr.ndim == 2:
        g = arr if arr.ndim == 2 else arr[:, :, 0]
        rgba = np.stack([g, g, g, np.ones_like(g)], axis=-1)
    else:
        rgba = np.concatenate([arr, np.ones((h, w, 1), dtype=np.float32)], axis=-1)

    rgba_flipped = np.flipud(rgba).astype(np.float32)

    img = bpy.data.images.new(
        name=filepath.stem,
        width=w,
        height=h,
        alpha=False,
        float_buffer=False,
    )
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(rgba_flipped.ravel())
    img.filepath_raw = str(filepath)
    img.file_format = "PNG"
    img.save()

    bpy.data.images.remove(img)
    loaded = bpy.data.images.load(str(filepath))
    loaded.colorspace_settings.name = colorspace
    loaded.pack()
    return loaded


def generate_textures() -> dict[str, bpy.types.Image]:
    """Generate deterministic satin ceramic indigo and brushed bronze PBR textures."""
    textures: dict[str, bpy.types.Image] = {}

    # 1. Indigo satin ceramic textures (256x256, band-limited stoneware micro-grain for clean PNG compression)
    size_c = 256
    macro_noise = periodic_fbm(size_c, seed=101, octaves=[(6, 0.6), (12, 0.4)])
    micro_noise = periodic_fbm(size_c, seed=202, octaves=[(24, 0.6), (48, 0.4)])

    # Rich deep midnight indigo anchored on #131B33, tuned slightly toward v2 cobalt ceramic
    base_indigo = np.array(hex_to_srgb_tuple("#192144"), dtype=np.float32)
    variation = macro_noise * 0.0035 + micro_noise * 0.0020
    indigo_rgb = np.zeros((size_c, size_c, 3), dtype=np.float32)
    indigo_rgb[:, :, 0] = np.clip(base_indigo[0] + variation * 0.65, 0.02, 0.25)
    indigo_rgb[:, :, 1] = np.clip(base_indigo[1] + variation * 0.78, 0.03, 0.30)
    indigo_rgb[:, :, 2] = np.clip(base_indigo[2] + variation * 1.10, 0.08, 0.45)

    # Satin ceramic roughness around 0.36
    indigo_rough = np.clip(0.36 + macro_noise * 0.018 + micro_noise * 0.012, 0.29, 0.44)
    indigo_height = macro_noise * 0.25 + micro_noise * 0.75
    indigo_normal = height_to_normal(indigo_height, strength=0.16)

    textures["indigo_base"] = save_array_as_png(
        indigo_rgb, TEXTURE_DIR / "indigo_ceramic_basecolor.png", colorspace="sRGB"
    )
    textures["indigo_rough"] = save_array_as_png(
        indigo_rough, TEXTURE_DIR / "indigo_ceramic_roughness.png", colorspace="Non-Color", is_grayscale=True
    )
    textures["indigo_normal"] = save_array_as_png(
        indigo_normal, TEXTURE_DIR / "indigo_ceramic_normal.png", colorspace="Non-Color"
    )

    # 2. Brushed bronze textures (256x256, concentric circular brush centered on front & back islands)
    size_b = 256
    yy, xx = np.mgrid[0:size_b, 0:size_b].astype(np.float32)
    u = xx / size_b
    v = yy / size_b

    cx = np.where(u < 0.5, 0.25, 0.75)
    dx = (u - cx) * 2.0
    dy = (v - 0.5) * 2.0
    radius = np.sqrt(dx * dx + dy * dy)
    angle = np.arctan2(dy, dx)

    rng_b = np.random.default_rng(404)
    radial_profile = rng_b.normal(0.0, 1.0, size=512).astype(np.float32)
    radial_smooth = np.convolve(np.pad(radial_profile, 2, mode="wrap"), [0.15, 0.2, 0.3, 0.2, 0.15], mode="valid")
    r_idx = np.clip((radius * 210.0).astype(np.int32), 0, len(radial_smooth) - 1)
    r_idx_fine = np.clip((radius * 420.0).astype(np.int32), 0, len(radial_smooth) - 1)

    brush_rings = radial_smooth[r_idx] * 0.65 + radial_smooth[r_idx_fine] * 0.35
    angular_var = np.cos(angle * 2.0 + radius * 2.0) * 0.14 + np.sin(angle * 5.0 - radius * 3.0) * 0.10
    brush_signal = brush_rings * 0.75 + angular_var * 0.25

    # Warm satin bronze-gold anchored on #93633A, tuned toward v2 brushed bronze-gold highlights
    bronze_mid = np.array(hex_to_srgb_tuple("#B5844E"), dtype=np.float32)
    bronze_rgb = np.zeros((size_b, size_b, 3), dtype=np.float32)
    bronze_rgb[:, :, 0] = np.clip(bronze_mid[0] + brush_signal * 0.036, 0.45, 0.92)
    bronze_rgb[:, :, 1] = np.clip(bronze_mid[1] + brush_signal * 0.028, 0.30, 0.80)
    bronze_rgb[:, :, 2] = np.clip(bronze_mid[2] + brush_signal * 0.018, 0.16, 0.58)

    bronze_rough = np.clip(0.30 - brush_signal * 0.028, 0.22, 0.40)
    bronze_normal = height_to_normal(brush_rings * 0.7 + angular_var * 0.15, strength=0.28)

    textures["bronze_base"] = save_array_as_png(
        bronze_rgb, TEXTURE_DIR / "bronze_brushed_basecolor.png", colorspace="sRGB"
    )
    textures["bronze_rough"] = save_array_as_png(
        bronze_rough, TEXTURE_DIR / "bronze_brushed_roughness.png", colorspace="Non-Color", is_grayscale=True
    )
    textures["bronze_normal"] = save_array_as_png(
        bronze_normal, TEXTURE_DIR / "bronze_brushed_normal.png", colorspace="Non-Color"
    )

    return textures


def create_material_indigo(textures: dict[str, bpy.types.Image]) -> bpy.types.Material:
    mat = bpy.data.materials.new(name="M_IndigoCeramic")
    nt = mat.node_tree
    if nt is None:
        mat.use_nodes = True
        nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (500, 0)

    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (180, 0)
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["IOR"].default_value = 1.52
    bsdf.inputs["Specular IOR Level"].default_value = 0.46
    bsdf.inputs["Coat Weight"].default_value = 0.14
    bsdf.inputs["Coat Roughness"].default_value = 0.28

    tex_coord = nt.nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-650, 0)

    tex_base = nt.nodes.new("ShaderNodeTexImage")
    tex_base.image = textures["indigo_base"]
    tex_base.location = (-340, 260)

    tex_rough = nt.nodes.new("ShaderNodeTexImage")
    tex_rough.image = textures["indigo_rough"]
    tex_rough.location = (-340, -20)

    tex_norm = nt.nodes.new("ShaderNodeTexImage")
    tex_norm.image = textures["indigo_normal"]
    tex_norm.location = (-340, -300)

    normal_map = nt.nodes.new("ShaderNodeNormalMap")
    normal_map.location = (-50, -300)
    normal_map.inputs["Strength"].default_value = 0.09

    nt.links.new(tex_coord.outputs["UV"], tex_base.inputs["Vector"])
    nt.links.new(tex_coord.outputs["UV"], tex_rough.inputs["Vector"])
    nt.links.new(tex_coord.outputs["UV"], tex_norm.inputs["Vector"])

    nt.links.new(tex_base.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tex_rough.outputs["Color"], bsdf.inputs["Roughness"])
    nt.links.new(tex_norm.outputs["Color"], normal_map.inputs["Color"])
    nt.links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def create_material_bronze(textures: dict[str, bpy.types.Image]) -> bpy.types.Material:
    mat = bpy.data.materials.new(name="M_BrushedBronze")
    nt = mat.node_tree
    if nt is None:
        mat.use_nodes = True
        nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (500, 0)

    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (180, 0)
    bsdf.inputs["Metallic"].default_value = 0.88
    bsdf.inputs["IOR"].default_value = 1.5

    tex_coord = nt.nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-650, 0)

    tex_base = nt.nodes.new("ShaderNodeTexImage")
    tex_base.image = textures["bronze_base"]
    tex_base.location = (-340, 260)

    tex_rough = nt.nodes.new("ShaderNodeTexImage")
    tex_rough.image = textures["bronze_rough"]
    tex_rough.location = (-340, -20)

    tex_norm = nt.nodes.new("ShaderNodeTexImage")
    tex_norm.image = textures["bronze_normal"]
    tex_norm.location = (-340, -300)

    normal_map = nt.nodes.new("ShaderNodeNormalMap")
    normal_map.location = (-50, -300)
    normal_map.inputs["Strength"].default_value = 0.14

    nt.links.new(tex_coord.outputs["UV"], tex_base.inputs["Vector"])
    nt.links.new(tex_coord.outputs["UV"], tex_rough.inputs["Vector"])
    nt.links.new(tex_coord.outputs["UV"], tex_norm.inputs["Vector"])

    nt.links.new(tex_base.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tex_rough.outputs["Color"], bsdf.inputs["Roughness"])
    nt.links.new(tex_norm.outputs["Color"], normal_map.inputs["Color"])
    nt.links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def spherify_cube_point(u: float, v: float, w: float) -> tuple[float, float, float]:
    """Map cube surface point (u,v,w) in [-1,1]^3 smoothly onto the unit sphere."""
    u2, v2, w2 = u * u, v * v, w * w
    sx = u * math.sqrt(max(0.0, 1.0 - 0.5 * v2 - 0.5 * w2 + (v2 * w2) / 3.0))
    sy = v * math.sqrt(max(0.0, 1.0 - 0.5 * w2 - 0.5 * u2 + (w2 * u2) / 3.0))
    sz = w * math.sqrt(max(0.0, 1.0 - 0.5 * u2 - 0.5 * v2 + (u2 * v2) / 3.0))
    return sx, sy, sz


def build_grid_box_bmesh(
    nu: int, nv: int, nw: int
) -> tuple[bmesh.types.BMesh, dict[bmesh.types.BMVert, tuple[float, float, float]]]:
    """Build a watertight quad-only subdivided box surface."""
    bm = bmesh.new()
    vert_map: dict[tuple[int, int, int], bmesh.types.BMVert] = {}
    coord_map: dict[bmesh.types.BMVert, tuple[float, float, float]] = {}

    def get_vert(i: int, j: int, k: int) -> bmesh.types.BMVert:
        key = (i, j, k)
        if key not in vert_map:
            u = -1.0 + 2.0 * (i / nu)
            v = -1.0 + 2.0 * (j / nv)
            w = -1.0 + 2.0 * (k / nw)
            vert = bm.verts.new((u, v, w))
            vert_map[key] = vert
            coord_map[vert] = (u, v, w)
        return vert_map[key]

    for j in range(nv):
        for i in range(nu):
            bm.faces.new((get_vert(i, j, nw), get_vert(i + 1, j, nw), get_vert(i + 1, j + 1, nw), get_vert(i, j + 1, nw)))
            bm.faces.new((get_vert(i, j, 0), get_vert(i, j + 1, 0), get_vert(i + 1, j + 1, 0), get_vert(i + 1, j, 0)))

    for k in range(nw):
        for i in range(nu):
            bm.faces.new((get_vert(i, nv, k), get_vert(i, nv, k + 1), get_vert(i + 1, nv, k + 1), get_vert(i + 1, nv, k)))
            bm.faces.new((get_vert(i, 0, k), get_vert(i + 1, 0, k), get_vert(i + 1, 0, k + 1), get_vert(i, 0, k + 1)))

    for k in range(nw):
        for j in range(nv):
            bm.faces.new((get_vert(nu, j, k), get_vert(nu, j + 1, k), get_vert(nu, j + 1, k + 1), get_vert(nu, j, k + 1)))
            bm.faces.new((get_vert(0, j, k), get_vert(0, j, k + 1), get_vert(0, j + 1, k + 1), get_vert(0, j + 1, k)))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm, coord_map


def create_petal_mesh(
    name: str,
    half_len: float,
    half_wid: float,
    half_dep: float,
    uv_offset: tuple[float, float],
) -> bpy.types.Mesh:
    """Create a sculpted volumetric petal mesh with continuous front/side UVs (seam on back spine)."""
    bm, coord_map = build_grid_box_bmesh(PETAL_SUBDIV_U, PETAL_SUBDIV_V, PETAL_SUBDIV_W)
    uv_layer = bm.loops.layers.uv.new("UVMap")

    norm_coords: dict[bmesh.types.BMVert, tuple[float, float, float]] = {}

    for vert in bm.verts:
        u, v, w = coord_map[vert]
        sx, sy, sz = spherify_cube_point(u, v, w)

        # Smooth almond-oval taper: full waist in middle, rounded ends, subtly tapered inner end
        taper = (1.0 - 0.14 * sx * sx) * (1.0 + 0.05 * sx)

        # Gentle cushioned thickness profile (soft bevel shoulder without any flat face)
        sz_sign = 1.0 if sz >= 0.0 else -1.0
        sz_cushioned = sz_sign * (abs(sz) ** 0.88)

        px = sx * half_len
        pz = sy * half_wid * taper
        py = -sz_cushioned * half_dep * (0.94 + 0.06 * taper)

        vert.co = Vector((px, py, pz))
        norm_coords[vert] = (sx, sy, sz)

    # Continuous cylindrical UVs around length axis: seam placed on back spine (sz < 0, sy = 0)
    for face in bm.faces:
        # Compute unwrapped phi per face first to prevent 2*pi wrap jumps across back seam
        face_phis = []
        for loop in face.loops:
            _, sy, sz = norm_coords[loop.vert]
            phi = math.atan2(sy, sz)  # 0 at front crown, +-pi/2 at side rims, +-pi at back spine
            face_phis.append(phi)

        # If a face straddles the back seam (+pi / -pi), shift negative angles by +2*pi
        max_phi = max(face_phis)
        min_phi = min(face_phis)
        crosses_seam = (max_phi - min_phi) > math.pi

        for loop, phi in zip(face.loops, face_phis):
            sx, _, _ = norm_coords[loop.vert]
            if crosses_seam and phi < 0.0:
                phi += 2.0 * math.pi
            uu = (0.5 + 0.48 * sx + uv_offset[0])
            vv = (0.5 + phi / (2.0 * math.pi) + uv_offset[1])
            loop[uv_layer].uv = (uu, vv)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()

    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    mesh.update()
    return mesh


def create_seed_mesh(name: str, radius: float) -> bpy.types.Mesh:
    """Create a pole-free quad-sphere seed mesh with front/back concentric UVs."""
    bm, coord_map = build_grid_box_bmesh(SEED_SUBDIV, SEED_SUBDIV, SEED_SUBDIV)
    uv_layer = bm.loops.layers.uv.new("UVMap")

    sphere_coords: dict[bmesh.types.BMVert, tuple[float, float, float]] = {}
    for vert in bm.verts:
        u, v, w = coord_map[vert]
        sx, sy, sz = spherify_cube_point(u, v, w)
        vert.co = Vector((sx * radius, -sz * radius, sy * radius))
        sphere_coords[vert] = (sx, sy, sz)

    for face in bm.faces:
        avg_sz = sum(sphere_coords[v][2] for v in face.verts) / len(face.verts)
        is_front = avg_sz >= 0.0
        u_center = 0.25 if is_front else 0.75
        for loop in face.loops:
            sx, sy, _ = sphere_coords[loop.vert]
            uu = u_center + 0.22 * sx
            vv = 0.50 + 0.44 * sy
            loop[uv_layer].uv = (uu, vv)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()

    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    mesh.update()
    return mesh


def build_flower_collection(
    mat_indigo: bpy.types.Material,
    mat_bronze: bpy.types.Material,
) -> tuple[bpy.types.Collection, bpy.types.Object, float]:
    """Create the PusakaFlower collection, normalized so X/Y span equals TARGET_SPAN_METERS."""
    col = bpy.data.collections.new("PusakaFlower")
    bpy.context.scene.collection.children.link(col)

    raw_center_dist = RAW_PETAL_INNER_RADIUS + RAW_PETAL_HALF_LENGTH
    probe_mesh = create_petal_mesh(
        "ProbePetal",
        RAW_PETAL_HALF_LENGTH,
        RAW_PETAL_HALF_WIDTH,
        RAW_PETAL_HALF_DEPTH,
        (0.0, 0.0),
    )
    rot_45 = Matrix.Rotation(math.radians(-45.0), 4, "Y")
    max_xy = 0.0
    for v in probe_mesh.vertices:
        p = rot_45 @ v.co
        px = p.x + raw_center_dist / math.sqrt(2.0)
        pz = p.z + raw_center_dist / math.sqrt(2.0)
        max_xy = max(max_xy, abs(px), abs(pz))
    bpy.data.meshes.remove(probe_mesh)

    norm_scale = (TARGET_SPAN_METERS * 0.5) / max_xy

    half_len = RAW_PETAL_HALF_LENGTH * norm_scale
    half_wid = RAW_PETAL_HALF_WIDTH * norm_scale
    half_dep = RAW_PETAL_HALF_DEPTH * norm_scale
    center_dist = raw_center_dist * norm_scale
    seed_radius = RAW_SEED_RADIUS * norm_scale

    root_empty = bpy.data.objects.new("PusakaFlower", None)
    root_empty.empty_display_type = "PLAIN_AXES"
    root_empty.empty_display_size = 0.25
    col.objects.link(root_empty)

    petal_specs = [
        ("Petal_NE", 45.0, (0.00, 0.00)),
        ("Petal_SE", -45.0, (0.17, 0.23)),
        ("Petal_SW", -135.0, (0.31, 0.47)),
        ("Petal_NW", 135.0, (0.43, 0.69)),
    ]

    petal_objs: list[bpy.types.Object] = []
    for name, angle_deg, uv_off in petal_specs:
        mesh = create_petal_mesh(f"{name}_Mesh", half_len, half_wid, half_dep, uv_off)
        mesh.materials.append(mat_indigo)
        obj = bpy.data.objects.new(name, mesh)
        rad = math.radians(angle_deg)
        obj.location = (center_dist * math.cos(rad), 0.0, center_dist * math.sin(rad))
        obj.rotation_euler = Euler((0.0, -rad, 0.0), "XYZ")
        obj.parent = root_empty
        col.objects.link(obj)
        petal_objs.append(obj)

    seed_mesh = create_seed_mesh("Seed_Mesh", seed_radius)
    seed_mesh.materials.append(mat_bronze)
    seed_obj = bpy.data.objects.new("Seed", seed_mesh)
    seed_obj.location = (0.0, 0.0, 0.0)
    seed_obj.parent = root_empty
    col.objects.link(seed_obj)

    # Flush dependency graph so matrix_world reflects final transforms!
    bpy.context.view_layer.update()

    min_z_world = 0.0
    for obj in petal_objs:
        mw = obj.matrix_world
        for v in obj.data.vertices:
            wz = (mw @ v.co).z
            if wz < min_z_world:
                min_z_world = wz

    return col, root_empty, min_z_world


def build_studio_staging(floor_z: float) -> bpy.types.Collection:
    """Build separate warm ivory studio + pale limestone slab for Cycles preview renders."""
    col = bpy.data.collections.new("StudioStaging")
    bpy.context.scene.collection.children.link(col)

    # 1. Pale travertine / limestone slab material
    mat_stone = bpy.data.materials.new("M_StudioLimestone")
    nt = mat_stone.node_tree
    if nt is None:
        mat_stone.use_nodes = True
        nt = mat_stone.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.80

    tc = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1.0, 2.2, 1.0)

    noise1 = nt.nodes.new("ShaderNodeTexNoise")
    noise1.inputs["Scale"].default_value = 5.5
    noise1.inputs["Detail"].default_value = 12.0
    noise1.inputs["Roughness"].default_value = 0.72

    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.25
    ramp.color_ramp.elements[0].color = (0.72, 0.64, 0.53, 1.0)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (0.90, 0.84, 0.74, 1.0)

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.16
    bump.inputs["Distance"].default_value = 0.012

    nt.links.new(tc.outputs["Object"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], noise1.inputs["Vector"])
    nt.links.new(noise1.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(noise1.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    slab_thickness = 0.20
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.55, floor_z - slab_thickness * 0.5 + 0.002))
    slab = bpy.context.active_object
    slab.name = "Staging_LimestoneSlab"
    slab.scale = (11.0, 2.5, slab_thickness)
    bpy.ops.object.transform_apply(scale=True)
    bev = slab.modifiers.new("Bevel", "BEVEL")
    bev.width = 0.012
    bev.segments = 3
    slab.data.materials.append(mat_stone)
    for c in list(slab.users_collection):
        c.objects.unlink(slab)
    col.objects.link(slab)

    bpy.ops.mesh.primitive_plane_add(size=36.0, location=(0.0, 2.0, floor_z - slab_thickness))
    floor = bpy.context.active_object
    floor.name = "Staging_LowerFloor"
    floor.data.materials.append(mat_stone)
    for c in list(floor.users_collection):
        c.objects.unlink(floor)
    col.objects.link(floor)

    # 2. Warm ivory studio backdrop wall
    mat_wall = bpy.data.materials.new("M_StudioIvoryWall")
    nt_w = mat_wall.node_tree
    if nt_w is None:
        mat_wall.use_nodes = True
        nt_w = mat_wall.node_tree
    bsdf_w = nt_w.nodes.get("Principled BSDF")
    bsdf_w.inputs["Base Color"].default_value = (0.91, 0.86, 0.79, 1.0)
    bsdf_w.inputs["Roughness"].default_value = 0.92

    bpy.ops.mesh.primitive_plane_add(size=44.0, location=(0.0, 3.8, 2.0), rotation=(math.radians(90.0), 0.0, 0.0))
    wall = bpy.context.active_object
    wall.name = "Staging_IvoryBackdrop"
    wall.data.materials.append(mat_wall)
    for c in list(wall.users_collection):
        c.objects.unlink(wall)
    col.objects.link(wall)

    # 3. Warm editorial studio lighting (upper-left soft daylight + ivory bounce)
    def add_area_light(
        name: str,
        loc: tuple[float, float, float],
        rot_deg: tuple[float, float, float],
        energy: float,
        size: float,
        color: tuple[float, float, float],
    ) -> None:
        ldata = bpy.data.lights.new(name=name, type="AREA")
        ldata.energy = energy
        ldata.size = size
        ldata.color = color
        lobj = bpy.data.objects.new(name, ldata)
        lobj.location = loc
        lobj.rotation_euler = Euler([math.radians(a) for a in rot_deg], "XYZ")
        col.objects.link(lobj)

    add_area_light("Staging_KeyLight_UpperLeft", (-3.8, -3.5, 4.0), (46.0, 0.0, -45.0), 420.0, 3.0, (1.0, 0.96, 0.90))
    add_area_light("Staging_FillLight_Right", (4.2, -3.4, 1.1), (75.0, 0.0, 50.0), 140.0, 4.0, (0.99, 0.96, 0.92))
    add_area_light("Staging_WarmBounce_Front", (0.0, -4.5, -1.2), (105.0, 0.0, 0.0), 110.0, 4.2, (0.98, 0.93, 0.86))
    add_area_light("Staging_TopRimLight", (0.6, 1.1, 4.4), (165.0, 0.0, 0.0), 125.0, 2.8, (0.96, 0.97, 1.0))

    world = bpy.data.worlds.new("StudioWorld")
    bpy.context.scene.world = world
    if world.node_tree is None:
        world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.89, 0.85, 0.79, 1.0)
    bg.inputs["Strength"].default_value = 0.65

    cam_data = bpy.data.cameras.new("Staging_Camera")
    cam_data.lens = 50.0
    cam_obj = bpy.data.objects.new("Staging_Camera", cam_data)
    cam_obj.location = (0.12, -6.5, 0.34)
    direction = Vector((0.0, 0.0, 0.14)) - cam_obj.location
    cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    col.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj

    return col


def export_clean_glb(flower_col: bpy.types.Collection) -> None:
    """Export ONLY the PusakaFlower collection objects as a clean self-contained GLB."""
    bpy.ops.object.select_all(action="DESELECT")
    for obj in flower_col.objects:
        obj.select_set(True)

    bpy.context.view_layer.objects.active = flower_col.objects[0]

    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
    )


def configure_render_engine(width: int, height: int, samples: int) -> None:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.refresh_devices()
    has_gpu = False
    for backend in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = backend
            prefs.refresh_devices()
            for dev in prefs.devices:
                if dev.type in ("OPTIX", "CUDA"):
                    dev.use = True
                    has_gpu = True
            if has_gpu:
                break
        except Exception:
            continue

    scene.cycles.device = "GPU" if has_gpu else "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"


def render_previews(flower_col: bpy.types.Collection, staging_col: bpy.types.Collection) -> None:
    scene = bpy.context.scene

    # 1. Studio hero preview (1600x900, 16:9 matching v2 concept)
    configure_render_engine(1600, 900, samples=64)
    scene.render.filepath = str(STUDIO_PREVIEW_PATH)
    bpy.ops.render.render(write_still=True)

    # 2. Clean inspection renders (hide slab/floor/wall for seamless neutral world backdrop)
    for obj in staging_col.objects:
        if obj.name in ("Staging_LimestoneSlab", "Staging_LowerFloor", "Staging_IvoryBackdrop"):
            obj.hide_render = True

    cam = scene.camera
    configure_render_engine(960, 960, samples=48)

    cam.data.lens = 85.0
    cam.location = (0.0, -6.2, 0.0)
    cam.rotation_euler = (Vector((0.0, 0.0, 0.0)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(INSPECT_FRONT_PATH)
    bpy.ops.render.render(write_still=True)

    cam.data.lens = 65.0
    cam.location = (2.6, -4.3, 1.35)
    cam.rotation_euler = (Vector((0.0, 0.0, 0.0)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(INSPECT_ANGLE_PATH)
    bpy.ops.render.render(write_still=True)

    cam.data.lens = 75.0
    cam.location = (5.4, -0.5, 0.10)
    cam.rotation_euler = (Vector((0.0, 0.0, 0.0)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(INSPECT_SIDE_PATH)
    bpy.ops.render.render(write_still=True)

    # Restore studio camera & staging visibility before saving final .blend
    for obj in staging_col.objects:
        obj.hide_render = False
    cam.data.lens = 50.0
    cam.location = (0.12, -6.5, 0.34)
    cam.rotation_euler = (Vector((0.0, 0.0, 0.14)) - cam.location).to_track_quat("-Z", "Y").to_euler()


def main() -> None:
    ensure_dirs()
    clear_scene()

    textures = generate_textures()
    mat_indigo = create_material_indigo(textures)
    mat_bronze = create_material_bronze(textures)

    flower_col, _, min_z_world = build_flower_collection(mat_indigo, mat_bronze)
    staging_col = build_studio_staging(floor_z=min_z_world)

    export_clean_glb(flower_col)
    render_previews(flower_col, staging_col)

    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print(f"Saved blend: {BLEND_PATH}")
    print(f"Exported GLB: {GLB_PATH}")


if __name__ == "__main__":
    main()
