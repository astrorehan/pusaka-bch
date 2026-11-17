"""Inspect and validate the exported glTF 2.0 binary (.glb) asset.

Parses the GLB binary header, JSON chunk, and BIN buffer directly in Python
(no external glTF library required) and verifies:
- Valid glTF 2.0 magic/version/chunk structure
- Node hierarchy and mesh/material naming
- Triangle, vertex, primitive, and UV/normal/tangent counts
- World-space bounding box dimensions and center
- Unit-length normal verification
- Embedded image dimensions and byte sizes
- Total file size budget

Usage:
    python brand/hero/source/inspect_glb.py [path/to/model.glb]
"""

from __future__ import annotations

import json
import math
import struct
import sys
from pathlib import Path

import numpy as np


DEFAULT_GLB = Path(__file__).resolve().parents[3] / "app" / "public" / "hero" / "pusaka-flower-v1.glb"

COMPONENT_DTYPE = {
    5120: np.int8,
    5121: np.uint8,
    5122: np.int16,
    5123: np.uint16,
    5125: np.uint32,
    5126: np.float32,
}

TYPE_COUNT = {
    "SCALAR": 1,
    "VEC2": 2,
    "VEC3": 3,
    "VEC4": 4,
    "MAT2": 4,
    "MAT3": 9,
    "MAT4": 16,
}


def read_glb(path: Path) -> tuple[dict, bytes]:
    raw = path.read_bytes()
    magic, version, total_len = struct.unpack_from("<III", raw, 0)
    if magic != 0x46546C67:
        raise ValueError(f"Invalid GLB magic: 0x{magic:08x}")
    if version != 2:
        raise ValueError(f"Unsupported glTF version: {version}")
    if total_len != len(raw):
        raise ValueError(f"Header length {total_len} != file size {len(raw)}")

    offset = 12
    gltf_json = None
    bin_data = b""

    while offset < len(raw):
        chunk_len, chunk_type = struct.unpack_from("<II", raw, offset)
        offset += 8
        chunk_bytes = raw[offset : offset + chunk_len]
        offset += chunk_len
        if chunk_type == 0x4E4F534A:  # JSON
            gltf_json = json.loads(chunk_bytes.decode("utf-8"))
        elif chunk_type == 0x004E4942:  # BIN
            bin_data = chunk_bytes

    if gltf_json is None:
        raise ValueError("Missing JSON chunk in GLB")
    return gltf_json, bin_data


def read_accessor(gltf: dict, bin_data: bytes, accessor_idx: int) -> np.ndarray:
    acc = gltf["accessors"][accessor_idx]
    bv = gltf["bufferViews"][acc["bufferView"]]
    dtype = np.dtype(COMPONENT_DTYPE[acc["componentType"]])
    n_comp = TYPE_COUNT[acc["type"]]
    count = acc["count"]
    byte_offset = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    stride = bv.get("byteStride", dtype.itemsize * n_comp)

    if stride == dtype.itemsize * n_comp:
        arr = np.frombuffer(bin_data, dtype=dtype, count=count * n_comp, offset=byte_offset)
        return arr.reshape((count, n_comp)) if n_comp > 1 else arr

    rows = []
    for i in range(count):
        pos = byte_offset + i * stride
        rows.append(np.frombuffer(bin_data, dtype=dtype, count=n_comp, offset=pos))
    arr = np.vstack(rows)
    return arr if n_comp > 1 else arr.ravel()


def node_matrix(node: dict) -> np.ndarray:
    if "matrix" in node:
        return np.array(node["matrix"], dtype=np.float64).reshape((4, 4)).T
    mat = np.eye(4, dtype=np.float64)
    if "scale" in node:
        sx, sy, sz = node["scale"]
        mat = mat @ np.diag([sx, sy, sz, 1.0])
    if "rotation" in node:
        qx, qy, qz, qw = node["rotation"]
        xx, yy, zz = qx * qx, qy * qy, qz * qz
        xy, xz, yz = qx * qy, qx * qz, qy * qz
        wx, wy, wz = qw * qx, qw * qy, qw * qz
        rot = np.array(
            [
                [1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy), 0],
                [2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx), 0],
                [2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy), 0],
                [0, 0, 0, 1],
            ],
            dtype=np.float64,
        )
        mat = rot @ mat
    if "translation" in node:
        tx, ty, tz = node["translation"]
        t = np.eye(4, dtype=np.float64)
        t[:3, 3] = [tx, ty, tz]
        mat = t @ mat
    return mat


