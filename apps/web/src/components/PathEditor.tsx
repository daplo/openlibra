import {
  CornerUpRight,
  Spline,
  UnfoldHorizontal,
  Plus,
  Minus,
  PenLine,
  Check,
  X,
  Info,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type RefObject,
  type ComponentProps,
  type PointerEvent,
} from "react";
import type { OpenLibraRenderer } from "../renderer";
import type { NodeSummary, VectorContour } from "../editor/types";
import {
  movePoint,
  pathData,
  splitSegment,
  type Point,
} from "../editor/path-editing";

type Selection = { contour: number; point: number };
type Props = {
  rendererRef: RefObject<OpenLibraRenderer | undefined>;
  node?: NodeSummary;
  onCommit: (
    contours: VectorContour[],
    node?: NodeSummary,
  ) => VectorContour[] | false;
  onClose: () => void;
};
export function PathEditor({ rendererRef, node, onCommit, onClose }: Props) {
  const initial =
    node?.vector?.geometry.type === "path"
      ? node.vector.geometry.contours
      : [{ points: [], closed: false }];
  const [contours, setContours] = useState<VectorContour[]>(() =>
    structuredClone(initial),
  );
  const [selection, setSelection] = useState<Selection>();
  const [drawing, setDrawing] = useState(!node);
  const [view, setView] = useState(() => rendererRef.current?.getViewState());
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<
    | {
        selection: Selection;
        handle?: "handle_in" | "handle_out";
        start: Point;
        before: VectorContour[];
        creating?: boolean;
      }
    | undefined
  >(undefined);
  const draft = useRef(contours);
  const update = (next: VectorContour[]) => {
    draft.current = next;
    setContours(next);
  };
  useEffect(() => {
    svg.current?.focus();
    let frame = 0;
    const tick = () => {
      const next = rendererRef.current?.getViewState();
      setView((old) =>
        old?.zoom === next?.zoom &&
        old?.pan.x === next?.pan.x &&
        old?.pan.y === next?.pan.y
          ? old
          : next,
      );
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [rendererRef]);
  const zoom = view?.zoom ?? 1;
  const matrix = new DOMMatrix()
    .translate(view?.pan.x ?? 0, view?.pan.y ?? 0)
    .scale(zoom);
  if (node)
    matrix
      .translateSelf(node.x + node.width / 2, node.y + node.height / 2)
      .rotateSelf(node.rotation)
      .scaleSelf(node.flip_x ? -1 : 1, node.flip_y ? -1 : 1)
      .translateSelf(-node.width / 2, -node.height / 2)
      .scaleSelf(node.width, node.height);
  const screen = (p: Point): Point => {
    const q = matrix.transformPoint({ x: p[0], y: p[1] });
    return [q.x, q.y];
  };
  const local = (event: PointerEvent<SVGSVGElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const p = matrix.inverse().transformPoint({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    });
    return [p.x, p.y];
  };
  const commit = (next = draft.current) => {
    const result = onCommit(next, node);
    if (result) update(result);
    return result;
  };
  const finish = () => {
    if (draft.current.every((c) => c.points.length >= 2) && commit()) onClose();
  };
  const changeSelected = (
    kind: "corner" | "smooth" | "symmetric" | "delete" | "split",
  ) => {
    if (!selection) return;
    const next = structuredClone(draft.current),
      c = next[selection.contour],
      p = c.points[selection.point];
    if (kind === "delete") {
      if (c.points.length <= 2) return;
      c.points.splice(selection.point, 1);
      setSelection(undefined);
    } else if (kind === "split") {
      if (!c.closed && selection.point === c.points.length - 1) return;
      next[selection.contour] = splitSegment(c, selection.point);
      setSelection({ ...selection, point: selection.point + 1 });
    } else {
      p.point_type = kind;
      if (kind === "corner") {
        delete p.handle_in;
        delete p.handle_out;
      } else {
        const previous =
          c.points[(selection.point + c.points.length - 1) % c.points.length]
            .position;
        const following =
          c.points[(selection.point + 1) % c.points.length].position;
        let dx = (following[0] - previous[0]) / 6;
        const dy = (following[1] - previous[1]) / 6;
        if (!dx && !dy) dx = node ? 0.1 : 30;
        p.handle_in = [p.position[0] - dx, p.position[1] - dy];
        p.handle_out = [p.position[0] + dx, p.position[1] + dy];
      }
    }
    update(next);
    if (!drawing) commit(next);
  };
  const selectedContour = selection && contours[selection.contour];
  return (
    <>
      <svg
        ref={svg}
        className="path-editor"
        aria-label="Path editing canvas"
        tabIndex={0}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            if (drag.current) {
              update(drag.current.before);
              drag.current = undefined;
            } else onClose();
          }
          if (event.key === "Enter") {
            event.preventDefault();
            finish();
          }
          if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault();
            changeSelected("delete");
          }
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          const p = local(event),
            target = event.target as SVGElement;
          const ci = target.getAttribute("data-contour"),
            pi = target.getAttribute("data-point");
          if (ci !== null && pi !== null) {
            const selected = { contour: Number(ci), point: Number(pi) };
            if (
              drawing &&
              !target.hasAttribute("data-handle") &&
              selected.point === 0 &&
              draft.current[selected.contour].points.length >= 3
            ) {
              const next = structuredClone(draft.current);
              next[selected.contour].closed = true;
              update(next);
              if (commit(next)) onClose();
              return;
            }
            setSelection(selected);
            drag.current = {
              selection: selected,
              handle:
                (target.getAttribute("data-handle") as
                  "handle_in" | "handle_out" | undefined) || undefined,
              start: p,
              before: structuredClone(draft.current),
            };
          } else if (drawing) {
            const next = structuredClone(draft.current),
              contour = selection?.contour ?? 0;
            const selected = { contour, point: next[contour].points.length };
            next[contour].points.push({ position: p, point_type: "corner" });
            drag.current = {
              selection: selected,
              start: p,
              before: structuredClone(draft.current),
              creating: true,
            };
            update(next);
            setSelection(selected);
          } else setSelection(undefined);
        }}
        onPointerMove={(event) => {
          const active = drag.current;
          if (!active) return;
          let p = local(event);
          const next = structuredClone(draft.current),
            point =
              next[active.selection.contour].points[active.selection.point];
          if (event.shiftKey) {
            const origin =
              active.handle || active.creating ? point.position : active.start;
            // Constrain in document pixels even for non-square path bounds.
            const sx = node?.width ?? 1,
              sy = node?.height ?? 1;
            const dx = (p[0] - origin[0]) * sx,
              dy = (p[1] - origin[1]) * sy;
            const angle =
                (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI) / 4,
              length = Math.hypot(dx, dy);
            p = [
              origin[0] + (Math.cos(angle) * length) / sx,
              origin[1] + (Math.sin(angle) * length) / sy,
            ];
          }
          if (active.creating) {
            const a = screen(point.position),
              b = screen(p);
            if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 3) return;
            point.point_type = "symmetric";
            point.handle_out = p;
            point.handle_in = [
              2 * point.position[0] - p[0],
              2 * point.position[1] - p[1],
            ];
          } else
            next[active.selection.contour].points[active.selection.point] =
              movePoint(point, p, active.handle, event.altKey);
          update(next);
        }}
        onPointerUp={() => {
          if (drag.current && !drawing) commit();
          drag.current = undefined;
        }}
        onPointerCancel={() => {
          if (drag.current) update(drag.current.before);
          drag.current = undefined;
        }}
      >
        <path
          d={pathData(contours)}
          transform={matrix.toString()}
          fill="none"
          stroke="#28d9a0"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
        {contours.flatMap((c, ci) =>
          c.points.map((p, pi) => {
            const a = screen(p.position),
              selected = selection?.contour === ci && selection.point === pi;
            return (
              <g key={`${ci}-${pi}`}>
                {selected &&
                  (["handle_in", "handle_out"] as const).map((key) => {
                    const h = p[key];
                    if (!h) return null;
                    const b = screen(h);
                    return (
                      <g key={key}>
                        <line
                          x1={a[0]}
                          y1={a[1]}
                          x2={b[0]}
                          y2={b[1]}
                          stroke="#28d9a0"
                        />
                        <circle
                          cx={b[0]}
                          cy={b[1]}
                          r={5}
                          fill="white"
                          stroke="#00855e"
                          data-contour={ci}
                          data-point={pi}
                          data-handle={key}
                          aria-label={`${key} ${pi + 1}`}
                        />
                      </g>
                    );
                  })}
                <rect
                  x={a[0] - 5}
                  y={a[1] - 5}
                  width={10}
                  height={10}
                  fill={selected ? "#28d9a0" : "white"}
                  stroke="#00855e"
                  data-contour={ci}
                  data-point={pi}
                  aria-label={`Anchor ${pi + 1}`}
                />
              </g>
            );
          }),
        )}
      </svg>
      <div
        className="path-editor-controls"
        role="toolbar"
        aria-label="Curve editing"
        aria-orientation="vertical"
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") onClose();
        }}
      >
        <PathAction
          label="Curve editing help"
          tip={
            drawing
              ? "Click for corners · drag for curves · click first point to close"
              : "Select a point, then drag it or its handles. Shift: constrain · Alt: break handles"
          }
        >
          <Info aria-hidden="true" />
        </PathAction>
        <div className="path-tool-separator" />
        {!drawing && (
          <>
            <PathAction
              label="Sharp (hard)"
              tip="Sharp point · remove curve handles"
              disabled={!selection}
              aria-pressed={
                !!selection &&
                contours[selection.contour].points[selection.point]
                  ?.point_type === "corner"
              }
              onClick={() => changeSelected("corner")}
            >
              <CornerUpRight aria-hidden="true" />
            </PathAction>
            <PathAction
              label="Smooth (soft)"
              tip="Smooth point · keep handles aligned"
              disabled={!selection}
              aria-pressed={
                !!selection &&
                contours[selection.contour].points[selection.point]
                  ?.point_type === "smooth"
              }
              onClick={() => changeSelected("smooth")}
            >
              <Spline aria-hidden="true" />
            </PathAction>
            <PathAction
              label="Symmetric"
              tip="Symmetric point · aligned handles of equal length"
              disabled={!selection}
              aria-pressed={
                !!selection &&
                contours[selection.contour].points[selection.point]
                  ?.point_type === "symmetric"
              }
              onClick={() => changeSelected("symmetric")}
            >
              <UnfoldHorizontal aria-hidden="true" />
            </PathAction>
            <PathAction
              label="Add anchor"
              tip="Add an anchor after the selected point"
              disabled={
                !selection ||
                (!selectedContour?.closed &&
                  selection.point === selectedContour!.points.length - 1)
              }
              onClick={() => changeSelected("split")}
            >
              <Plus aria-hidden="true" />
            </PathAction>
            <PathAction
              label="Delete anchor"
              tip="Delete selected anchor"
              disabled={!selectedContour || selectedContour.points.length <= 2}
              onClick={() => changeSelected("delete")}
            >
              <Minus aria-hidden="true" />
            </PathAction>
            <PathAction
              label="Continue path"
              tip="Continue from a selected open endpoint"
              disabled={
                !selectedContour ||
                selectedContour.closed ||
                (selection?.point !== 0 &&
                  selection?.point !== selectedContour.points.length - 1)
              }
              onClick={() => {
                const next = structuredClone(draft.current),
                  c = next[selection!.contour];
                if (selection!.point === 0)
                  c.points.reverse().forEach((p) => {
                    [p.handle_in, p.handle_out] = [p.handle_out, p.handle_in];
                  });
                update(next);
                setSelection({
                  contour: selection!.contour,
                  point: c.points.length - 1,
                });
                setDrawing(true);
                svg.current?.focus();
              }}
            >
              <PenLine aria-hidden="true" />
            </PathAction>
          </>
        )}
        <div className="path-tool-separator" />
        <PathAction
          label={drawing ? "Finish path" : "Done"}
          tip={drawing ? "Finish path · Enter" : "Done editing · Escape"}
          onClick={drawing ? finish : onClose}
        >
          <Check aria-hidden="true" />
        </PathAction>
        {drawing && (
          <PathAction
            label="Cancel"
            tip="Cancel drawing · Escape"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </PathAction>
        )}
      </div>
    </>
  );
}

function PathAction({
  label,
  tip,
  children,
  ...props
}: ComponentProps<"button"> & { label: string; tip?: string }) {
  return (
    <span className="path-tool-action">
      <button type="button" aria-label={label} {...props}>
        {children}
      </button>
      <span className="path-tool-tooltip" role="tooltip">
        {tip ?? label}
      </span>
    </span>
  );
}
