# Bedrock Structure Composer

A web-based **parametric composition editor** for Minecraft *Bedrock* `.mcstructure`
files. Import building blocks, arrange them into a nested, array-driven tree
(LHS apartment + mirrored RHS + stairwell → floor → ×12 → tower → city), and
**bake** the tree into placeable structures.

The novel bit isn't the viewer — several web viewers/editors for single
structures already exist (MCBE Essentials, cubical.xyz, Bloxelizer). It's the
**composition layer**: components are *referenced*, not copied, so editing one
leaf propagates to every place it's used, and an *array modifier* turns "12
floors" into a single number.

## Stack

- **React 18 + Vite + TypeScript** (strict), dark monospace theme.
- **three.js** for the voxel viewport (InstancedMesh + hidden-face culling).
- **Zero-dependency core** — a hand-rolled little-endian NBT codec, so there's
  no Node `Buffer`/bundler friction in the browser and the format stays fully
  inspectable.

## Run

```bash
npm install
npm run dev        # http://localhost:6180
npm test           # vitest: NBT round-trip + bake
npm run typecheck
```

The app opens on a **built-in demo** (an apartment tower) so composition is
visible with no file. Drag to orbit, scroll to zoom, right-drag to pan.
**Import .mcstructure** adds a leaf to the library; **Export baked** flattens
the selected component to a downloadable `.mcstructure`.

## The library (source of truth) & deploy to Minecraft

The library is a **git-tracked folder of per-component JSON files** — `library/`,
with subfolders as categories. Composites are tiny (just placements); only leaves
carry block data (RLE-compressed). A 3.8 KB library generates 66 KB of baked
`.mcstructure`. The editor reads/writes this folder live in dev (via `/__library`);
**Save library** writes edits back to the files.

```
library/
  parts/apartment.json        # leaf — real blocks, RLE
  parts/stairwell.json
  composites/floor.json       # composite — placements only
  composites/tower.json
out/                          # generated .mcstructure (gitignored)
```

```bash
npm run seed:library          # write library/ from the built-in demo (--force to overwrite)
npm run build:library         # bake ALL components -> ./out/*.mcstructure
npm run build:library tower   # ...or just a subset, by id
npm run sync                  # build:library + deploy -Pack -Clean (replace everything in Minecraft)
```

`scripts/deploy-bedrock.ps1` puts those files where Bedrock can load them. The
data tree lives at
`%LOCALAPPDATA%\Packages\MICROSOFT.MINECRAFTUWP_8wekyb3d8bbwe\LocalState\games\com.mojang\`.

```powershell
# Stage .\out into a behaviour pack (works even before the game's first launch —
# creates the tree). -Clean wipes the namespace folder first. Then enable the
# pack on a world in-game.
powershell -ExecutionPolicy Bypass -File scripts\deploy-bedrock.ps1 -Pack -Clean

# List worlds (and report whether the data tree exists yet)
powershell -ExecutionPolicy Bypass -File scripts\deploy-bedrock.ps1 -List

# Copy one structure straight into a world (by 1-based index or name fragment)
powershell -ExecutionPolicy Bypass -File scripts\deploy-bedrock.ps1 -File out\tower.mcstructure -World 1
```

In-game, load with a structure block (Load mode) or `/structure load mystructure:tower ~ ~ ~`.
Notes: the behaviour pack's `manifest.json` is written **BOM-less** (Bedrock
rejects a UTF-8 BOM); structures live under `structures/<namespace>/<name>.mcstructure`.

### Portable .mcpack (recommended for sharing / other devices)

```bash
npm run mcpack        # build:library + zip -> dist/StructureComposer.mcpack
```

`dist/StructureComposer.mcpack` is a ZIP (manifest + `structures/` at the root,
forward-slash entries, stable UUIDs from the git-tracked `pack/manifest.json`).
**Double-click it on any Bedrock device to import**, then `/structure load
mystructure:<id>`. This is the most portable route and doesn't depend on the
local game's folder layout.

## Layout

```
src/core/                 framework-agnostic, tested in isolation
  nbt/                    little-endian NBT reader + writer + types
  mcstructure/            parse.ts (NBT -> VoxelGrid), serialize.ts (-> NBT)
  model/
    grid.ts               VoxelGrid: dense palette-index volume
    transform.ts          90° Y-rotation + mirror (positions only — see below)
    composition.ts        Leaf / Composite / Placement / array modifier
    bake.ts               flatten a component tree -> one VoxelGrid
  blocks/colors.ts        block -> flat colour (curated + hash fallback)
  demo.ts                 the built-in apartment-tower library
src/ui/                   React + three.js viewport + library/tree panels
tests/                    vitest
```

## How `.mcstructure` works (the format)

Binary, **little-endian, uncompressed NBT** (Java's NBT is big-endian and
usually gzipped — *not* byte-compatible). Root is an unnamed compound:
`format_version`, `size [x,y,z]`, and `structure { block_indices, palette,
entities }`. `block_indices` is two parallel layers of palette indices
(`-1` = structure void). Cell order is X-major, Y, then Z-minor — centralised
in `VoxelGrid.index()` so it can be verified/flipped in one place.

## Known v1 limitations (deliberate, documented)

- **Block-state rotation is faithful for common blocks, best-effort for a few.**
  90° rotation + mirror now rewrite directional states (`pillar_axis`,
  `weirdo_direction` stairs, `facing_direction`, `cardinal_direction`,
  `torch_facing_direction`, door hinge — all HIGH confidence). `direction`
  (0-3) and `ground_sign_direction` (0-15) rotate structurally but their base
  zero/handedness may be off by a constant for some blocks — a one-line fix in
  `blockstate-transform.ts`. Blocks with no orientation state are unaffected.
- **No block-entity / entity export.** Composed/exported structures carry
  geometry + block states only (chest contents, signs, spawners, mobs are
  dropped). Fine for architecture; a passthrough for imported-unmodified files
  is roadmap.
- **Structure-block size cap is 64×384×64.** A tower fits; a city does not —
  export per-building/road-section pieces. The overlay warns when a bake
  exceeds the cap.
- **Editing is not wired yet.** v1 proves import → compose (demo) → bake →
  export and renders the tree read-only. Block painting, placement editing, and
  a library persistence layer (IndexedDB) are the next pass.

## Roadmap

1. ~~Per-block rotation/mirror state table (faithful directional blocks).~~
   ✅ Done — `blockstate-transform.ts`; rotate/mirror chips on the tree.
2. Placement editor: edit offsets and array count/step on the tree (rotation +
   mirror are already interactive).
3. In-viewport editing: raycast place/delete, palette picker, undo/redo.
4. Persist the library (IndexedDB) + project import/export as JSON.
5. Anchors/snapping for painless tiling (road edges, building footprints).
6. Optional "bring-your-own resource pack" textured rendering.
7. City export: emit the set of pieces + generated `/structure load` commands.
