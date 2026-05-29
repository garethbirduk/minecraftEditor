import { describe, it, expect } from "vitest";
import {
  libraryToJSON,
  libraryFromJSON,
  encodeRLE,
  decodeRLE,
} from "../src/core/project/json.js";
import { buildDemoLibrary } from "../src/core/demo.js";
import { bake } from "../src/core/model/bake.js";

describe("RLE", () => {
  it("round-trips", () => {
    const src = Int32Array.from([-1, -1, -1, 0, 0, 2, -1]);
    const rle = encodeRLE(src);
    expect(rle).toEqual([-1, 3, 0, 2, 2, 1, -1, 1]);
    expect([...decodeRLE(rle, src.length)]).toEqual([...src]);
  });
});

describe("library JSON round-trip", () => {
  it("preserves components and bakes identically", () => {
    const { lib } = buildDemoLibrary();
    const json = libraryToJSON(lib);
    const back = libraryFromJSON(json);

    expect(back.components.size).toBe(lib.components.size);

    // The whole point: a JSON round-trip must bake to the same blocks.
    const before = bake(lib, "highrise").grid;
    const after = bake(back, "highrise").grid;
    expect(after.size).toEqual(before.size);
    expect([...after.cells]).toEqual([...before.cells]);
    expect(after.palette.map((b) => b.name)).toEqual(before.palette.map((b) => b.name));
  });

  it("serialises to compact JSON (composite source is tiny)", () => {
    const { lib } = buildDemoLibrary();
    const json = libraryToJSON(lib);
    const highrise = json.components.find((c) => c.id === "highrise");
    expect(highrise?.kind).toBe("composite");
    // The composite's JSON has no block data at all — just placements.
    expect(JSON.stringify(highrise).length).toBeLessThan(400);
  });
});
