import {
  useEffect,
  useMemo,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import type { NodeSummary, VectorPoint } from "../editor/types";
import type { CanvasTool, OpenLibraRenderer } from "../renderer";

export type VectorPointSelection = {
  nodeId: string;
  contourId: string;
  pointId: string;
  contourIndex: number;
  pointIndex: number;
};

type HandleKind = "in" | "out";

export function VectorPointOverlay({
  rendererRef,
  node,
  tool,
  selectedPoint,
  onSelectPoint,
  onBeginMove,
  onMovePoint,
  onMoveHandle,
  onEndMove,
  onDeletePoint,
  onInsertPoint,
  onCutSegment,
}: {
  rendererRef: RefObject<OpenLibraRenderer | undefined>;
  node: NodeSummary;
  tool: CanvasTool;
  selectedPoint?: VectorPointSelection;
  onSelectPoint: (selection: VectorPointSelection) => void;
  onBeginMove: () => void;
  onMovePoint: (
    selection: VectorPointSelection,
    position: [number, number],
  ) => void;
  onMoveHandle: (
    selection: VectorPointSelection,
    handle: HandleKind,
    position: [number, number],
  ) => void;
  onEndMove: () => void;
  onDeletePoint: (selection: VectorPointSelection) => void;
  onInsertPoint: (
    node: NodeSummary,
    contourId: string,
    startPointId: string,
    t: number,
  ) => void;
  onCutSegment: (
    node: NodeSummary,
    contourId: string,
    startPointId: string,
    t: number,
  ) => void;
}) {
  const overlayRef = useRef<SVGSVGElement>(null);
  const contours = useMemo(
    () =>
      node.vector?.geometry.type === "path"
        ? node.vector.geometry.contours
        : [],
    [node.vector],
  );
  const segments = useMemo(
    () =>
      contours.flatMap((contour, contourIndex) => {
        const count = contour.closed
          ? contour.points.length
          : Math.max(0, contour.points.length - 1);
        return Array.from({ length: count }, (_, segmentIndex) => ({
          contour,
          contourIndex,
          segmentIndex,
          from: contour.points[segmentIndex],
          to: contour.points[(segmentIndex + 1) % contour.points.length],
        }));
      }),
    [contours],
  );
  const selected = selectedPoint
    ? contours
        .find((contour) => contour.id === selectedPoint.contourId)
        ?.points.find((point) => point.id === selectedPoint.pointId)
    : undefined;

  useEffect(() => {
    let discoveryFrame = 0;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    const update = () => {
      const overlay = overlayRef.current;
      const renderer = rendererRef.current;
      if (!overlay || !renderer) return;
      const overlayBounds = overlay.getBoundingClientRect();
      const screenPoint = (position: [number, number]) => {
        const world = vectorLocalToWorld(node, position);
        const screen = renderer.clientPointFromWorld(world[0], world[1]);
        return [
          screen.x - overlayBounds.left,
          screen.y - overlayBounds.top,
        ] as [number, number];
      };
      for (const element of overlay.querySelectorAll<SVGCircleElement>(
        "[data-vector-point]",
      )) {
        const point = contours
          .find((contour) => contour.id === element.dataset.contourId)
          ?.points.find((item) => item.id === element.dataset.pointId);
        if (!point) continue;
        const screen = screenPoint(point.position);
        element.setAttribute("cx", String(screen[0]));
        element.setAttribute("cy", String(screen[1]));
      }
      for (const element of overlay.querySelectorAll<SVGPathElement>(
        "[data-vector-segment]",
      )) {
        const segment = segments.find(
          (item) =>
            item.contour.id === element.dataset.contourId &&
            item.from.id === element.dataset.startPointId,
        );
        if (!segment) continue;
        const from = screenPoint(segment.from.position);
        const to = screenPoint(segment.to.position);
        if (segment.from.handle_out || segment.to.handle_in) {
          const controlA = screenPoint(
            segment.from.handle_out ?? segment.from.position,
          );
          const controlB = screenPoint(
            segment.to.handle_in ?? segment.to.position,
          );
          element.setAttribute(
            "d",
            `M ${from[0]} ${from[1]} C ${controlA[0]} ${controlA[1]} ${controlB[0]} ${controlB[1]} ${to[0]} ${to[1]}`,
          );
        } else {
          element.setAttribute(
            "d",
            `M ${from[0]} ${from[1]} L ${to[0]} ${to[1]}`,
          );
        }
      }
      for (const element of overlay.querySelectorAll<SVGLineElement>(
        "[data-vector-handle-line]",
      )) {
        if (!selected) continue;
        const handle = element.dataset.handle === "out" ? "out" : "in";
        const value =
          handle === "out" ? selected.handle_out : selected.handle_in;
        if (!value) continue;
        const anchor = screenPoint(selected.position);
        const endpoint = screenPoint(value);
        element.setAttribute("x1", String(anchor[0]));
        element.setAttribute("y1", String(anchor[1]));
        element.setAttribute("x2", String(endpoint[0]));
        element.setAttribute("y2", String(endpoint[1]));
      }
      for (const element of overlay.querySelectorAll<SVGCircleElement>(
        "[data-vector-handle]",
      )) {
        if (!selected) continue;
        const value =
          element.dataset.handle === "out"
            ? selected.handle_out
            : selected.handle_in;
        if (!value) continue;
        const endpoint = screenPoint(value);
        element.setAttribute("cx", String(endpoint[0]));
        element.setAttribute("cy", String(endpoint[1]));
      }
    };
    const connect = () => {
      if (cancelled) return;
      const renderer = rendererRef.current;
      if (renderer) {
        unsubscribe = renderer.onFrame(update);
        update();
      } else discoveryFrame = requestAnimationFrame(connect);
    };
    connect();
    return () => {
      cancelled = true;
      cancelAnimationFrame(discoveryFrame);
      unsubscribe?.();
    };
  }, [contours, node, rendererRef, segments, selected]);

  function localPosition(event: { clientX: number; clientY: number }) {
    const renderer = rendererRef.current;
    if (!renderer) return undefined;
    const world = renderer.worldPointFromClient(event.clientX, event.clientY);
    return vectorWorldToLocal(node, [world.x, world.y]);
  }

  function selectionFor(contourIndex: number, pointIndex: number) {
    const contour = contours[contourIndex];
    const point = contour?.points[pointIndex];
    if (!contour || !point) return undefined;
    return {
      nodeId: node.id,
      contourId: contour.id,
      pointId: point.id,
      contourIndex,
      pointIndex,
    };
  }

  function beginDrag(
    event: PointerEvent<SVGElement>,
    selection: VectorPointSelection,
  ) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelectPoint(selection);
    onBeginMove();
  }

  function endDrag(event: PointerEvent<SVGElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    onEndMove();
  }

  return (
    <svg
      ref={overlayRef}
      className={`vector-point-overlay tool-${tool}`}
      aria-label="Vector point editor"
    >
      <g className="vector-segments">
        {segments.map((segment) => {
          const key = `${segment.contour.id}:${segment.from.id}`;
          const activate = (
            event:
              PointerEvent<SVGPathElement> | ReactMouseEvent<SVGPathElement>,
            action: "insert" | "cut",
          ) => {
            const target = localPosition(event);
            if (!target) return;
            const t = nearestSegmentT(segment.from, segment.to, target, node);
            if (action === "cut") {
              onCutSegment(node, segment.contour.id, segment.from.id, t);
            } else {
              onInsertPoint(node, segment.contour.id, segment.from.id, t);
            }
            event.preventDefault();
            event.stopPropagation();
          };
          return (
            <g key={key}>
              <path
                className="vector-segment-visible"
                data-vector-segment="true"
                data-contour-id={segment.contour.id}
                data-start-point-id={segment.from.id}
              />
              <path
                className="vector-segment-hit"
                data-vector-segment="true"
                data-contour-id={segment.contour.id}
                data-start-point-id={segment.from.id}
                onPointerDown={(event) => {
                  if (tool === "knife") activate(event, "cut");
                }}
                onDoubleClick={(event) => {
                  if (tool !== "knife") activate(event, "insert");
                }}
              />
            </g>
          );
        })}
      </g>
      {selectedPoint &&
        selected &&
        (["in", "out"] as HandleKind[]).map((handle) => {
          const value =
            handle === "in" ? selected.handle_in : selected.handle_out;
          if (!value) return null;
          return (
            <g key={handle}>
              <line
                className="vector-handle-line"
                data-vector-handle-line="true"
                data-handle={handle}
              />
              <circle
                className="vector-handle"
                data-vector-handle="true"
                data-handle={handle}
                r={4}
                tabIndex={0}
                aria-label={`${handle === "in" ? "Incoming" : "Outgoing"} Bézier handle`}
                onPointerDown={(event) => beginDrag(event, selectedPoint)}
                onPointerMove={(event) => {
                  if (!event.currentTarget.hasPointerCapture(event.pointerId))
                    return;
                  const position = localPosition(event);
                  if (position) onMoveHandle(selectedPoint, handle, position);
                }}
                onPointerUp={endDrag}
                onPointerCancel={onEndMove}
              />
            </g>
          );
        })}
      {contours.flatMap((contour, contourIndex) =>
        contour.points.map((_, pointIndex) => {
          const selection = selectionFor(contourIndex, pointIndex)!;
          const active =
            selectedPoint?.nodeId === node.id &&
            selectedPoint.contourId === contour.id &&
            selectedPoint.pointId === selection.pointId;
          return (
            <circle
              key={selection.pointId}
              data-vector-point="true"
              data-contour-id={contour.id}
              data-point-id={selection.pointId}
              className={active ? "selected" : undefined}
              r={active ? 5 : 4}
              tabIndex={0}
              aria-label={`Anchor ${pointIndex + 1} of contour ${contourIndex + 1}`}
              onPointerDown={(event) => beginDrag(event, selection)}
              onPointerMove={(event) => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId))
                  return;
                const position = localPosition(event);
                if (position) onMovePoint(selection, position);
              }}
              onPointerUp={endDrag}
              onPointerCancel={onEndMove}
              onFocus={() => onSelectPoint(selection)}
              onKeyDown={(event) => {
                if (event.key !== "Delete" && event.key !== "Backspace") return;
                event.preventDefault();
                event.stopPropagation();
                onDeletePoint(selection);
              }}
            />
          );
        }),
      )}
    </svg>
  );
}

