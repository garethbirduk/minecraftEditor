/**
 * VoxelGrid -> `.mcstructure` (NBT bytes).
 *
 * Produces a minimal-but-valid Bedrock structure: format_version 1, a two-layer
 * block_indices (layer 1 filled with -1 / no waterlogging), the block palette,
 * and empty entities. Block-entity / entity data is not emitted in v1, so
 * composed structures export geometry + block states only (see README).
 *
 * `structure_world_origin` is written as [0,0,0] — placement position is chosen
 * at load time in-game, so the saved origin is not meaningful for a library.
 */

import { writeNbt } from "../nbt/writer.js";
import {
  CompoundTag,
  NbtTag,
  TAG,
  nbtByte,
  nbtCompound,
  nbtInt,
  nbtList,
  nbtString,
} from "../nbt/types.js";
import { BlockState, VoxelGrid } from "../model/grid.js";

export function serializeMcStructure(grid: VoxelGrid): Uint8Array {
  const root = buildRoot(grid);
  return writeNbt("", root);
}

function buildRoot(grid: VoxelGrid): NbtTag {
  const layer0: NbtTag[] = new Array(grid.volume);
  const layer1: NbtTag[] = new Array(grid.volume);
  for (let i = 0; i < grid.volume; i++) {
    layer0[i] = nbtInt(grid.cells[i]!);
    layer1[i] = nbtInt(-1);
  }

  const blockPalette = grid.palette.map((b) => buildBlockState(b));

  const structure = nbtCompound({
    block_indices: nbtList(TAG.List, [
      nbtList(TAG.Int, layer0),
      nbtList(TAG.Int, layer1),
    ]),
    entities: nbtList(TAG.Compound, []),
    palette: nbtCompound({
      default: nbtCompound({
        block_palette: nbtList(TAG.Compound, blockPalette),
        // Per-cell extra data (block entities) lives here in real files; we
        // emit an empty compound so tools that expect the key still parse.
        block_position_data: nbtCompound({}),
      }),
    }),
  });

  return nbtCompound({
    format_version: nbtInt(1),
    size: nbtList(TAG.Int, [nbtInt(grid.sx), nbtInt(grid.sy), nbtInt(grid.sz)]),
    structure,
    structure_world_origin: nbtList(TAG.Int, [nbtInt(0), nbtInt(0), nbtInt(0)]),
  });
}

function buildBlockState(b: BlockState): CompoundTag {
  return nbtCompound({
    name: nbtString(b.name),
    states: buildStates(b.states),
    version: nbtInt(b.version),
  });
}

function buildStates(states: Record<string, string | number | boolean>): CompoundTag {
  const c = nbtCompound();
  for (const [k, v] of Object.entries(states)) {
    if (typeof v === "string") c.value.set(k, nbtString(v));
    else if (typeof v === "boolean") c.value.set(k, nbtByte(v ? 1 : 0));
    else if (Number.isInteger(v)) c.value.set(k, nbtInt(v));
    else c.value.set(k, nbtString(String(v)));
  }
  return c;
}
