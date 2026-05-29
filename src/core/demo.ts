/**
 * A built-in demo library so the app shows the composition idea immediately,
 * with no file to import. It builds, bottom-up:
 *
 *   apartment (leaf)  — a small room shell with a window
 *   stairwell (leaf)  — a narrow shaft with steps
 *   floor (composite) — LHS apartment + mirrored RHS apartment + stairwell
 *   tower (composite) — floor repeated 12× up the Y axis (array modifier)
 *
 * Edit the `apartment` leaf and every floor of every tower updates — that's
 * the whole point.
 */

import {
  Component,
  Library,
  createLibrary,
  addComponent,
} from "./model/composition.js";
import { PaletteBuilder, VoxelGrid, block } from "./model/grid.js";

const FLOOR_HEIGHT = 5; // 4 walls + ceiling
const APT_W = 7;
const APT_D = 7;
const STAIR_W = 3;

function makeApartment(): VoxelGrid {
  const pb = new PaletteBuilder();
  const wall = pb.intern(block("minecraft:light_gray_concrete"));
  const floorIdx = pb.intern(block("minecraft:oak_planks"));
  const glass = pb.intern(block("minecraft:glass"));

  const g = new VoxelGrid(APT_W, FLOOR_HEIGHT, APT_D, pb.palette);
  for (let x = 0; x < APT_W; x++) {
    for (let z = 0; z < APT_D; z++) {
      g.set(x, 0, z, floorIdx); // floor slab
      const edge = x === 0 || x === APT_W - 1 || z === 0 || z === APT_D - 1;
      if (!edge) continue;
      for (let y = 1; y < FLOOR_HEIGHT - 1; y++) {
        // A window band on the front (z=0) wall, otherwise solid.
        const isWindow = z === 0 && x > 1 && x < APT_W - 2 && y >= 2 && y <= 2;
        g.set(x, y, z, isWindow ? glass : wall);
      }
    }
  }
  return g;
}

function makeStairwell(): VoxelGrid {
  const pb = new PaletteBuilder();
  const wall = pb.intern(block("minecraft:gray_concrete"));
  const step = pb.intern(block("minecraft:stone"));

  const g = new VoxelGrid(STAIR_W, FLOOR_HEIGHT, APT_D, pb.palette);
  for (let x = 0; x < STAIR_W; x++) {
    for (let z = 0; z < APT_D; z++) {
      const edge = x === 0 || x === STAIR_W - 1 || z === 0 || z === APT_D - 1;
      for (let y = 0; y < FLOOR_HEIGHT; y++) {
        if (y === 0) g.set(x, y, z, step);
        else if (edge && y < FLOOR_HEIGHT - 1) g.set(x, y, z, wall);
      }
    }
  }
  // A simple flight of steps climbing in +z.
  for (let i = 0; i < APT_D && i + 1 < FLOOR_HEIGHT; i++) {
    g.set(1, i + 1, i, step);
  }
  return g;
}

export interface DemoLibrary {
  lib: Library;
  /** id of the top-level component to show first. */
  rootId: string;
}

export function buildDemoLibrary(): DemoLibrary {
  const lib = createLibrary();

  const apartment: Component = {
    kind: "leaf",
    id: "apartment",
    name: "Apartment (shell)",
    grid: makeApartment(),
  };
  const stairwell: Component = {
    kind: "leaf",
    id: "stairwell",
    name: "Stairwell",
    grid: makeStairwell(),
  };
  addComponent(lib, apartment);
  addComponent(lib, stairwell);

  // One floor: LHS apartment, stairwell in the middle, mirrored RHS apartment.
  const floor: Component = {
    kind: "composite",
    id: "floor",
    name: "Floor (L + stair + R)",
    children: [
      { ref: "apartment", offset: [0, 0, 0], rotationY: 0, mirror: "none", label: "LHS apartment" },
      { ref: "stairwell", offset: [APT_W, 0, 0], rotationY: 0, mirror: "none", label: "Stairwell" },
      {
        ref: "apartment",
        offset: [APT_W + STAIR_W, 0, 0],
        rotationY: 0,
        mirror: "x",
        label: "RHS apartment (mirrored)",
      },
    ],
  };
  addComponent(lib, floor);

  // Tower: the floor repeated up the Y axis.
  const tower: Component = {
    kind: "composite",
    id: "highrise",
    name: "Tower (floor ×2)",
    children: [
      {
        ref: "floor",
        offset: [0, 0, 0],
        rotationY: 0,
        mirror: "none",
        label: "Floors",
        repeat: { count: 2, step: [0, FLOOR_HEIGHT, 0] },
      },
    ],
  };
  addComponent(lib, tower);

  return { lib, rootId: "highrise" };
}
