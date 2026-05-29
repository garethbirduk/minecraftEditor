/**
 * Build every component in library.json -> ./out/<id>.mcstructure.
 *
 * library.json is the source of truth; ./out is a regenerable mirror. The
 * Windows-specific "replace everything in Minecraft" step is deploy-bedrock.ps1
 * (-Clean), kept separate so this stays cross-platform. `npm run sync` chains
 * the two.
 *
 * Build all components, or a subset by id:
 *   npx vite-node scripts/build-library.ts            # all
 *   npx vite-node scripts/build-library.ts tower floor # just these
 */

import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { libraryFromComponents } from "../src/core/project/json.js";
import { bake } from "../src/core/model/bake.js";
import { serializeMcStructure } from "../src/core/mcstructure/serialize.js";
import { loadLibraryDir } from "./libdir.js";

const loaded = loadLibraryDir();
if (loaded.length === 0) {
  console.error("Empty/missing library/ folder. Run: npm run seed:library");
  process.exit(1);
}
const lib = libraryFromComponents(loaded.map((l) => l.json));

// Optional subset: any ids passed as CLI args (ignore vite-node's own flags).
const wanted = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const subset = new Set(wanted);
const selected = [...lib.components.values()].filter(
  (c) => subset.size === 0 || subset.has(c.id),
);
if (subset.size > 0) {
  const missing = wanted.filter((id) => !lib.components.has(id));
  if (missing.length) console.warn(`Warning: unknown ids ignored: ${missing.join(", ")}`);
}

const outDir = resolve(process.cwd(), "out");
// Replace everything: wipe ./out so removed components don't linger.
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

let total = 0;
for (const comp of selected) {
  const { grid } = bake(lib, comp.id);
  if (grid.volume === 0) {
    console.log(`${comp.id.padEnd(12)} (empty, skipped)`);
    continue;
  }
  const bytes = serializeMcStructure(grid);
  writeFileSync(resolve(outDir, `${comp.id}.mcstructure`), bytes);
  total += bytes.length;
  console.log(
    `${comp.id.padEnd(12)} ${grid.sx}×${grid.sy}×${grid.sz}  ${bytes.length} bytes`,
  );
}
console.log(`\n${selected.length} components -> ${outDir}  (${total} bytes total)`);
