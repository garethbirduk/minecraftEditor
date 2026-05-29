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

type SaveState = "idle" | "saving" | "saved" | "error";

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
    setSaveState("idle"); // edits invalidate the "saved" indicator
  };

  const [selectedId, setSelectedId] = useState<ComponentId>(demo.rootId);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"demo" | "library/">("demo");
  const [saveState, setSaveState] = useState<SaveState>("idle");
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

  const onSave = async (): Promise<void> => {
    setSaveState("saving");
    try {
      const components = [...libRef.current.components.values()].map((c) => ({
        category: categoryRef.current.get(c.id) ?? defaultCategory(c.kind),
        ...componentToJSON(c),
      }));
      const res = await fetch("/__library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ components }),
      });
      setSaveState(res.ok ? "saved" : "error");
    } catch {
      setSaveState("error");
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
        <button className="primary" onClick={onExport} disabled={!grid}>
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
        <div className="section-title">Library</div>
        {components.map((c) => (
          <div
            key={c.id}
            className={`lib-item ${c.id === selectedId ? "active" : ""}`}
            onClick={() => setSelectedId(c.id)}
          >
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

        {selected?.kind === "composite" && (
          <div className="tree">
            <div className="section-title">Composition</div>
            <CompositionTree
              lib={lib}
              root={selected}
              onSelect={setSelectedId}
              onRotate={rotatePlacement}
              onMirror={cycleMirror}
            />
          </div>
        )}
      </div>

      <div className="viewport-wrap">
        <Viewport3D grid={grid} />
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
