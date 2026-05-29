import { describe, it, expect } from "vitest";
import { readNbt } from "../src/core/nbt/reader.js";
import { writeNbt } from "../src/core/nbt/writer.js";
import {
  TAG,
  nbtCompound,
  nbtInt,
  nbtList,
  nbtString,
  nbtByte,
  nbtLong,
} from "../src/core/nbt/types.js";
import { parseMcStructure } from "../src/core/mcstructure/parse.js";
import { serializeMcStructure } from "../src/core/mcstructure/serialize.js";
import { VoxelGrid, block } from "../src/core/model/grid.js";

describe("NBT little-endian codec", () => {
  it("round-trips a mixed compound", () => {
    const root = nbtCompound({
      anInt: nbtInt(-12345),
      aByte: nbtByte(7),
      aLong: nbtLong(9007199254740993n),
      aString: nbtString("héllo 🌍"),
      aList: nbtList(TAG.Int, [nbtInt(1), nbtInt(2), nbtInt(3)]),
      nested: nbtCompound({ x: nbtInt(1) }),
    });
    const bytes = writeNbt("root", root);
    const { name, root: out } = readNbt(bytes);
    expect(name).toBe("root");
    expect(out).toEqual(root);
  });

  it("writes little-endian (int 1 => 01 00 00 00 payload)", () => {
    const bytes = writeNbt("", nbtInt(1));
    // type(3) + nameLen(00 00) + payload(01 00 00 00)
    expect([...bytes]).toEqual([3, 0, 0, 1, 0, 0, 0]);
  });
});

describe(".mcstructure round-trip", () => {
  it("survives parse -> serialize -> parse unchanged", () => {
    const g = new VoxelGrid(3, 2, 4, [block("minecraft:stone"), block("minecraft:glass")]);
    g.set(0, 0, 0, 0);
    g.set(2, 1, 3, 1);
    g.set(1, 0, 2, 0);

    const bytes = serializeMcStructure(g);
    const back = parseMcStructure(bytes);

    expect(back.size).toEqual([3, 2, 4]);
    expect(back.at(0, 0, 0)).toBe(g.at(0, 0, 0));
    expect(back.blockAt(2, 1, 3)?.name).toBe("minecraft:glass");
    expect(back.blockAt(1, 0, 2)?.name).toBe("minecraft:stone");
    // cells identical
    expect([...back.cells]).toEqual([...g.cells]);
  });
});
