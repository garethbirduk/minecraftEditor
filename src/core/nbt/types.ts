/**
 * NBT (Named Binary Tag) type model.
 *
 * Bedrock `.mcstructure` files are *little-endian, uncompressed* NBT — a
 * different byte layout from Java's big-endian (usually gzip-wrapped) NBT.
 * This module is the in-memory representation shared by the reader/writer.
 *
 * Tags are a discriminated union keyed on `type`, so a parsed tree is fully
 * type-safe to walk. 64-bit longs use `bigint` to avoid precision loss.
 */

export const TAG = {
  End: 0,
  Byte: 1,
  Short: 2,
  Int: 3,
  Long: 4,
  Float: 5,
  Double: 6,
  ByteArray: 7,
  String: 8,
  List: 9,
  Compound: 10,
  IntArray: 11,
  LongArray: 12,
} as const;

export type NbtTagType = (typeof TAG)[keyof typeof TAG];

export type NbtTag =
  | { type: typeof TAG.Byte; value: number }
  | { type: typeof TAG.Short; value: number }
  | { type: typeof TAG.Int; value: number }
  | { type: typeof TAG.Long; value: bigint }
  | { type: typeof TAG.Float; value: number }
  | { type: typeof TAG.Double; value: number }
  | { type: typeof TAG.ByteArray; value: Int8Array }
  | { type: typeof TAG.String; value: string }
  | { type: typeof TAG.List; elementType: NbtTagType; value: NbtTag[] }
  | { type: typeof TAG.Compound; value: Map<string, NbtTag> }
  | { type: typeof TAG.IntArray; value: Int32Array }
  | { type: typeof TAG.LongArray; value: BigInt64Array };

export type CompoundTag = Extract<NbtTag, { type: typeof TAG.Compound }>;
export type ListTag = Extract<NbtTag, { type: typeof TAG.List }>;

// ---- Tiny constructors (keep call sites readable) -----------------------

export const nbtByte = (value: number): NbtTag => ({ type: TAG.Byte, value });
export const nbtShort = (value: number): NbtTag => ({ type: TAG.Short, value });
export const nbtInt = (value: number): NbtTag => ({ type: TAG.Int, value });
export const nbtLong = (value: bigint): NbtTag => ({ type: TAG.Long, value });
export const nbtFloat = (value: number): NbtTag => ({ type: TAG.Float, value });
export const nbtString = (value: string): NbtTag => ({ type: TAG.String, value });

export function nbtList(elementType: NbtTagType, value: NbtTag[]): ListTag {
  return { type: TAG.List, elementType, value };
}

export function nbtCompound(
  entries?: Record<string, NbtTag> | Map<string, NbtTag>,
): CompoundTag {
  const map =
    entries instanceof Map
      ? entries
      : new Map<string, NbtTag>(entries ? Object.entries(entries) : []);
  return { type: TAG.Compound, value: map };
}

export function nbtIntArray(value: Int32Array): NbtTag {
  return { type: TAG.IntArray, value };
}
