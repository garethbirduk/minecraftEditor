/**
 * `.mcstructure` (NBT) -> VoxelGrid.
 *
 * Layout of a Bedrock structure file (root is an unnamed compound):
 *   format_version : Int
 *   size           : List<Int>[3]            // [sx, sy, sz]
 *   structure      : Compound
 *     block_indices    : List<List<Int>>     // [layer0, layer1]; -1 = void
 *     palette          : Compound
 *       default        : Compound
 *         block_palette : List<Compound>      // { name, states, version }
 *     entities         : List<Compound>       // preserved-by-ignore in v1
 *
 * v1 reads layer 0 (the block layer). Layer 1 (waterlogging) and block-entity
 * / entity data are not surfaced into the grid model yet — see README.
 */

import { readNbt } from "../nbt/reader.js";
import { CompoundTag, ListTag, NbtTag, TAG } from "../nbt/types.js";
import { BlockState, EMPTY, VoxelGrid } from "../model/grid.js";

export function parseMcStructure(buffer: ArrayBuffer | Uint8Array): VoxelGrid {
  const { root } = readNbt(buffer);
  const rootC = expectCompound(root, "<root>");

  const size = expectList(get(rootC, "size"), "size");
  const sx = intAt(size, 0);
  const sy = intAt(size, 1);
  const sz = intAt(size, 2);

  const structure = expectCompound(get(rootC, "structure"), "structure");
  const indices = expectList(get(structure, "block_indices"), "block_indices");
  const layer0 = expectList(indices.value[0] ?? null, "block_indices[0]");

  const paletteC = expectCompound(get(structure, "palette"), "palette");
  const defaultC = expectCompound(get(paletteC, "default"), "palette.default");
  const blockPalette = expectList(get(defaultC, "block_palette"), "block_palette");

  const palette: BlockState[] = blockPalette.value.map((entry, i) =>
    readBlockState(expectCompound(entry, `block_palette[${i}]`)),
  );

  const grid = new VoxelGrid(sx, sy, sz, palette);
  const expected = sx * sy * sz;
  if (layer0.value.length !== expected) {
    throw new Error(
      `parseMcStructure: block_indices length ${layer0.value.length} != volume ${expected}`,
    );
  }
  for (let i = 0; i < expected; i++) {
    const idx = numberValue(layer0.value[i]!);
    grid.cells[i] = idx < 0 ? EMPTY : idx;
  }
  return grid;
}

function readBlockState(c: CompoundTag): BlockState {
  const name = stringValue(get(c, "name"), "minecraft:air");
  const version = optInt(get(c, "version"), 0);
  const states: Record<string, string | number | boolean> = {};
  const statesTag = c.value.get("states");
  if (statesTag && statesTag.type === TAG.Compound) {
    for (const [k, v] of statesTag.value) {
      states[k] = scalarValue(v);
    }
  }
  return { name, states, version };
}

// ---- small typed accessors ---------------------------------------------

function get(c: CompoundTag, key: string): NbtTag | null {
  return c.value.get(key) ?? null;
}

function expectCompound(tag: NbtTag | null, where: string): CompoundTag {
  if (!tag || tag.type !== TAG.Compound) {
    throw new Error(`parseMcStructure: expected compound at ${where}`);
  }
  return tag;
}

function expectList(tag: NbtTag | null, where: string): ListTag {
  if (!tag || tag.type !== TAG.List) {
    throw new Error(`parseMcStructure: expected list at ${where}`);
  }
  return tag;
}

function intAt(list: ListTag, i: number): number {
  const el = list.value[i];
  if (!el) throw new Error(`parseMcStructure: missing list element ${i}`);
  return numberValue(el);
}

function numberValue(tag: NbtTag): number {
  switch (tag.type) {
    case TAG.Byte:
    case TAG.Short:
    case TAG.Int:
    case TAG.Float:
    case TAG.Double:
      return tag.value;
    case TAG.Long:
      return Number(tag.value);
    default:
      throw new Error(`parseMcStructure: expected number, got tag type ${tag.type}`);
  }
}

function scalarValue(tag: NbtTag): string | number | boolean {
  switch (tag.type) {
    case TAG.Byte:
      // Bedrock encodes booleans as bytes; expose 0/1 as boolean for legibility.
      return tag.value === 0 || tag.value === 1 ? tag.value === 1 : tag.value;
    case TAG.Short:
    case TAG.Int:
    case TAG.Float:
    case TAG.Double:
      return tag.value;
    case TAG.Long:
      return Number(tag.value);
    case TAG.String:
      return tag.value;
    default:
      return String(tag.type);
  }
}

function stringValue(tag: NbtTag | null, fallback: string): string {
  return tag && tag.type === TAG.String ? tag.value : fallback;
}

function optInt(tag: NbtTag | null, fallback: number): number {
  return tag ? numberValue(tag) : fallback;
}
