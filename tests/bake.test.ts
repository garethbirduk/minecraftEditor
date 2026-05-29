import { describe, it, expect } from "vitest";
import {
  Component,
  Library,
  createLibrary,
  addComponent,
} from "../src/core/model/composition.js";
import { bake, validate } from "../src/core/model/bake.js";
import { VoxelGrid, block } from "../src/core/model/grid.js";
import { transformGrid } from "../src/core/model/transform.js";

function leaf(id: string, g: VoxelGrid): Component {
  return { kind: "leaf", id, name: id, grid: g };
}

function singleBlock(name: string): VoxelGrid {
  const g = new VoxelGrid(1, 1, 1, [block(name)]);
  g.set(0, 0, 0, 0);
  return g;
}

describe("transforms", () => {
  it("rotates dimensions for 90°", () => {
    const g = new VoxelGrid(2, 1, 3, [block("minecraft:stone")]);
    g.set(0, 0, 0, 0); // corner marker
    const r = transformGrid(g, { rotationY: 90, mirror: "none" });
    expect(r.size).toEqual([3, 1, 2]); // x<->z swap
  });

  it("mirror-x reflects across the x axis", () => {
    const g = new VoxelGrid(3, 1, 1, [block("minecraft:stone")]);
    g.set(0, 0, 0, 0);
    const r = transformGrid(g, { rotationY: 0, mirror: "x" });
    expect(r.at(2, 0, 0)).toBe(0);
    expect(r.at(0, 0, 0)).toBe(-1);
  });
});

describe("bake", () => {
  it("places children at offsets and merges palettes", () => {
    const lib = createLibrary();
    addComponent(lib, leaf("a", singleBlock("minecraft:stone")));
    addComponent(lib, leaf("b", singleBlock("minecraft:glass")));
    const comp: Component = {
      kind: "composite",
      id: "row",
      name: "row",
      children: [
        { ref: "a", offset: [0, 0, 0], rotationY: 0, mirror: "none" },
        { ref: "b", offset: [2, 0, 0], rotationY: 0, mirror: "none" },
      ],
    };
    addComponent(lib, comp);

    const { grid, origin } = bake(lib, "row");
    expect(origin).toEqual([0, 0, 0]);
    expect(grid.size).toEqual([3, 1, 1]);
    expect(grid.blockAt(0, 0, 0)?.name).toBe("minecraft:stone");
    expect(grid.blockAt(2, 0, 0)?.name).toBe("minecraft:glass");
    expect(grid.at(1, 0, 0)).toBe(-1); // gap stays void
    expect(grid.palette.length).toBe(2);
  });

  it("expands an array modifier", () => {
    const lib = createLibrary();
    addComponent(lib, leaf("a", singleBlock("minecraft:stone")));
    addComponent(lib, {
      kind: "composite",
      id: "col",
      name: "col",
      children: [
        {
          ref: "a",
          offset: [0, 0, 0],
          rotationY: 0,
          mirror: "none",
          repeat: { count: 4, step: [0, 2, 0] },
        },
      ],
    });
    const { grid } = bake(lib, "col");
    expect(grid.sy).toBe(7); // blocks at y=0,2,4,6 -> height 7
    expect(grid.at(0, 0, 0)).not.toBe(-1);
    expect(grid.at(0, 6, 0)).not.toBe(-1);
    expect(grid.at(0, 1, 0)).toBe(-1);
  });

  it("nests composites (composite of composite)", () => {
    const lib = createLibrary();
    addComponent(lib, leaf("a", singleBlock("minecraft:stone")));
    addComponent(lib, {
      kind: "composite",
      id: "pair",
      name: "pair",
      children: [
        { ref: "a", offset: [0, 0, 0], rotationY: 0, mirror: "none" },
        { ref: "a", offset: [1, 0, 0], rotationY: 0, mirror: "none" },
      ],
    });
    addComponent(lib, {
      kind: "composite",
      id: "quad",
      name: "quad",
      children: [
        { ref: "pair", offset: [0, 0, 0], rotationY: 0, mirror: "none" },
        { ref: "pair", offset: [0, 0, 2], rotationY: 0, mirror: "none" },
      ],
    });
    const { grid } = bake(lib, "quad");
    expect(grid.size).toEqual([2, 1, 3]);
    expect(grid.at(0, 0, 0)).not.toBe(-1);
    expect(grid.at(1, 0, 2)).not.toBe(-1);
  });

  it("detects cycles", () => {
    const lib: Library = createLibrary();
    addComponent(lib, {
      kind: "composite",
      id: "x",
      name: "x",
      children: [{ ref: "y", offset: [0, 0, 0], rotationY: 0, mirror: "none" }],
    });
    addComponent(lib, {
      kind: "composite",
      id: "y",
      name: "y",
      children: [{ ref: "x", offset: [0, 0, 0], rotationY: 0, mirror: "none" }],
    });
    expect(validate(lib, "x").length).toBeGreaterThan(0);
    expect(() => bake(lib, "x")).toThrow(/cycle/i);
  });
});
