/**
 * Library <-> JSON: the project's source of truth.
 *
 * Composites serialise to almost nothing (a few placements). Leaves carry the
 * real block data, stored as a palette + run-length-encoded cell indices —
 * structures are mostly long runs of air / the same block, so RLE keeps even
 * large leaves small. The expensive `.mcstructure` files are *generated* from
 * this, never hand-stored.
 */

import {
  Component,
  Library,
  Placement,
  createLibrary,
} from "../model/composition.js";
import { BlockState, VoxelGrid } from "../model/grid.js";

export const LIBRARY_JSON_VERSION = 1;

export interface LeafJSON {
  kind: "leaf";
  id: string;
  name: string;
  size: [number, number, number];
  palette: BlockState[];
  /** RLE pairs: [value, count, value, count, ...]; value -1 = void. */
  cells: number[];
}
export interface CompositeJSON {
  kind: "composite";
  id: string;
  name: string;
  children: Placement[];
}
export type ComponentJSON = LeafJSON | CompositeJSON;

/** Optional aggregate form (kept for tests / bulk transport). The on-disk
 *  library is a *folder of per-component files*, one ComponentJSON each. */
export interface LibraryJSON {
  version: number;
  components: ComponentJSON[];
}

// ---- RLE ----------------------------------------------------------------

export function encodeRLE(cells: Int32Array): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < cells.length) {
    const v = cells[i]!;
    let n = 1;
    while (i + n < cells.length && cells[i + n] === v) n++;
    out.push(v, n);
    i += n;
  }
  return out;
}

export function decodeRLE(rle: number[], volume: number): Int32Array {
  const cells = new Int32Array(volume);
  let idx = 0;
  for (let k = 0; k + 1 < rle.length; k += 2) {
    const v = rle[k]!;
    const n = rle[k + 1]!;
    for (let j = 0; j < n && idx < volume; j++) cells[idx++] = v;
  }
  return cells;
}

// ---- convert ------------------------------------------------------------

/** One component <-> one JSON object (one file on disk). */
export function componentToJSON(c: Component): ComponentJSON {
  if (c.kind === "leaf") {
    return {
      kind: "leaf",
      id: c.id,
      name: c.name,
      size: [c.grid.sx, c.grid.sy, c.grid.sz],
      palette: c.grid.palette,
      cells: encodeRLE(c.grid.cells),
    };
  }
  return { kind: "composite", id: c.id, name: c.name, children: c.children };
}

export function componentFromJSON(c: ComponentJSON): Component {
  if (c.kind === "leaf") {
    const [sx, sy, sz] = c.size;
    const grid = new VoxelGrid(sx, sy, sz, c.palette);
    grid.cells.set(decodeRLE(c.cells, sx * sy * sz));
    return { kind: "leaf", id: c.id, name: c.name, grid };
  }
  return { kind: "composite", id: c.id, name: c.name, children: c.children };
}

/** Build a Library from a set of per-component JSON objects (the folder load). */
export function libraryFromComponents(components: ComponentJSON[]): Library {
  const lib = createLibrary();
  for (const c of components) lib.components.set(c.id, componentFromJSON(c));
  return lib;
}

export function libraryToJSON(lib: Library): LibraryJSON {
  return {
    version: LIBRARY_JSON_VERSION,
    components: [...lib.components.values()].map(componentToJSON),
  };
}

export function libraryFromJSON(json: LibraryJSON): Library {
  return libraryFromComponents(json.components);
}