function nearestSegmentT(
  from: VectorPoint,
  to: VectorPoint,
  target: [number, number],
  node: NodeSummary,
) {
  let bestT = 0.5;
  let bestDistance = Number.POSITIVE_INFINITY;
  const p0 = from.position;
  const p1 = from.handle_out ?? p0;
  const p3 = to.position;
  const p2 = to.handle_in ?? p3;
  for (let index = 0; index <= 80; index += 1) {
    const t = index / 80;
    const point = cubicPoint(p0, p1, p2, p3, t);
    const dx = (point[0] - target[0]) * node.width;
    const dy = (point[1] - target[1]) * node.height;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestT = t;
    }
  }
  return Math.min(0.999, Math.max(0.001, bestT));
}

function cubicPoint(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  t: number,
) {
  const inverse = 1 - t;
  return [
    inverse ** 3 * p0[0] +
      3 * inverse ** 2 * t * p1[0] +
      3 * inverse * t ** 2 * p2[0] +
      t ** 3 * p3[0],
    inverse ** 3 * p0[1] +
      3 * inverse ** 2 * t * p1[1] +
      3 * inverse * t ** 2 * p2[1] +
      t ** 3 * p3[1],
  ] as [number, number];
}

function vectorLocalToWorld(node: NodeSummary, position: [number, number]) {
  let x = (position[0] - 0.5) * node.width;
  let y = (position[1] - 0.5) * node.height;
  if (node.flip_x) x = -x;
  if (node.flip_y) y = -y;
  const angle = (node.rotation * Math.PI) / 180;
  return [
    node.x + node.width / 2 + x * Math.cos(angle) - y * Math.sin(angle),
    node.y + node.height / 2 + x * Math.sin(angle) + y * Math.cos(angle),
  ] as [number, number];
}

function vectorWorldToLocal(node: NodeSummary, world: [number, number]) {
  const angle = (-node.rotation * Math.PI) / 180;
  const dx = world[0] - node.x - node.width / 2;
  const dy = world[1] - node.y - node.height / 2;
  let x = dx * Math.cos(angle) - dy * Math.sin(angle);
  let y = dx * Math.sin(angle) + dy * Math.cos(angle);
  if (node.flip_x) x = -x;
  if (node.flip_y) y = -y;
  return [x / node.width + 0.5, y / node.height + 0.5] as [number, number];
}
