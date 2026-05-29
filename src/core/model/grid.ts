/**
 * VoxelGrid — the editor's working representation of a block volume.
 *
 * This is deliberately decoupled from the `.mcstructure` NBT layout so the
 * rest of the app (rendering, composition, editing) never touches NBT. The
 * parse/serialize bridge in `../mcstructure/` converts to and from this.
 *
 * Storage: a dense Int32Array of palette indices, one per cell. The special
 * value EMPTY (-1) means "structure void" — no block, does not overwrite when
 * stamped during a bake. `minecraft:air` is a *real* palette entry and DOES
 * overwrite (i.e. explicitly clears a cell). This mirrors Bedrock semantics.
 */

export const EMPTY = -1;

export type Vec3 = readonly [number, number, number];

/** One entry in a grid's palette: a fully-qualified block state. */
export interface BlockState {
  /** e.g. "minecraft:stone" */
  name: string;
  /** Block state properties, e.g. { pillar_axis: "y" }. Empty for plain blocks. */
  states: Record<string, string | number | boolean>;
  /** Bedrock block version int (kept for round-trip fidelity). */
  version: number;
}

export class VoxelGrid {
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  /** Palette index per cell, row-major in (x, y, z); EMPTY = void. */
  readonly cells: Int32Array;
  /** Unique block states; cells index into this. */
  readonly palette: BlockState[];

  constructor(sx: number, sy: number, sz: number, palette: BlockState[] = []) {
    this.sx = sx;
    this.sy = sy;
    this.sz = sz;
    this.cells = new Int32Array(Math.max(0, sx * sy * sz)).fill(EMPTY);
    this.palette = palette;
  }

  get size(): Vec3 {
    return [this.sx, this.sy, this.sz];
  }
  get volume(): number {
    return this.sx * this.sy * this.sz;
  }

  /**
   * Flat index for (x, y, z). Ordering is X-major, then Y, then Z-minor —
   * this matches the `.mcstructure` `block_indices` convention. Centralised
   * here so the axis order can be verified/flipped in exactly one place.
   */
  index(x: number, y: number, z: number): number {
    return (x * this.sy + y) * this.sz + z;
  }

  inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz;
  }

  /** Palette index at a cell, or EMPTY if out of bounds. */
  at(x: number, y: number, z: number): number {
    if (!this.inBounds(x, y, z)) return EMPTY;
    return this.cells[this.index(x, y, z)]!;
  }

  blockAt(x: number, y: number, z: number): BlockState | null {
    const i = this.at(x, y, z);
    return i === EMPTY ? null : this.palette[i] ?? null;
  }

  set(x: number, y: number, z: number, paletteIndex: number): void {
    if (!this.inBounds(x, y, z)) return;
    this.cells[this.index(x, y, z)] = paletteIndex;
  }

  clone(): VoxelGrid {
    const g = new VoxelGrid(this.sx, this.sy, this.sz, this.palette.map(cloneBlockState));
    g.cells.set(this.cells);
    return g;
  }
}

export function cloneBlockState(b: BlockState): BlockState {
  return { name: b.name, states: { ...b.states }, version: b.version };
}

/** Stable key for de-duplicating block states in a palette. */
export function blockStateKey(b: BlockState): string {
  const keys = Object.keys(b.states).sort();
  const props = keys.map((k) => `${k}=${String(b.states[k])}`).join(",");
  return `${b.name}|${props}|${b.version}`;
}

export function isAir(b: BlockState | null): boolean {
  return b != null && (b.name === "minecraft:air" || b.name === "air");
}

/**
 * A PaletteBuilder de-duplicates block states as a grid is assembled and
 * hands back the index for each. Used by the bake step and the demo builder.
 */
export class PaletteBuilder {
  readonly palette: BlockState[] = [];
  private readonly byKey = new Map<string, number>();

  intern(b: BlockState): number {
    const key = blockStateKey(b);
    const existing = this.byKey.get(key);
    if (existing !== undefined) return existing;
    const idx = this.palette.length;
    this.palette.push(cloneBlockState(b));
    this.byKey.set(key, idx);
    return idx;
  }
}

/** Convenience for the common "just a block name" case. */
export function block(name: string, states: Record<string, string | number | boolean> = {}): BlockState {
  return { name, states, version: DEFAULT_BLOCK_VERSION };
}

/**
 * A recent Bedrock block-data version int. Exact value only matters for
 * byte-perfect parity with a specific game build; any modern value loads
 * fine. Encodes 1.21.x-era versioning (major.minor.patch.revision packed).
 */
export const DEFAULT_BLOCK_VERSION = 18168865;
