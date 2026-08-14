import {
  useEffect,
  useMemo,
  useRef,
  type PointerEvent,
  type RefObject,
} from "react";
import type { NodeSummary } from "../editor/types";
import type { OpenLibraRenderer } from "../renderer";

export type VectorPointSelection = {
  nodeId: string;
  contourIndex: number;
  pointIndex: number;
};

export function VectorPointOverlay({
  rendererRef,
  node,
  selectedPoint,
  onSelectPoint,
  onBeginMove,
  onMovePoint,
  onEndMove,
  onDeletePoint,
}: {
  rendererRef: RefObject<OpenLibraRenderer | undefined>;
  node: NodeSummary;
  selectedPoint?: VectorPointSelection;
  onSelectPoint: (selection: VectorPointSelection) => void;
  onBeginMove: () => void;
  onMovePoint: (
    selection: VectorPointSelection,
    position: [number, number],
  ) => void;
  onEndMove: () => void;
  onDeletePoint: (selection: VectorPointSelection) => void;
}) {
  const overlayRef = useRef<SVGSVGElement>(null);
  const contours = useMemo(
    () =>
      node.vector?.geometry.type === "path"
        ? node.vector.geometry.contours
        : [],
    [node.vector],
  );
  useEffect(() => {
    let discoveryFrame = 0;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    const update = () => {
      const overlay = overlayRef.current;
      const renderer = rendererRef.current;
      if (!overlay || !renderer) return;
      for (const element of overlay.querySelectorAll<SVGCircleElement>(
        "[data-vector-point]",
      )) {
        const contourIndex = Number(element.dataset.contourIndex);
        const pointIndex = Number(element.dataset.pointIndex);
        const point = contours[contourIndex]?.points[pointIndex];
        if (!point) continue;
        const world = vectorLocalToWorld(node, point.position);
        const screen = renderer.clientPointFromWorld(world[0], world[1]);
        const overlayBounds = overlay.getBoundingClientRect();
        element.setAttribute("cx", String(screen.x - overlayBounds.left));
        element.setAttribute("cy", String(screen.y - overlayBounds.top));
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
  }, [contours, node, rendererRef]);

  function movePoint(
    event: PointerEvent<SVGCircleElement>,
    selection: VectorPointSelection,
  ) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const renderer = rendererRef.current;
    if (!renderer) return;
    const world = renderer.worldPointFromClient(event.clientX, event.clientY);
    onMovePoint(selection, vectorWorldToLocal(node, [world.x, world.y]));
  }

  return (
    <svg
      ref={overlayRef}
      className="vector-point-overlay"
      aria-label="Vector point editor"
    >
      {contours.flatMap((contour, contourIndex) =>
        contour.points.map((_, pointIndex) => {
          const selection = { nodeId: node.id, contourIndex, pointIndex };
          const active =
            selectedPoint?.nodeId === node.id &&
            selectedPoint.contourIndex === contourIndex &&
            selectedPoint.pointIndex === pointIndex;
          return (
            <circle
              key={`${contourIndex}:${pointIndex}`}
              data-vector-point="true"
              data-contour-index={contourIndex}
              data-point-index={pointIndex}
              className={active ? "selected" : undefined}
              r={active ? 5 : 4}
              tabIndex={0}
              aria-label={`Anchor ${pointIndex + 1} of contour ${contourIndex + 1}`}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                onSelectPoint(selection);
                onBeginMove();
              }}
              onPointerMove={(event) => movePoint(event, selection)}
              onPointerUp={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
                onEndMove();
              }}
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
