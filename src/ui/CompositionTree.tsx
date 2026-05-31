/**
 * Editable composition tree.
 *
 * - Each placement row: X/Y/Z offset inputs (alignment), rotate / mirror chips,
 *   snap-to-neighbour, remove. Size hint shows the footprint.
 * - Every placement whose ref is a COMPOSITE gets a ▶/▼ caret to collapse its
 *   nested children out of the way. Collapse is keyed by tree-path, so the same
 *   component placed twice folds independently.
 * - Array placements (`repeat`) show an "expand" chip → N independent
 *   placements sharing a group, rendered under a collapsible group header.
 */

import { useState } from "react";
import { CompositeComponent, ComponentId, Library, Placement } from "../core/model/composition.js";

interface Handlers {
  onSelect: (id: ComponentId) => void;
  onRotate: (parentId: ComponentId, index: number) => void;
  onMirror: (parentId: ComponentId, index: number) => void;
  onSetOffset: (parentId: ComponentId, index: number, axis: 0 | 1 | 2, value: number) => void;
  onRemove: (parentId: ComponentId, index: number) => void;
  onSnap: (parentId: ComponentId, index: number, axis: 0 | 1 | 2) => void;
  onExpand: (parentId: ComponentId, index: number) => void;
}

interface Props extends Handlers {
  lib: Library;
  root: CompositeComponent;
}

