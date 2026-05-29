/**
 * The library is a *folder of per-component JSON files*, the project's source
 * of truth (tracked in git). Subfolders are categories, e.g.:
 *
 *   library/
 *     parts/apartment.json
 *     parts/stairwell.json
 *     composites/floor.json
 *     composites/tower.json
 *
 * Component id = file stem (must be unique across the whole tree). The category
 * is purely organisational (the relative folder path) and is used by the UI for
 * grouping; it does not affect ids or baking.
 */

import {
  readdirSync,
  statSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
} from "node:fs";
import { resolve, join, relative, dirname, sep } from "node:path";
import type { ComponentJSON } from "../src/core/project/json.js";

export const LIB_DIR = resolve(process.cwd(), "library");

export function defaultCategory(kind: "leaf" | "composite"): string {
  return kind === "leaf" ? "parts" : "composites";
}

export interface LoadedComponent {
  category: string; // "" = top level, else "roads" or "roads/straight"
  json: ComponentJSON;
  file: string;
}

export function loadLibraryDir(dir: string = LIB_DIR): LoadedComponent[] {
  if (!existsSync(dir)) return [];
  const out: LoadedComponent[] = [];
  const walk = (d: string): void => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".json")) {
        const json = JSON.parse(readFileSync(full, "utf8")) as ComponentJSON;
        const rel = relative(dir, dirname(full));
        out.push({ category: rel === "" ? "" : rel.split(sep).join("/"), json, file: full });
      }
    }
  };
  walk(dir);
  return out;
}

/** Replace-all write: clears the folder, then writes each component to
 *  library/<category>/<id>.json. Robust against renames/deletes. */
export function writeLibraryDir(
  dir: string,
  comps: Array<{ category: string; json: ComponentJSON }>,
): void {
  rmSync(dir, { recursive: true, force: true });
  for (const { category, json } of comps) {
    const catDir = category ? join(dir, ...category.split("/")) : dir;
    mkdirSync(catDir, { recursive: true });
    writeFileSync(join(catDir, `${json.id}.json`), JSON.stringify(json, null, 2) + "\n");
  }
}
