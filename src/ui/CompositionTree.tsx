/**
 * Composition tree with interactive transform chips.
 *
 * Each placement row shows its referenced component, offset, and clickable
 * rotate / mirror chips. Clicking rotate cycles 0→90→180→270; clicking mirror
 * cycles none→x→z. Edits mutate the placement and re-bake — and because
 * placements are *references*, editing one inside "floor" updates every tower
 * that uses it (the whole point of the model).
 */

import { CompositeComponent, ComponentId, Library, Placement } from "../core/model/composition.js";

interface Props {
  lib: Library;
  root: CompositeComponent;
  onSelect: (id: ComponentId) => void;
  onRotate: (parentId: ComponentId, index: number) => void;
  onMirror: (parentId: ComponentId, index: number) => void;
}

export function CompositionTree(props: Props): JSX.Element {
  return (
    <div>
      <Node {...props} id={props.root.id} depth={0} seen={new Set()} />
    </div>
  );
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
  if (seen.has(id)) {
    return <div className="tree-row" style={indent(depth)}>↻ {comp.name} (cycle)</div>;
  }
  const childSeen = new Set(seen).add(id);

  return (
    <div>
      {comp.children.map((p, i) => (
        <PlacementRow
          key={i}
          {...rest}
          parentId={comp.id}
          index={i}
          p={p}
          depth={depth}
          seen={childSeen}
        />
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

function PlacementRow({
  lib,
  parentId,
  index,
  p,
  depth,
  seen,
  onSelect,
  onRotate,
  onMirror,
}: RowProps): JSX.Element {
  const child = lib.components.get(p.ref);
  return (
    <div>
      <div className="tree-row" style={indent(depth)}>
        <span className="label">{p.label ?? child?.name ?? p.ref}</span>
        <span className="ref" style={{ cursor: "pointer" }} onClick={() => onSelect(p.ref)}>
          →{p.ref}
        </span>
        {hasOffset(p) && <span className="xform">@{fmtVec(p.offset)}</span>}
        <button
          className={`chip ${p.rotationY ? "on" : ""}`}
          title="Rotate 90° (cycles 0→90→180→270)"
          onClick={() => onRotate(parentId, index)}
        >
          ⟳ {p.rotationY}°
        </button>
        <button
          className={`chip ${p.mirror !== "none" ? "on" : ""}`}
          title="Mirror (cycles none→x→z)"
          onClick={() => onMirror(parentId, index)}
        >
          ⇋ {p.mirror}
        </button>
        {p.repeat && <span className="repeat">×{p.repeat.count} ▲{fmtVec(p.repeat.step)}</span>}
      </div>
      {child?.kind === "composite" && (
        <Node
          lib={lib}
          root={{ ...child }}
          id={child.id}
          depth={depth + 1}
          seen={seen}
          onSelect={onSelect}
          onRotate={onRotate}
          onMirror={onMirror}
        />
      )}
    </div>
  );
}

function hasOffset(p: Placement): boolean {
  return Boolean(p.offset[0] || p.offset[1] || p.offset[2]);
}
function fmtVec(v: readonly [number, number, number]): string {
  return `(${v[0]},${v[1]},${v[2]})`;
}
function indent(depth: number): React.CSSProperties {
  return { paddingLeft: 14 + depth * 14 };
}
