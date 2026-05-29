/**
 * Geometric transforms of a VoxelGrid: 90° rotations about Y and mirroring.
 *
 * IMPORTANT v1 limitation: these transform block *positions* only. Block
 * *states* (stair facing, log axis, door hinge, etc.) are carried through
 * unchanged. For plain cubes (walls, glass, concrete) the result is already
 * correct; directional blocks will face their original way until a per-block
 * state-rotation table is added. Minecraft's own structure-load rotation does
 * fix block states, so for actual in-game placement you can lean on that and
 * keep components in one canonical orientation. See README "Roadmap".
 */

import { EMPTY, VoxelGrid } from "./grid.js";
import { mirrorBlockState, rotateBlockStateY } from "./blockstate-transform.js";

export type RotationY = 0 | 90 | 180 | 270;
export type Mirror = "none" | "x" | "z";

export interface Transform {
  rotationY: RotationY;
  mirror: Mirror;
}

export const IDENTITY: Transform = { rotationY: 0, mirror: "none" };

/** Apply mirror (first), then Y-rotation, returning a new grid. */
export function transformGrid(src: VoxelGrid, t: Transform): VoxelGrid {
  let g = src;
  if (t.mirror !== "none") g = mirrorGrid(g, t.mirror);
  if (t.rotationY !== 0) g = rotateGridY(g, t.rotationY);
  return g;
}

function mirrorGrid(src: VoxelGrid, axis: "x" | "z"): VoxelGrid {
  // New palette with directional block states reflected (E<->W or N<->S).
  const palette = src.palette.map((b) => mirrorBlockState(b, axis));
  const out = new VoxelGrid(src.sx, src.sy, src.sz, palette);
  for (let x = 0; x < src.sx; x++) {
    for (let y = 0; y < src.sy; y++) {
      for (let z = 0; z < src.sz; z++) {
        const v = src.cells[src.index(x, y, z)]!;
        if (v === EMPTY) continue;
        const nx = axis === "x" ? src.sx - 1 - x : x;
        const nz = axis === "z" ? src.sz - 1 - z : z;
        out.cells[out.index(nx, y, nz)] = v;
      }
    }
  }
  return out;
}

function rotateGridY(src: VoxelGrid, deg: RotationY): VoxelGrid {
  // Rotation about +Y (looking down). Dimensions swap for 90/270.
  const swaps = deg === 90 || deg === 270;
  const nsx = swaps ? src.sz : src.sx;
  const nsz = swaps ? src.sx : src.sz;
  // New palette with directional block states rotated by the same angle.
  const steps = deg / 90;
  const palette = src.palette.map((b) => rotateBlockStateY(b, steps));
  const out = new VoxelGrid(nsx, src.sy, nsz, palette);
  for (let x = 0; x < src.sx; x++) {
    for (let z = 0; z < src.sz; z++) {
      let nx: number;
      let nz: number;
      switch (deg) {
        case 90:
          nx = src.sz - 1 - z;
          nz = x;
          break;
        case 180:
          nx = src.sx - 1 - x;
          nz = src.sz - 1 - z;
          break;
        case 270:
          nx = z;
          nz = src.sx - 1 - x;
          break;
        default:
          nx = x;
          nz = z;
      }
      for (let y = 0; y < src.sy; y++) {
        const v = src.cells[src.index(x, y, z)]!;
        if (v === EMPTY) continue;
        out.cells[out.index(nx, y, nz)] = v;
      }
    }
  }
  return out;
}
