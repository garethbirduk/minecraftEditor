import { describe, it, expect } from "vitest";
import {
  rotateStatesY,
  mirrorStates,
} from "../src/core/model/blockstate-transform.js";
import { transformGrid } from "../src/core/model/transform.js";
import { VoxelGrid, block } from "../src/core/model/grid.js";

describe("block-state rotation (90° CW: N->E->S->W)", () => {
  it("rotates minecraft:cardinal_direction one step", () => {
    expect(rotateStatesY({ "minecraft:cardinal_direction": "north" }, 1)).toEqual({
      "minecraft:cardinal_direction": "east",
    });
    expect(rotateStatesY({ "minecraft:cardinal_direction": "west" }, 1)).toEqual({
      "minecraft:cardinal_direction": "north",
    });
  });

  it("rotates stairs (weirdo_direction) consistently", () => {
    // 0=east per our map; one CW step -> south, which is weirdo 2.
    expect(rotateStatesY({ weirdo_direction: 0 }, 1)).toEqual({ weirdo_direction: 2 });
    // four steps is identity
    expect(rotateStatesY({ weirdo_direction: 3 }, 4)).toEqual({ weirdo_direction: 3 });
  });

  it("swaps pillar_axis x<->z on odd quarter-turns only", () => {
    expect(rotateStatesY({ pillar_axis: "x" }, 1)).toEqual({ pillar_axis: "z" });
    expect(rotateStatesY({ pillar_axis: "x" }, 2)).toEqual({ pillar_axis: "x" });
    expect(rotateStatesY({ pillar_axis: "y" }, 1)).toEqual({ pillar_axis: "y" });
  });

  it("leaves vertical facing_direction (up/down) untouched, rotates horizontals", () => {
    expect(rotateStatesY({ facing_direction: 1 }, 1)).toEqual({ facing_direction: 1 }); // up
    // 2=north -> east=5
    expect(rotateStatesY({ facing_direction: 2 }, 1)).toEqual({ facing_direction: 5 });
  });

  it("ignores non-directional states", () => {
    expect(rotateStatesY({ upside_down_bit: true, open_bit: false }, 1)).toEqual({
      upside_down_bit: true,
      open_bit: false,
    });
  });
});

describe("block-state mirror", () => {
  it("mirror-x swaps east<->west, keeps north/south", () => {
    expect(mirrorStates({ "minecraft:cardinal_direction": "east" }, "x")).toEqual({
      "minecraft:cardinal_direction": "west",
    });
    expect(mirrorStates({ "minecraft:cardinal_direction": "north" }, "x")).toEqual({
      "minecraft:cardinal_direction": "north",
    });
  });

  it("flips the door hinge bit on mirror", () => {
    expect(mirrorStates({ direction: 0, door_hinge_bit: false }, "x").door_hinge_bit).toBe(true);
  });
});

describe("transformGrid carries block states", () => {
  it("rotates the palette's directional state with the geometry", () => {
    const g = new VoxelGrid(1, 1, 1, [block("minecraft:oak_stairs", { weirdo_direction: 0 })]);
    g.set(0, 0, 0, 0);
    const r = transformGrid(g, { rotationY: 90, mirror: "none" });
    expect(r.blockAt(0, 0, 0)?.states["weirdo_direction"]).toBe(2);
    // original grid is untouched (no shared-palette mutation)
    expect(g.blockAt(0, 0, 0)?.states["weirdo_direction"]).toBe(0);
  });
});