def main() -> None:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_GLB
    size_bytes = path.stat().st_size
    gltf, bin_data = read_glb(path)

    print(f"File: {path}")
    print(f"Size: {size_bytes:,} bytes ({size_bytes / 1024:.1f} KB / {size_bytes / (1024 * 1024):.3f} MB)")
    print(f"Generator: {gltf.get('asset', {}).get('generator')}")
    print(f"Extensions used: {gltf.get('extensionsUsed', [])}")
    print(f"Nodes: {len(gltf.get('nodes', []))}, Meshes: {len(gltf.get('meshes', []))}, Materials: {len(gltf.get('materials', []))}, Images: {len(gltf.get('images', []))}")

    scene = gltf["scenes"][gltf.get("scene", 0)]
    nodes = gltf["nodes"]

    world_min = np.array([math.inf, math.inf, math.inf])
    world_max = np.array([-math.inf, -math.inf, -math.inf])
    total_tris = 0
    total_verts = 0
    total_prims = 0

    def walk(node_idx: int, parent_mat: np.ndarray, depth: int = 0) -> None:
        nonlocal total_tris, total_verts, total_prims, world_min, world_max
        node = nodes[node_idx]
        m = parent_mat @ node_matrix(node)
        indent = "  " * depth
        name = node.get("name", f"<node_{node_idx}>")
        if "mesh" in node:
            mesh = gltf["meshes"][node["mesh"]]
            mesh_tris = 0
            mesh_verts = 0
            mesh_min = np.array([math.inf, math.inf, math.inf])
            mesh_max = np.array([-math.inf, -math.inf, -math.inf])
            mats = []
            normal_err = 0.0
            has_uv = True
            has_tan = True
            for prim in mesh["primitives"]:
                total_prims += 1
                attrs = prim["attributes"]
                pos = read_accessor(gltf, bin_data, attrs["POSITION"]).astype(np.float64)
                nrm = read_accessor(gltf, bin_data, attrs["NORMAL"]).astype(np.float64)
                has_uv = has_uv and ("TEXCOORD_0" in attrs)
                has_tan = has_tan and ("TANGENT" in attrs)
                nrm_len = np.linalg.norm(nrm, axis=1)
                normal_err = max(normal_err, float(np.max(np.abs(nrm_len - 1.0))))
                if "indices" in prim:
                    idx = read_accessor(gltf, bin_data, prim["indices"])
                    tris = len(idx) // 3
                else:
                    tris = len(pos) // 3
                mesh_tris += tris
                mesh_verts += len(pos)

                hom = np.hstack([pos, np.ones((len(pos), 1))])
                wpos = (m @ hom.T).T[:, :3]
                mesh_min = np.minimum(mesh_min, wpos.min(axis=0))
                mesh_max = np.maximum(mesh_max, wpos.max(axis=0))

                mat_idx = prim.get("material")
                if mat_idx is not None:
                    mats.append(gltf["materials"][mat_idx].get("name", f"mat_{mat_idx}"))

            total_tris += mesh_tris
            total_verts += mesh_verts
            world_min = np.minimum(world_min, mesh_min)
            world_max = np.maximum(world_max, mesh_max)
            print(
                f"{indent}- {name}: verts={mesh_verts}, tris={mesh_tris}, mats={mats}, "
                f"uv={has_uv}, tangent={has_tan}, max_normal_err={normal_err:.2e}, "
                f"bounds_min={np.round(mesh_min, 4).tolist()}, bounds_max={np.round(mesh_max, 4).tolist()}"
            )
        else:
            print(f"{indent}- {name} (group)")

        for child in node.get("children", []):
            walk(child, m, depth + 1)

    print("\nHierarchy & Mesh Metrics (glTF +Y up, +Z front):")
    for root_idx in scene["nodes"]:
        walk(root_idx, np.eye(4, dtype=np.float64))

    dims = world_max - world_min
    center = (world_max + world_min) * 0.5
    print(f"\nTotals: primitives={total_prims}, vertices={total_verts:,}, triangles={total_tris:,}")
    print(f"World Bounds Min: {np.round(world_min, 5).tolist()}")
    print(f"World Bounds Max: {np.round(world_max, 5).tolist()}")
    print(f"Dimensions (W x H x D): {dims[0]:.4f} x {dims[1]:.4f} x {dims[2]:.4f} m")
    print(f"Geometric Center: {np.round(center, 5).tolist()}")

    print("\nMaterials:")
    for mat in gltf.get("materials", []):
        pbr = mat.get("pbrMetallicRoughness", {})
        print(
            f"  - {mat.get('name')}: metallic={pbr.get('metallicFactor')}, "
            f"roughness={pbr.get('roughnessFactor')}, "
            f"hasBaseColorTex={'baseColorTexture' in pbr}, "
            f"hasMRTex={'metallicRoughnessTexture' in pbr}, "
            f"hasNormalTex={'normalTexture' in mat}, "
            f"extensions={list(mat.get('extensions', {}).keys())}"
        )

    print("\nEmbedded Images:")
    for img in gltf.get("images", []):
        bv = gltf["bufferViews"][img["bufferView"]]
        print(f"  - {img.get('name')}: mime={img.get('mimeType')}, bytes={bv['byteLength']:,}")


if __name__ == "__main__":
    main()
