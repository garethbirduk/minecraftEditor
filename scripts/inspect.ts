/**
 * Inspect a .mcstructure file: dimensions, palette, and per-Y-layer block
 * counts (to confirm a tall structure actually has content at every level).
 *
 * Run: npx vite-node scripts/inspect.ts out/tower.mcstructure
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseMcStructure } from "../src/core/mcstructure/parse.js";

const arg = process.argv.slice(2).find((a) => !a.startsWith("-")) ?? "out/tower.mcstructure";
const g = parseMcStructure(readFileSync(resolve(process.cwd(), arg)));

const solid = [...g.cells].filter((c) => c !== -1).length;
console.log(`${arg}: ${g.sx} x ${g.sy} x ${g.sz}  (volume ${g.volume}, placed ${solid})`);
console.log(`palette (${g.palette.length}): ${g.palette.map((b) => b.name).join(", ")}`);

// Integrity: every non-void cell must index a real palette entry.
let minIdx = Infinity, maxIdx = -Infinity, oob = 0;
for (const c of g.cells) {
  if (c === -1) continue;
  minIdx = Math.min(minIdx, c);
  maxIdx = Math.max(maxIdx, c);
  if (c < 0 || c >= g.palette.length) oob++;
}
console.log(`cell index range: ${minIdx}..${maxIdx}  (palette size ${g.palette.length})  out-of-range: ${oob}`);
console.log(`palette versions: ${g.palette.map((b) => b.version).join(", ")}`);
console.log(`max per-axis vs structure-block cap 64 x 384 x 64: ` +
  `${g.sx <= 64 && g.sy <= 384 && g.sz <= 64 ? "WITHIN limits" : "EXCEEDS limits"}`);

// Blocks per Y layer — should be non-zero all the way up for a real tower.
const perY: number[] = [];
for (let y = 0; y < g.sy; y++) {
  let n = 0;
  for (let x = 0; x < g.sx; x++) for (let z = 0; z < g.sz; z++) if (g.at(x, y, z) !== -1) n++;
  perY.push(n);
}
const empty = perY.map((n, y) => (n === 0 ? y : -1)).filter((y) => y >= 0);
console.log(`Y layers with blocks: ${perY.filter((n) => n > 0).length}/${g.sy}`);
console.log(`empty Y layers: ${empty.length ? empty.join(",") : "none"}`);
console.log(`per-Y counts: [${perY.join(",")}]`);
