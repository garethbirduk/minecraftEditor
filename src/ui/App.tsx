import { useEffect, useMemo, useRef, useState } from "react";
import {
  Component,
  ComponentId,
  Library,
  addComponent,
} from "../core/model/composition.js";
import { bake, validate } from "../core/model/bake.js";
import { parseMcStructure } from "../core/mcstructure/parse.js";
import { serializeMcStructure } from "../core/mcstructure/serialize.js";
import { buildDemoLibrary } from "../core/demo.js";
import { VoxelGrid } from "../core/model/grid.js";
import {
  componentToJSON,
  libraryFromComponents,
  type ComponentJSON,
} from "../core/project/json.js";
import { Viewport3D } from "./Viewport3D.js";
import { CompositionTree } from "./CompositionTree.js";

const defaultCategory = (kind: "leaf" | "composite"): string =>
  kind === "leaf" ? "parts" : "composites";

/** Monotonic counter for unique group ids when expanding arrays. */
let expandSeq = 1;

type SaveState = "idle" | "saving" | "saved" | "error";
type SyncState = "idle" | "syncing" | "synced" | "error";

export function App(): JSX.Element {
  const demo = useMemo(() => buildDemoLibrary(), []);
  // Library lives in a ref + a version counter so mutations (import) re-render
  // without deep-cloning the whole structure model each time.
  const libRef = useRef<Library>(demo.lib);
  // Category (folder) per component id — preserved on save so files land back
  // in the same library/<category>/ folder they were loaded from.
  const categoryRef = useRef<Map<ComponentId, string>>(new Map());
  // `rev` bumps on any in-place mutation of the library so memoised bakes
  // recompute even though the library object identity is stable.
  const [rev, setRev] = useState(0);
  const bump = (): void => {
    setRev((v) => v + 1);
    setSaveState("idle"); // edits invalidate the "saved"/"synced" indicators
    setSyncState("idle");
  };

  const [selectedId, setSelectedId] = useState<ComponentId>(demo.rootId);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"demo" | "library/">("demo");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const fileInput = useRef<HTMLInputElement | null>(null);

  // On mount, try to load the git-tracked library/ folder via the dev endpoint;
  // fall back to the built-in demo if it's absent (prod build / not seeded).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/__library");
        if (!res.ok) return;
        const data = (await res.json()) as {
          components: Array<ComponentJSON & { category?: string }>;
        };
        if (cancelled || !data.components?.length) return;
        libRef.current = libraryFromComponents(data.components);
        categoryRef.current = new Map(
          data.components.map((c) => [c.id, c.category ?? defaultCategory(c.kind)]),
        );
        setSource("library/");
        if (!libRef.current.components.has(selectedId)) {
          const first = [...libRef.current.components.values()].find((c) => c.kind === "composite");
          setSelectedId(first?.id ?? [...libRef.current.components.keys()][0] ?? selectedId);
        }
        bump();
      } catch {
        /* keep demo */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the current in-memory library to the library/ folder. Shared by
  // Save and Sync (Sync must write the folder first so the bake is current).
  const postLibrary = async (): Promise<boolean> => {
    const components = [...libRef.current.components.values()].map((c) => ({
      category: categoryRef.current.get(c.id) ?? defaultCategory(c.kind),
      ...componentToJSON(c),
    }));
    const res = await fetch("/__library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ components }),
    });
    return res.ok;
  };

  const onSave = async (): Promise<void> => {
    setSaveState("saving");
    try {
      setSaveState((await postLibrary()) ? "saved" : "error");
    } catch {
      setSaveState("error");
    }
  };

  // Save, then run `npm run sync` server-side (bake + deploy into Minecraft).
  const onSync = async (): Promise<void> => {
    setSyncState("syncing");
    try {
      if (!(await postLibrary())) {
        setSyncState("error");
        return;
      }
      setSaveState("saved");
      const res = await fetch("/__sync", { method: "POST" });
      const data = (await res.json()) as { ok: boolean };
      setSyncState(data.ok ? "synced" : "error");
    } catch {
      setSyncState("error");
    }
  };

  const lib = libRef.current;
  const selected = lib.components.get(selectedId) ?? null;

  const { grid, bakeError } = useMemo<{ grid: VoxelGrid | null; bakeError: string | null }>(() => {
    if (!selected) return { grid: null, bakeError: null };
    const errs = validate(lib, selectedId);
    if (errs.length) return { grid: null, bakeError: errs.join("; ") };
    try {
      return { grid: bake(lib, selectedId).grid, bakeError: null };
    } catch (e) {
      return { grid: null, bakeError: String(e) };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, rev]);

  // Edit a placement in-place (rotation/mirror) and re-bake. Because placements
  // are referenced, editing one inside "floor" updates every tower too.
  const rotatePlacement = (parentId: ComponentId, index: number): void => {
    const parent = lib.components.get(parentId);
    if (parent?.kind !== "composite") return;
    const p = parent.children[index];
    if (!p) return;
    p.rotationY = (((p.rotationY + 90) % 360) as 0 | 90 | 180 | 270);
    bump();
  };
  const cycleMirror = (parentId: ComponentId, index: number): void => {
    const parent = lib.components.get(parentId);
    if (parent?.kind !== "composite") return;
    const p = parent.children[index];
    if (!p) return;
    const order = ["none", "x", "z"] as const;
    p.mirror = order[(order.indexOf(p.mirror) + 1) % order.length]!;
    bump();
  };

  // ---- composition editing -------------------------------------------------
  const createComposite = (): void => {
    let n = 1;
    let id = `composite-${n}`;
    while (lib.components.has(id)) id = `composite-${++n}`;
    addComponent(lib, { kind: "composite", id, name: "New composite", children: [] });
    categoryRef.current.set(id, "composites");
    setSelectedId(id);
    bump();
  };
  const addChild = (parentId: ComponentId, refId: ComponentId): void => {
    const parent = lib.components.get(parentId);
    if (parent?.kind !== "composite" || !refId) return;
    parent.children.push({ ref: refId, offset: [0, 0, 0], rotationY: 0, mirror: "none" });
    bump();
  };
  /** How many placements (across all composites) reference this component. */
  const usageOf = (id: ComponentId): number => {
    let n = 0;
    for (const c of lib.components.values()) {
      if (c.kind === "composite") for (const ch of c.children) if (ch.ref === id) n++;
    }
    return n;
  };
  const deleteComponent = (id: ComponentId): void => {
    const comp = lib.components.get(id);
    if (!comp) return;
    const uses = usageOf(id);
    const warn = uses
      ? `\n\n⚠ It is used by ${uses} placement${uses === 1 ? "" : "s"} in other components — those will show a missing reference until you fix them.`
      : "";
    if (!window.confirm(`Delete "${comp.name}" (${id})?${warn}\n\nThis is removed from the library on the next Save.`)) {
      return;
    }
    lib.components.delete(id);
    categoryRef.current.delete(id);
    if (selectedId === id) {
      const next = [...lib.components.keys()][0] ?? "";
      setSelectedId(next);
    }
    bump();
  };
  const setOffset = (parentId: ComponentId, index: number, axis: 0 | 1 | 2, value: number): void => {
    const parent = lib.components.get(parentId);
    if (parent?.kind !== "composite") return;
    const p = parent.children[index];
    if (!p) return;
    const o: [number, number, number] = [p.offset[0], p.offset[1], p.offset[2]];
    o[axis] = Number.isFinite(value) ? Math.round(value) : 0;
    p.offset = o;
    bump();
  };
  const removeChild = (parentId: ComponentId, index: number): void => {
    const parent = lib.components.get(parentId);
    if (parent?.kind !== "composite") return;
    parent.children.splice(index, 1);
    bump();
  };
  // Expand an array (repeat) placement into N independent placements, each with
  // its own concrete offset (base + k·step). They share a group id so the tree
  // shows them collapsed under one header, but each can now be moved alone.
  const expandArray = (parentId: ComponentId, index: number): void => {
    const parent = lib.components.get(parentId);
    if (parent?.kind !== "composite") return;
    const p = parent.children[index];
    if (!p?.repeat) return;
    const count = Math.max(1, Math.floor(p.repeat.count));
    const step = p.repeat.step;
    const group = `g${expandSeq++}`;
    const base = p.label ?? lib.components.get(p.ref)?.name ?? p.ref;
    const expanded = Array.from({ length: count }, (_, k) => ({
      ref: p.ref,
      offset: [p.offset[0] + step[0] * k, p.offset[1] + step[1] * k, p.offset[2] + step[2] * k] as [
        number,
        number,
        number,
      ],
      rotationY: p.rotationY,
      mirror: p.mirror,
      label: `${base} #${k + 1}`,
      group,
    }));
    parent.children.splice(index, 1, ...expanded);
    bump();
  };

  // Snap a placement so it abuts the PREVIOUS sibling along an axis: copy the
  // previous offset and step by the previous component's footprint (accounting
  // for its rotation). Turns "tile a row" into one click per piece.
  const snapToPrev = (parentId: ComponentId, index: number, axis: 0 | 1 | 2): void => {
    const parent = lib.components.get(parentId);
    if (parent?.kind !== "composite" || index <= 0) return;
    const p = parent.children[index];
    const prev = parent.children[index - 1];
    if (!p || !prev) return;
    let pg: VoxelGrid;
    try {
      pg = bake(lib, prev.ref).grid;
    } catch {
      return;
    }
    let dx = pg.sx;
    let dz = pg.sz;
    if (prev.rotationY === 90 || prev.rotationY === 270) [dx, dz] = [dz, dx];
    const step = axis === 0 ? dx : axis === 1 ? pg.sy : dz;
    const o: [number, number, number] = [prev.offset[0], prev.offset[1], prev.offset[2]];
    o[axis] = prev.offset[axis] + step;
    p.offset = o;
    bump();
  };
  // Rename: sets the display name AND derives a slug id (the export name,
  // mystructure:<id>). Updates the map key, every placement that refs it, and
  // the category map. Keeps ids unique.
  const renameComponent = (oldId: ComponentId, newName: string): void => {
    const comp = lib.components.get(oldId);
    if (!comp) return;
    comp.name = newName;
    let newId = slugify(newName);
    if (newId !== oldId) {
      if (lib.components.has(newId)) {
        let n = 2;
        while (lib.components.has(`${newId}-${n}`)) n++;
        newId = `${newId}-${n}`;
      }
      comp.id = newId;
      lib.components.delete(oldId);
      lib.components.set(newId, comp);
      for (const c of lib.components.values()) {
        if (c.kind === "composite") {
          for (const ch of c.children) if (ch.ref === oldId) ch.ref = newId;
        }
      }
      const cat = categoryRef.current.get(oldId);
      categoryRef.current.delete(oldId);
      categoryRef.current.set(newId, cat ?? defaultCategory(comp.kind));
      if (selectedId === oldId) setSelectedId(newId);
    }
    bump();
  };

  const onImport = async (file: File): Promise<void> => {
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      const importedGrid = parseMcStructure(buf);
      const id = uniqueId(lib, baseName(file.name));
      const comp: Component = {
        kind: "leaf",
        id,
        name: baseName(file.name),
        grid: importedGrid,
      };
      addComponent(lib, comp);
      categoryRef.current.set(id, "imported");
      setSelectedId(id);
      bump();
    } catch (e) {
      setError(`Import failed: ${String(e)}`);
    }
  };

  const onExport = (): void => {
    if (!grid) return;
    const bytes = serializeMcStructure(grid);
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const blob = new Blob([ab], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selected?.name ?? "structure"}.mcstructure`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const components = [...lib.components.values()];
  const stats = grid
    ? `${grid.sx} × ${grid.sy} × ${grid.sz}  ·  ${grid.palette.length} block types`
    : null;
  const overLimit = grid ? grid.sx > 64 || grid.sz > 64 || grid.sy > 384 : false;

  return (
    <div className="app">
      <div className="topbar">
        <h1>
          <span className="accent">▣</span> Bedrock Structure Composer
        </h1>
        <span className="hint">source: <b>{source}</b></span>
        <div className="spacer" />
        <span className="hint">drag-orbit · scroll-zoom · right-drag-pan</span>
        <button onClick={() => fileInput.current?.click()}>Import .mcstructure</button>
        <button onClick={() => void onSave()} disabled={source !== "library/" || saveState === "saving"}>
          {saveState === "saving"
            ? "Saving…"
            : saveState === "saved"
              ? "Saved ✓"
              : saveState === "error"
                ? "Save failed"
                : "Save library"}
        </button>
        <button
          className="primary"
          onClick={() => void onSync()}
          disabled={source !== "library/" || syncState === "syncing"}
          title="Save the library, then bake + deploy everything into Minecraft"
        >
          {syncState === "syncing"
            ? "Syncing…"
            : syncState === "synced"
              ? "Synced → MC ✓"
              : syncState === "error"
                ? "Sync failed"
                : "Sync → MC"}
        </button>
        <button onClick={onExport} disabled={!grid}>
          Export baked
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".mcstructure,.nbt"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImport(f);
            e.target.value = "";
          }}
        />
      </div>

      <div className="sidebar">
        <div className="section-title row">
          <span>Library</span>
          <button className="mini" title="Create an empty composite" onClick={createComposite}>
            ＋ composite
          </button>
        </div>
        {components.map((c) => (
          <div
            key={c.id}
            className={`lib-item ${c.id === selectedId ? "active" : ""}`}
            onClick={() => setSelectedId(c.id)}
          >
            <button
              className="lib-del"
              title="Delete component"
              onClick={(e) => {
                e.stopPropagation();
                deleteComponent(c.id);
              }}
            >
              ✕
            </button>
            <div className="name">
              <span className={`kind ${c.kind}`}>{c.kind}</span>
              {c.name}
            </div>
            <div className="meta">
              {c.kind === "leaf"
                ? `${c.grid.sx}×${c.grid.sy}×${c.grid.sz}`
                : `${c.children.length} placement${c.children.length === 1 ? "" : "s"}`}
            </div>
          </div>
        ))}

        {selected && (
          <div className="selected-edit">
            <div className="section-title">Name</div>
            <NameEditor
              key={selected.id}
              name={selected.name}
              onCommit={(v) => renameComponent(selected.id, v)}
            />
            <div className="id-hint">
              loads as <b>mystructure:{selected.id}</b>
            </div>
          </div>
        )}

        {selected?.kind === "composite" && (
          <div className="tree">
            <div className="section-title row">
              <span>Composition</span>
            </div>
            <div className="add-child">
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) addChild(selected.id, e.target.value);
                  e.target.value = "";
                }}
              >
                <option value="">＋ add component…</option>
                {components
                  .filter((c) => c.id !== selected.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.kind})
                    </option>
                  ))}
              </select>
            </div>
            <CompositionTree
              lib={lib}
              root={selected}
              onSelect={setSelectedId}
              onRotate={rotatePlacement}
              onMirror={cycleMirror}
              onSetOffset={setOffset}
              onRemove={removeChild}
              onSnap={snapToPrev}
              onExpand={expandArray}
            />
          </div>
        )}
      </div>

      <div className="viewport-wrap">
        <Viewport3D grid={grid} frameKey={selectedId} />
        <div className="overlay tl">
          <b>{selected?.name ?? "—"}</b>
          {stats && (
            <>
              <br />
              {stats}
            </>
          )}
          {overLimit && (
            <>
              <br />
              <span className="warn">
                exceeds one structure block (64×384×64) — export as multiple pieces
              </span>
            </>
          )}
        </div>
        <div className="overlay tr">
          flat-colour preview
          <br />
          edit a leaf → every use updates
        </div>
        {(error || bakeError) && (
          <div className="overlay tl" style={{ top: "auto", bottom: 10 }}>
            <span className="warn">{error ?? bakeError}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function baseName(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

function uniqueId(lib: Library, base: string): ComponentId {
  let id = base || "imported";
  let n = 1;
  while (lib.components.has(id)) id = `${base}-${++n}`;
  return id;
}

/** A Bedrock-safe id: lowercase, [a-z0-9_], used as the structure name. */
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "component";
}

/**
 * Editable name field. Keeps a local draft so renaming (which churns the id and
 * references) only happens on commit (blur / Enter), not on every keystroke.
 */
function NameEditor({ name, onCommit }: { name: string; onCommit: (v: string) => void }): JSX.Element {
  const [draft, setDraft] = useState(name);
  const commit = (): void => {
    const v = draft.trim();
    if (v && v !== name) onCommit(v);
  };
  return (
    <input
      className="name-input"
      value={draft}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}
