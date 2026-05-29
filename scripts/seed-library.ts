/**
 * One-off: write the initial library/ folder from the built-in demo, so the
 * repo has a JSON source of truth to edit. Pass --force to overwrite.
 *
 * Run: npm run seed:library  [-- --force]
 */

import { existsSync } from "node:fs";
import { buildDemoLibrary } from "../src/core/demo.js";
import { componentToJSON } from "../src/core/project/json.js";
import { LIB_DIR, defaultCategory, writeLibraryDir } from "./libdir.js";

if (existsSync(LIB_DIR) && !process.argv.includes("--force")) {
  console.log(`library/ already exists — pass --force to overwrite. (${LIB_DIR})`);
} else {
  const { lib } = buildDemoLibrary();
  const comps = [...lib.components.values()].map((c) => ({
    category: defaultCategory(c.kind),
    json: componentToJSON(c),
  }));
  writeLibraryDir(LIB_DIR, comps);
  console.log(`Wrote ${comps.length} components to ${LIB_DIR}`);
}