export function CompositionTree(props: Props): JSX.Element {
  const { root } = props;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (key: string): void =>
    setCollapsed((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  if (root.children.length === 0) {
    return <div className="tree-empty">empty — use “＋ add component” above</div>;
  }
  return <Node {...props} id={root.id} depth={0} path="" seen={new Set()} collapsed={collapsed} onToggle={toggle} />;
}

interface NodeProps extends Props {
  id: ComponentId;
  depth: number;
  path: string;
  seen: Set<ComponentId>;
  collapsed: Set<string>;
  onToggle: (key: string) => void;
}

const childPath = (path: string, i: number): string => (path ? `${path}/${i}` : `${i}`);

interface Run {
  group?: string;
  items: Array<{ p: Placement; index: number }>;
}
function groupRuns(children: Placement[]): Run[] {
  const runs: Run[] = [];
  let i = 0;
  while (i < children.length) {
    const g = children[i]!.group;
    if (g) {
      const items: Run["items"] = [];
      while (i < children.length && children[i]!.group === g) {
        items.push({ p: children[i]!, index: i });
        i++;
      }
      runs.push({ group: g, items });
    } else {
      runs.push({ items: [{ p: children[i]!, index: i }] });
      i++;
    }
  }
  return runs;
}

function Node({ id, depth, path, seen, ...rest }: NodeProps): JSX.Element | null {
  const { lib, collapsed, onToggle } = rest;
  const comp = lib.components.get(id);
  if (!comp) return <div className="tree-row" style={indent(depth)}>⚠ missing “{id}”</div>;
  if (comp.kind === "leaf") return null;
  if (seen.has(id)) return <div className="tree-row" style={indent(depth)}>↻ {comp.name} (cycle)</div>;
  const childSeen = new Set(seen).add(id);

  return (
    <div>
      {groupRuns(comp.children).map((run, ri) => {
        if (run.group && run.items.length > 1) {
          const gkey = `${path}#${run.group}`;
          const isCollapsed = collapsed.has(gkey);
          const name = (run.items[0]!.p.label ?? "").replace(/ #\d+$/, "") || run.items[0]!.p.ref;
          return (
            <div key={`g${ri}`}>
              <div className="tree-row group-head" style={indent(depth)} onClick={() => onToggle(gkey)}>
                <span className="caret">{isCollapsed ? "▶" : "▼"}</span>
                <span className="label">{name}</span>
                <span className="ref">×{run.items.length}</span>
              </div>
              {!isCollapsed &&
                run.items.map((it) => (
                  <PlacementRow
                    key={it.index}
                    {...rest}
                    parentId={comp.id}
                    index={it.index}
                    p={it.p}
                    depth={depth + 1}
                    path={childPath(path, it.index)}
                    seen={childSeen}
                  />
                ))}
            </div>
          );
        }
        const it = run.items[0]!;
        return (
          <PlacementRow
            key={it.index}
            {...rest}
            parentId={comp.id}
            index={it.index}
            p={it.p}
            depth={depth}
            path={childPath(path, it.index)}
            seen={childSeen}
          />
        );
      })}
    </div>
  );
}

interface RowProps extends Props {
  parentId: ComponentId;
  index: number;
  p: Placement;
  depth: number;
  path: string;
  seen: Set<ComponentId>;
  collapsed: Set<string>;
  onToggle: (key: string) => void;
}

function PlacementRow(props: RowProps): JSX.Element {
  const { lib, parentId, index, p, depth, path, seen, collapsed, onToggle } = props;
  const { onSelect, onRotate, onMirror, onSetOffset, onRemove, onSnap, onExpand } = props;
  const child = lib.components.get(p.ref);
  const isComposite = child?.kind === "composite";
  const isCollapsed = collapsed.has(path);
  const size = child?.kind === "leaf" ? `${child.grid.sx}×${child.grid.sy}×${child.grid.sz}` : null;
  return (
    <div>
      <div className="tree-row" style={indent(depth)}>
        {isComposite ? (
          <span className="caret clickable" title="Collapse / expand" onClick={() => onToggle(path)}>
            {isCollapsed ? "▶" : "▼"}
          </span>
        ) : (
          <span className="caret-spacer" />
        )}
        <span className="label">{p.label ?? child?.name ?? p.ref}</span>
        <span className="ref" title="open this component" style={{ cursor: "pointer" }} onClick={() => onSelect(p.ref)}>
          →{p.ref}
        </span>
        {size && <span className="size-hint">{size}</span>}
        <button className="chip remove" title="Remove this placement" onClick={() => onRemove(parentId, index)}>
          ✕
        </button>
      </div>
      <div className="tree-controls" style={indent(depth)}>
        {(["x", "y", "z"] as const).map((axis, a) => (
          <label key={axis} className="offset">
            {axis}
            <input
              type="number"
              value={p.offset[a]}
              onChange={(e) => onSetOffset(parentId, index, a as 0 | 1 | 2, e.target.valueAsNumber)}
            />
          </label>
        ))}
        <button className={`chip ${p.rotationY ? "on" : ""}`} title="Rotate 90°" onClick={() => onRotate(parentId, index)}>
          ⟳ {p.rotationY}°
        </button>
        <button className={`chip ${p.mirror !== "none" ? "on" : ""}`} title="Mirror" onClick={() => onMirror(parentId, index)}>
          ⇋ {p.mirror}
        </button>
        {index > 0 && (
          <span className="snap" title="Snap to abut the previous piece along this axis">
            snap
            <button className="chip" onClick={() => onSnap(parentId, index, 0)}>+X</button>
            <button className="chip" onClick={() => onSnap(parentId, index, 1)}>+Y</button>
            <button className="chip" onClick={() => onSnap(parentId, index, 2)}>+Z</button>
          </span>
        )}
        {p.repeat && (
          <button
            className="chip expand"
            title={`Expand this ×${p.repeat.count} array into ${p.repeat.count} independent, movable copies`}
            onClick={() => onExpand(parentId, index)}
          >
            expand ×{p.repeat.count} ▲{fmtVec(p.repeat.step)}
          </button>
        )}
      </div>
      {isComposite && !isCollapsed && child && (
        <Node {...props} id={child.id} depth={depth + 1} path={path} seen={seen} />
      )}
    </div>
  );
}

function fmtVec(v: readonly [number, number, number]): string {
  return `(${v[0]},${v[1]},${v[2]})`;
}
function indent(depth: number): React.CSSProperties {
  return { paddingLeft: 14 + depth * 14 };
}
