/**
 * Import a .mcstructure file into the library as a leaf component.
 * The inverse of build-library: Minecraft -> file -> library/<category>/<id>.json.
 *
 *   npx vite-node scripts/import-file.ts incoming/field.mcstructure
 *   npx vite-node scripts/import-file.ts <path> [--id myname] [--category imported]
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import { parseMcStructure } from "../src/core/mcstructure/parse.js";
import { componentToJSON } from "../src/core/project/json.js";
import { LIB_DIR } from "./libdir.js";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("usage: vite-node scripts/import-file.ts <file.mcstructure> [--id x] [--category y]");
  process.exit(1);
}
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const path = resolve(process.cwd(), file);
const grid = parseMcStructure(readFileSync(path));
const id = (flag("id") ?? basename(file).replace(/\.[^.]+$/, "")).toLowerCase().replace(/[^a-z0-9_]/g, "_");
const category = flag("category") ?? "imported";

const json = componentToJSON({ kind: "leaf", id, name: id, grid });
const dir = join(LIB_DIR, category);
mkdirSync(dir, { recursive: true });
const dest = join(dir, `${id}.json`);
writeFileSync(dest, JSON.stringify(json, null, 2) + "\n");

console.log(`Imported ${file}`);
console.log(`  ${grid.sx}x${grid.sy}x${grid.sz}, ${grid.palette.length} block types -> ${dest}`);
console.log(`  reload the app to see it (library/${category}/${id})`);
