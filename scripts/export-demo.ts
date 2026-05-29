/**
 * Proof that export is real: bake demo components, write genuine .mcstructure
 * files to ./out, then read them back through the parser and report.
 *
 * Run: npx vite-node scripts/export-demo.ts
 */

import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { buildDemoLibrary } from "../src/core/demo.js";
import { bake } from "../src/core/model/bake.js";
import { serializeMcStructure } from "../src/core/mcstructure/serialize.js";
import { parseMcStructure } from "../src/core/mcstructure/parse.js";

const outDir = resolve(process.cwd(), "out");
mkdirSync(outDir, { recursive: true });

const { lib } = buildDemoLibrary();

for (const id of ["apartment", "floor", "tower"]) {
  const { grid } = bake(lib, id);
  const bytes = serializeMcStructure(grid);
  const path = resolve(outDir, `${id}.mcstructure`);
  writeFileSync(path, bytes);

  // Read it straight back to confirm it's a valid, parseable file.
  const reparsed = parseMcStructure(bytes);
  const solid = [...reparsed.cells].filter((c) => c !== -1).length;
  const { size } = statSync(path);

  console.log(
    `${id.padEnd(10)} -> ${path}\n` +
      `  ${size} bytes · ${reparsed.sx}×${reparsed.sy}×${reparsed.sz}` +
      ` · ${reparsed.palette.length} block types · ${solid} placed blocks` +
      ` · reparse OK`,
  );
}
