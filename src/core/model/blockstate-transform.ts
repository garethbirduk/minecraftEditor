/**
 * Block-state transforms under 90° Y-rotation and mirroring.
 *
 * Rotating/mirroring a structure must rewrite *directional* block states, not
 * just move blocks — otherwise a rotated staircase keeps pointing the old way.
 * This module maps the common Bedrock orientation states.
 *
 * CONSISTENCY: the rotation here matches the position rotation in transform.ts
 * (`rotateGridY`), whose linear map sends a facing vector (dx,dz) -> (-dz,dx).
 * Working that through the cardinals gives one clockwise step:
 *   N -> E -> S -> W -> N      (one 90° step)
 * and mirror-x (flip the X axis) swaps E<->W, mirror-z swaps N<->S. Position
 * and facing therefore transform together.
 *
 * Confidence per state key:
 *   HIGH  — pillar_axis, minecraft:cardinal_direction, facing_direction,
 *           weirdo_direction (stairs), torch_facing_direction, door_hinge_bit
 *   BEST-EFFORT — direction (0-3), ground_sign_direction (0-15): structurally
 *           correct rotation; the base zero/handedness may be off by a constant
 *           for some blocks — a one-line fix in the maps below if so.
 */

import { BlockState, cloneBlockState } from "./grid.js";

type Cardinal = "north" | "east" | "south" | "west";

/** Clockwise order — advancing by `steps` is a steps×90° rotation. */
const CW: Cardinal[] = ["north", "east", "south", "west"];

function rotateCardinal(c: Cardinal, steps: number): Cardinal {
  return CW[(CW.indexOf(c) + steps + 4) % 4]!;
}
function mirrorCardinal(c: Cardinal, axis: "x" | "z"): Cardinal {
  if (axis === "x") return c === "east" ? "west" : c === "west" ? "east" : c;
  return c === "north" ? "south" : c === "south" ? "north" : c;
}

// ---- numeric encodings (value <-> cardinal) -----------------------------

// Stairs. Long-standing Bedrock mapping. (HIGH)
const WEIRDO: Record<number, Cardinal> = { 0: "east", 1: "west", 2: "south", 3: "north" };
// facing_direction 0-5: 0 down, 1 up, then horizontals. (HIGH)
const FACING: Record<number, Cardinal | "down" | "up"> = {
  0: "down",
  1: "up",
  2: "north",
  3: "south",
  4: "west",
  5: "east",
};
// direction 0-3. (BEST-EFFORT — adjust here if a block is 90° off.)
const DIRECTION: Record<number, Cardinal> = { 0: "south", 1: "west", 2: "north", 3: "east" };

function invert<T extends string>(map: Record<number, T>): Map<T, number> {
  const out = new Map<T, number>();
  for (const [k, v] of Object.entries(map)) out.set(v as T, Number(k));
  return out;
}
const WEIRDO_INV = invert(WEIRDO);
const FACING_INV = invert(FACING);
const DIRECTION_INV = invert(DIRECTION);

type StateVal = string | number | boolean;
type States = Record<string, StateVal>;

/** Rotate a states object by `steps` × 90° clockwise about Y. */
export function rotateStatesY(states: States, steps: number): States {
  const s = ((steps % 4) + 4) % 4;
  if (s === 0) return states;
  return transform(states, (c) => rotateCardinal(c, s), null);
}

/** Mirror a states object across the given axis (x = flip X / E<->W). */
export function mirrorStates(states: States, axis: "x" | "z"): States {
  return transform(states, (c) => mirrorCardinal(c, axis), axis);
}

/**
 * Shared walk: apply `mapCard` to every directional state. `mirrorAxis` is
 * non-null only for mirroring (used for the door-hinge flip).
 */
