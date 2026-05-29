/**
 * Block -> flat RGB colour for the 3D preview.
 *
 * v1 deliberately uses flat colours, not textures: it sidesteps both the
 * geometry complexity of non-cube blocks AND the licensing wall around
 * redistributing Mojang's textures. A curated map covers common building
 * blocks; everything else falls back to a deterministic hash colour so even
 * unknown blocks render distinctly and stably.
 */

const KNOWN: Record<string, string> = {
  "minecraft:air": "#00000000",
  "minecraft:stone": "#7e7e7e",
  "minecraft:cobblestone": "#7a7a7a",
  "minecraft:stonebrick": "#7b7b7b",
  "minecraft:dirt": "#8a5a3b",
  "minecraft:grass_block": "#5f8f3a",
  "minecraft:grass": "#5f8f3a",
  "minecraft:sand": "#dbcd9e",
  "minecraft:gravel": "#8a8480",
  "minecraft:oak_planks": "#b08a52",
  "minecraft:planks": "#b08a52",
  "minecraft:spruce_planks": "#7a5a36",
  "minecraft:oak_log": "#6b5230",
  "minecraft:log": "#6b5230",
  "minecraft:glass": "#aee3f0",
  "minecraft:white_concrete": "#cfd5d6",
  "minecraft:light_gray_concrete": "#7d7d73",
  "minecraft:gray_concrete": "#373a3e",
  "minecraft:black_concrete": "#080a0f",
  "minecraft:cyan_concrete": "#157789",
  "minecraft:blue_concrete": "#2c2e8f",
  "minecraft:red_concrete": "#8e2121",
  "minecraft:orange_concrete": "#e06101",
  "minecraft:yellow_concrete": "#f1af15",
  "minecraft:lime_concrete": "#5ea918",
  "minecraft:green_concrete": "#495b24",
  "minecraft:brick_block": "#985542",
  "minecraft:bricks": "#985542",
  "minecraft:cobblestone_wall": "#8a8a86",
  "minecraft:acacia_planks": "#ba6337",
  "minecraft:structure_block": "#3a4a55",
  "minecraft:quartz_block": "#e6e1d8",
  "minecraft:smooth_stone": "#9d9d9d",
  "minecraft:iron_block": "#d8d8d8",
  "minecraft:water": "#3a6df0",
  "minecraft:glowstone": "#f5d27a",
  "minecraft:sea_lantern": "#c9d6cf",
  "minecraft:concrete": "#9aa0a3",
};

/** Returns "#rrggbb" for a block name. */
export function colorForBlock(name: string): string {
  const known = KNOWN[name];
  if (known) return known.length === 9 ? known.slice(0, 7) : known;
  return hashColor(name);
}

/** True if the block should not be drawn / counts as see-through for culling. */
export function isTransparentBlock(name: string): boolean {
  return name === "minecraft:air" || name === "air" || name === "minecraft:water";
}

function hashColor(s: string): string {
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Map hash to a pleasant-ish mid-bright colour (avoid near-black/near-white).
  const hue = h % 360;
  return hslToHex(hue, 45, 55);
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number): number => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => {
    const c = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * c);
  };
  const toHex = (v: number): string => v.toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}
