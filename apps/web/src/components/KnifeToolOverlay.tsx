import { useRef, useState, type PointerEvent, type RefObject } from "react";
import type { OpenLibraRenderer } from "../renderer";

type Point = [number, number];

export function KnifeToolOverlay({
  rendererRef,
  onCut,
}: {
  rendererRef: RefObject<OpenLibraRenderer | undefined>;
  onCut: (start: Point, end: Point) => void;
}) {
  const overlayRef = useRef<SVGSVGElement>(null);
  const worldStartRef = useRef<Point | undefined>(undefined);
  const [gesture, setGesture] = useState<{ start: Point; end: Point }>();

  function screenPoint(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return [event.clientX - bounds.left, event.clientY - bounds.top] as Point;
  }

  function worldPoint(event: PointerEvent<SVGSVGElement>) {
    const renderer = rendererRef.current;
    if (!renderer) return undefined;
    const point = renderer.worldPointFromClient(event.clientX, event.clientY);
    return [point.x, point.y] as Point;
  }

  return (
    <svg
      ref={overlayRef}
      className="knife-tool-overlay"
      aria-label="Knife tool canvas"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const world = worldPoint(event);
        if (!world) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const screen = screenPoint(event);
        worldStartRef.current = world;
        setGesture({ start: screen, end: screen });
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const end = screenPoint(event);
        setGesture((current) => (current ? { ...current, end } : undefined));
      }}
      onPointerUp={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        const start = worldStartRef.current;
        const end = worldPoint(event);
        if (
          start &&
          end &&
          Math.hypot(end[0] - start[0], end[1] - start[1]) >= 3
        )
          onCut(start, end);
        worldStartRef.current = undefined;
        setGesture(undefined);
      }}
      onPointerCancel={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
        worldStartRef.current = undefined;
        setGesture(undefined);
      }}
    >
      {gesture && (
        <line
          className="knife-gesture-line"
          x1={gesture.start[0]}
          y1={gesture.start[1]}
          x2={gesture.end[0]}
          y2={gesture.end[1]}
        />
      )}
    </svg>
  );
}
