/**
 * bake() — flatten a component tree into one VoxelGrid.
 *
 * Algorithm:
 *   1. Recursively bake each child to its own grid, then apply its transform.
 *   2. Expand array modifiers into concrete offsets.
 *   3. Compute the bounding box over all placed instances (offsets may be
 *      negative), allocate a result grid spanning it, and re-base to origin.
 *   4. Stamp each instance in placement order.
 *
 * Merge rule (documented + deliberate): later placements win. Source cells that
 * are EMPTY (structure void) never overwrite — so a stairwell stamped over a
 * shared wall only writes its solid blocks, leaving the wall intact. Source
 * cells that are explicit air DO overwrite (they clear). This matches Bedrock
 * structure-void vs air semantics.
 *
 * Cycles (a composite that transitively contains itself) are detected and
 * throw, rather than recursing forever.
 */

import {
  Component,
  ComponentId,
  CompositeComponent,
  Library,
  Placement,
  expandPlacement,
} from "./composition.js";
import { EMPTY, PaletteBuilder, Vec3, VoxelGrid } from "./grid.js";
import { transformGrid } from "./transform.js";

export interface BakeResult {
  grid: VoxelGrid;
  /** World-space offset of the grid's local origin (min corner of the bbox). */
  origin: Vec3;
}

export function bake(lib: Library, id: ComponentId): BakeResult {
  return bakeComponent(lib, id, new Set());
}

function bakeComponent(
  lib: Library,
  id: ComponentId,
  stack: Set<ComponentId>,
): BakeResult {
  const comp = lib.components.get(id);
  if (!comp) throw new Error(`bake: unknown component "${id}"`);
  if (stack.has(id)) {
    throw new Error(`bake: cycle detected through component "${id}"`);
  }

  if (comp.kind === "leaf") {
    return { grid: comp.grid.clone(), origin: [0, 0, 0] };
  }

  stack.add(id);
  const result = bakeComposite(lib, comp, stack);
  stack.delete(id);
  return result;
}

interface Instance {
  grid: VoxelGrid;
  offset: Vec3; // world-space offset of this instance's min corner
}

function bakeComposite(
  lib: Library,
  comp: CompositeComponent,
  stack: Set<ComponentId>,
): BakeResult {
  const instances: Instance[] = [];

  for (const child of comp.children) {
    const baked = bakeComponent(lib, child.ref, stack);
    const transformed = transformGrid(baked.grid, {
      rotationY: child.rotationY,
      mirror: child.mirror,
    });
    for (const inst of expandPlacement(child)) {
      instances.push({ grid: transformed, offset: addChildOrigin(inst.offset, baked.origin) });
    }
  }

  if (instances.length === 0) {
    return { grid: new VoxelGrid(0, 0, 0), origin: [0, 0, 0] };
  }

  // Bounding box across all instances.
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const { grid, offset } of instances) {
    minX = Math.min(minX, offset[0]);
    minY = Math.min(minY, offset[1]);
    minZ = Math.min(minZ, offset[2]);
    maxX = Math.max(maxX, offset[0] + grid.sx);
    maxY = Math.max(maxY, offset[1] + grid.sy);
    maxZ = Math.max(maxZ, offset[2] + grid.sz);
  }

  const sx = maxX - minX;
  const sy = maxY - minY;
  const sz = maxZ - minZ;

  // Re-intern palettes so the merged grid has a single coherent palette.
  const builder = new PaletteBuilder();
  const out = new VoxelGrid(sx, sy, sz, builder.palette);

  for (const { grid, offset } of instances) {
    const ox = offset[0] - minX;
    const oy = offset[1] - minY;
    const oz = offset[2] - minZ;
    const remap = new Int32Array(grid.palette.length);
    for (let i = 0; i < grid.palette.length; i++) {
      remap[i] = builder.intern(grid.palette[i]!);
    }
    for (let x = 0; x < grid.sx; x++) {
      for (let y = 0; y < grid.sy; y++) {
        for (let z = 0; z < grid.sz; z++) {
          const v = grid.cells[grid.index(x, y, z)]!;
          if (v === EMPTY) continue; // structure void: do not overwrite
          out.set(ox + x, oy + y, oz + z, remap[v]!);
        }
      }
    }
  }

  return { grid: out, origin: [minX, minY, minZ] };
}

function addChildOrigin(offset: Vec3, childOrigin: Vec3): Vec3 {
  return [
    offset[0] + childOrigin[0],
    offset[1] + childOrigin[1],
    offset[2] + childOrigin[2],
  ];
}

/** Recursively check a component is bakeable (refs exist, no cycles). */
export function validate(lib: Library, id: ComponentId): string[] {
  const errors: string[] = [];
  const visit = (cid: ComponentId, stack: Set<ComponentId>): void => {
    const comp = lib.components.get(cid);
    if (!comp) {
      errors.push(`Missing component "${cid}"`);
      return;
    }
    if (comp.kind === "leaf") return;
    if (stack.has(cid)) {
      errors.push(`Cycle through "${cid}"`);
      return;
    }
    stack.add(cid);
    for (const child of comp.children) visit(child.ref, stack);
    stack.delete(cid);
  };
  visit(id, new Set());
  return errors;
}

export type { Component, Placement };
