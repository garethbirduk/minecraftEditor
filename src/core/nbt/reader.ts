/**
 * Little-endian NBT reader (Bedrock flavour).
 *
 * Reading is the easy direction; the only Bedrock-specific details are:
 *   - every multi-byte number is little-endian,
 *   - strings are `u16(LE) length` + UTF-8 bytes (Java uses big-endian
 *     + "modified UTF-8"),
 *   - the file is *not* gzip-compressed.
 */

import { NbtTag, NbtTagType, TAG } from "./types.js";

export interface NbtDocument {
  /** Root tag name — empty string for `.mcstructure`. */
  name: string;
  root: NbtTag;
}

export function readNbt(buffer: ArrayBuffer | Uint8Array): NbtDocument {
  const r = new NbtReader(buffer);
  const type = r.u8() as NbtTagType;
  if (type === TAG.End) throw new Error("readNbt: empty document (root TAG_End)");
  const name = r.string();
  const root = r.payload(type);
  return { name, root };
}

class NbtReader {
  private readonly dv: DataView;
  private off = 0;
  private readonly dec = new TextDecoder("utf-8");

  constructor(buffer: ArrayBuffer | Uint8Array) {
    if (buffer instanceof Uint8Array) {
      this.dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    } else {
      this.dv = new DataView(buffer);
    }
  }

  u8(): number {
    const v = this.dv.getUint8(this.off);
    this.off += 1;
    return v;
  }
  private i8(): number {
    const v = this.dv.getInt8(this.off);
    this.off += 1;
    return v;
  }
  private i16(): number {
    const v = this.dv.getInt16(this.off, true);
    this.off += 2;
    return v;
  }
  private i32(): number {
    const v = this.dv.getInt32(this.off, true);
    this.off += 4;
    return v;
  }
  private i64(): bigint {
    const v = this.dv.getBigInt64(this.off, true);
    this.off += 8;
    return v;
  }
  private f32(): number {
    const v = this.dv.getFloat32(this.off, true);
    this.off += 4;
    return v;
  }
  private f64(): number {
    const v = this.dv.getFloat64(this.off, true);
    this.off += 8;
    return v;
  }

  string(): string {
    const len = this.dv.getUint16(this.off, true);
    this.off += 2;
    const bytes = new Uint8Array(this.dv.buffer, this.dv.byteOffset + this.off, len);
    this.off += len;
    return this.dec.decode(bytes);
  }

  payload(type: NbtTagType): NbtTag {
    switch (type) {
      case TAG.Byte:
        return { type, value: this.i8() };
      case TAG.Short:
        return { type, value: this.i16() };
      case TAG.Int:
        return { type, value: this.i32() };
      case TAG.Long:
        return { type, value: this.i64() };
      case TAG.Float:
        return { type, value: this.f32() };
      case TAG.Double:
        return { type, value: this.f64() };
      case TAG.ByteArray: {
        const len = this.i32();
        const arr = new Int8Array(len);
        for (let i = 0; i < len; i++) arr[i] = this.i8();
        return { type, value: arr };
      }
      case TAG.String:
        return { type, value: this.string() };
      case TAG.List: {
        const elementType = this.u8() as NbtTagType;
        const len = this.i32();
        const value: NbtTag[] = [];
        for (let i = 0; i < len; i++) value.push(this.payload(elementType));
        return { type, elementType, value };
      }
      case TAG.Compound: {
        const value = new Map<string, NbtTag>();
        for (;;) {
          const childType = this.u8() as NbtTagType;
          if (childType === TAG.End) break;
          const childName = this.string();
          value.set(childName, this.payload(childType));
        }
        return { type, value };
      }
      case TAG.IntArray: {
        const len = this.i32();
        const arr = new Int32Array(len);
        for (let i = 0; i < len; i++) arr[i] = this.i32();
        return { type, value: arr };
      }
      case TAG.LongArray: {
        const len = this.i32();
        const arr = new BigInt64Array(len);
        for (let i = 0; i < len; i++) arr[i] = this.i64();
        return { type, value: arr };
      }
      default:
        throw new Error(`readNbt: unknown tag type ${type} at offset ${this.off}`);
    }
  }
}