function transform(
  states: States,
  mapCard: (c: Cardinal) => Cardinal,
  mirrorAxis: "x" | "z" | null,
): States {
  const out: States = { ...states };

  if (typeof out["pillar_axis"] === "string") {
    // y unchanged; x<->z swap happens for any odd number of 90° steps. We
    // detect "did the X axis become Z" by mapping a probe cardinal.
    const probe = mapCard("north");
    const swaps = probe === "east" || probe === "west";
    if (swaps) {
      const a = out["pillar_axis"];
      if (a === "x") out["pillar_axis"] = "z";
      else if (a === "z") out["pillar_axis"] = "x";
    }
  }

  remapCardinalString(out, "minecraft:cardinal_direction", mapCard);
  remapCardinalString(out, "cardinal_direction", mapCard);
  remapTorch(out, mapCard);

  remapNumeric(out, "weirdo_direction", WEIRDO, WEIRDO_INV, mapCard);
  remapNumeric(out, "direction", DIRECTION, DIRECTION_INV, mapCard);
  remapFacing(out, mapCard);
  remapSign(out, mapCard, mirrorAxis);

  // Door hinge flips on a mirror.
  if (mirrorAxis !== null && typeof out["door_hinge_bit"] === "boolean") {
    out["door_hinge_bit"] = !out["door_hinge_bit"];
  }

  return out;
}

function remapCardinalString(
  out: States,
  key: string,
  mapCard: (c: Cardinal) => Cardinal,
): void {
  const v = out[key];
  if (typeof v === "string" && isCardinal(v)) out[key] = mapCard(v);
}

function remapNumeric(
  out: States,
  key: string,
  fwd: Record<number, Cardinal>,
  inv: Map<Cardinal, number>,
  mapCard: (c: Cardinal) => Cardinal,
): void {
  const v = out[key];
  if (typeof v !== "number") return;
  const card = fwd[v];
  if (!card) return;
  const next = inv.get(mapCard(card));
  if (next !== undefined) out[key] = next;
}

function remapFacing(out: States, mapCard: (c: Cardinal) => Cardinal): void {
  const v = out["facing_direction"];
  if (typeof v !== "number") return;
  const f = FACING[v];
  if (!f || f === "up" || f === "down") return; // vertical: unchanged
  const next = FACING_INV.get(mapCard(f));
  if (next !== undefined) out["facing_direction"] = next;
}

function remapTorch(out: States, mapCard: (c: Cardinal) => Cardinal): void {
  const v = out["torch_facing_direction"];
  if (typeof v === "string" && isCardinal(v)) out["torch_facing_direction"] = mapCard(v);
}

function remapSign(
  out: States,
  mapCard: (c: Cardinal) => Cardinal,
  mirrorAxis: "x" | "z" | null,
): void {
  const v = out["ground_sign_direction"];
  if (typeof v !== "number") return;
  if (mirrorAxis !== null) {
    // Reflection negates the angle about the mirror axis. 16 steps = 360°;
    // axis x reflects about the N-S line (0), axis z about the E-W line (8).
    const pivot = mirrorAxis === "x" ? 0 : 8;
    out["ground_sign_direction"] = (((2 * pivot - v) % 16) + 16) % 16;
    return;
  }
  // Rotation: 4 of 16 steps per 90°. Direction matches the cardinal CW cycle.
  const steps = stepsFromMap(mapCard);
  out["ground_sign_direction"] = ((v + 4 * steps) % 16 + 16) % 16;
}

/** Recover the 90°-step count from a cardinal mapper (0..3). */
function stepsFromMap(mapCard: (c: Cardinal) => Cardinal): number {
  return CW.indexOf(mapCard("north"));
}

function isCardinal(v: string): v is Cardinal {
  return v === "north" || v === "east" || v === "south" || v === "west";
}

// ---- convenience over whole BlockStates ---------------------------------

export function rotateBlockStateY(b: BlockState, steps: number): BlockState {
  const next = cloneBlockState(b);
  next.states = rotateStatesY(next.states, steps);
  return next;
}

export function mirrorBlockState(b: BlockState, axis: "x" | "z"): BlockState {
  const next = cloneBlockState(b);
  next.states = mirrorStates(next.states, axis);
  return next;
}
