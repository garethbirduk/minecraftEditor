/**
 * Little-endian NBT writer (Bedrock flavour). The exact inverse of reader.ts.
 *
 * Bytes accumulate in a plain number[] and are flushed to a Uint8Array at the
 * end — simple and correct; structure files are small enough that a growable
 * typed-array buffer isn't worth the complexity here.
 */

import { NbtTag, TAG } from "./types.js";

export function writeNbt(name: string, root: NbtTag): Uint8Array {
  const w = new NbtWriter();
  w.u8(root.type);
  w.string(name);
  w.payload(root);
  return w.finish();
}

class NbtWriter {
  private readonly bytes: number[] = [];
  private readonly enc = new TextEncoder();
  private readonly tmp = new DataView(new ArrayBuffer(8));

  u8(v: number): void {
    this.bytes.push(v & 0xff);
  }
  private i16(v: number): void {
    this.tmp.setInt16(0, v, true);
    this.flush(2);
  }
  private i32(v: number): void {
    this.tmp.setInt32(0, v, true);
    this.flush(4);
  }
  private i64(v: bigint): void {
    this.tmp.setBigInt64(0, v, true);
    this.flush(8);
  }
  private f32(v: number): void {
    this.tmp.setFloat32(0, v, true);
    this.flush(4);
  }
  private f64(v: number): void {
    this.tmp.setFloat64(0, v, true);
    this.flush(8);
  }
  private flush(n: number): void {
    for (let i = 0; i < n; i++) this.bytes.push(this.tmp.getUint8(i));
  }

  string(s: string): void {
    const b = this.enc.encode(s);
    this.tmp.setUint16(0, b.length, true);
    this.flush(2);
    for (let i = 0; i < b.length; i++) this.bytes.push(b[i]!);
  }

  payload(tag: NbtTag): void {
    switch (tag.type) {
      case TAG.Byte:
        this.bytes.push(tag.value & 0xff);
        break;
      case TAG.Short:
        this.i16(tag.value);
        break;
      case TAG.Int:
        this.i32(tag.value);
        break;
      case TAG.Long:
        this.i64(tag.value);
        break;
      case TAG.Float:
        this.f32(tag.value);
        break;
      case TAG.Double:
        this.f64(tag.value);
        break;
      case TAG.ByteArray:
        this.i32(tag.value.length);
        for (let i = 0; i < tag.value.length; i++) this.bytes.push(tag.value[i]! & 0xff);
        break;
      case TAG.String:
        this.string(tag.value);
        break;
      case TAG.List:
        this.u8(tag.elementType);
        this.i32(tag.value.length);
        for (const el of tag.value) this.payload(el);
        break;
      case TAG.Compound:
        for (const [key, child] of tag.value) {
          this.u8(child.type);
          this.string(key);
          this.payload(child);
        }
        this.u8(TAG.End);
        break;
      case TAG.IntArray:
        this.i32(tag.value.length);
        for (let i = 0; i < tag.value.length; i++) this.i32(tag.value[i]!);
        break;
      case TAG.LongArray:
        this.i32(tag.value.length);
        for (let i = 0; i < tag.value.length; i++) this.i64(tag.value[i]!);
        break;
      default: {
        const _exhaustive: never = tag;
        throw new Error(`writeNbt: unhandled tag ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}
