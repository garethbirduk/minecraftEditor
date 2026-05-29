/**
 * The composition model — the editor's reason to exist.
 *
 * A *component* is either:
 *   - a LEAF: an actual block volume (a parsed `.mcstructure`, or painted), or
 *   - a COMPOSITE: no blocks of its own, just placements of *other* components,
 *     each with an offset + transform, plus an optional array modifier (repeat).
 *
 * Composites can reference composites, so you get:
 *   leaf (apartment) → composite (floor: LHS + mirrored RHS + stairwell)
 *                    → composite (tower: floor ×12) → composite (block) → city.
 *
 * Editing a leaf propagates everywhere it's used, because composites store
 * references, not copies. `bake()` flattens a tree to a single VoxelGrid for
 * rendering or export.
 */

import { Vec3, VoxelGrid } from "./grid.js";
import { Mirror, RotationY } from "./transform.js";

export type ComponentId = string;

export interface Placement {
  /** Component being placed. */
  ref: ComponentId;
  /** Offset of the placed component's local origin within the parent. */
  offset: Vec3;
  rotationY: RotationY;
  mirror: Mirror;
  /**
   * Array modifier: repeat the placement `count` times, advancing by `step`
   * each time. count=1 (or absent) means a single placement.
   */
  repeat?: { count: number; step: Vec3 };
  /** UI label for this placement (e.g. "RHS apartment"). */
  label?: string;
}

export interface LeafComponent {
  kind: "leaf";
  id: ComponentId;
  name: string;
  grid: VoxelGrid;
}

export interface CompositeComponent {
  kind: "composite";
  id: ComponentId;
  name: string;
  children: Placement[];
}

export type Component = LeafComponent | CompositeComponent;

/** A library is a flat, id-addressable bag of components. */
export interface Library {
  components: Map<ComponentId, Component>;
}

export function createLibrary(): Library {
  return { components: new Map() };
}

export function addComponent(lib: Library, c: Component): Component {
  lib.components.set(c.id, c);
  return c;
}

/** Expand a placement's array modifier into concrete (offset, transform) instances. */
export function expandPlacement(p: Placement): Array<{ offset: Vec3 }> {
  const count = p.repeat ? Math.max(1, Math.floor(p.repeat.count)) : 1;
  const step = p.repeat?.step ?? ([0, 0, 0] as Vec3);
  const out: Array<{ offset: Vec3 }> = [];
  for (let k = 0; k < count; k++) {
    out.push({
      offset: [
        p.offset[0] + step[0] * k,
        p.offset[1] + step[1] * k,
        p.offset[2] + step[2] * k,
      ],
    });
  }
  return out;
}

/** Total placement count a composite expands to (for stats / UI). */
export function placementCount(c: CompositeComponent): number {
  return c.children.reduce(
    (n, p) => n + (p.repeat ? Math.max(1, Math.floor(p.repeat.count)) : 1),
    0,
  );
}
