/**
 * Editable composition tree.
 *
 * Each placement row lets you align/arrange the child: X/Y/Z offset inputs
 * (block coordinates relative to the composite origin), rotate / mirror chips,
 * and remove. The size hint (e.g. "6×3×4") tells you how far to offset the next
 * piece to abut it. Edits mutate the placement and re-bake; because placements
 * are references, editing one updates every composite that uses it.
 */

import { CompositeComponent, ComponentId, Library, Placement } from "../core/model/composition.js";

interface Handlers {
  onSelect: (id: ComponentId) => void;
  onRotate: (parentId: ComponentId, index: number) => void;
  onMirror: (parentId: ComponentId, index: number) => void;
  onSetOffset: (parentId: ComponentId, index: number, axis: 0 | 1 | 2, value: number) => void;
  onRemove: (parentId: ComponentId, index: number) => void;
  /** Offset this placement to abut the previous sibling along an axis. */
  onSnap: (parentId: ComponentId, index: number, axis: 0 | 1 | 2) => void;
}

interface Props extends Handlers {
  lib: Library;
  root: CompositeComponent;
}

export function CompositionTree(props: Props): JSX.Element {
  const { lib, root } = props;
  if (root.children.length === 0) {
    return <div className="tree-empty">empty — use “＋ add component” above</div>;
  }
  return <Node {...props} id={root.id} depth={0} seen={new Set()} />;
}

interface NodeProps extends Props {
  id: ComponentId;
  depth: number;
  seen: Set<ComponentId>;
}

function Node({ id, depth, seen, ...rest }: NodeProps): JSX.Element | null {
  const { lib } = rest;
  const comp = lib.components.get(id);
  if (!comp) return <div className="tree-row" style={indent(depth)}>⚠ missing “{id}”</div>;
  if (comp.kind === "leaf") return null;
  if (seen.has(id)) return <div className="tree-row" style={indent(depth)}>↻ {comp.name} (cycle)</div>;
  const childSeen = new Set(seen).add(id);
  return (
    <div>
      {comp.children.map((p, i) => (
        <PlacementRow key={i} {...rest} parentId={comp.id} index={i} p={p} depth={depth} seen={childSeen} />
      ))}
    </div>
  );
}

interface RowProps extends Props {
  parentId: ComponentId;
  index: number;
  p: Placement;
  depth: number;
  seen: Set<ComponentId>;
}

function PlacementRow(props: RowProps): JSX.Element {
  const { lib, parentId, index, p, depth, seen, onSelect, onRotate, onMirror, onSetOffset, onRemove, onSnap } = props;
  const child = lib.components.get(p.ref);
  const size = child?.kind === "leaf" ? `${child.grid.sx}×${child.grid.sy}×${child.grid.sz}` : null;
  return (
    <div>
      <div className="tree-row" style={indent(depth)}>
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
        {p.repeat && <span className="repeat">×{p.repeat.count} ▲{fmtVec(p.repeat.step)}</span>}
      </div>
      {child?.kind === "composite" && (
        <Node {...props} id={child.id} depth={depth + 1} seen={seen} />
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
