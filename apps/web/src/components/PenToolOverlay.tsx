import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from "react";
import type { OpenLibraRenderer } from "../renderer";

export type PenPathPoint = {
  position: [number, number];
  handle_in?: [number, number];
  handle_out?: [number, number];
  point_type: "corner" | "smooth" | "symmetric";
};

export function PenToolOverlay({
  rendererRef,
  onCreatePath,
}: {
  rendererRef: RefObject<OpenLibraRenderer | undefined>;
  onCreatePath: (points: PenPathPoint[], closed: boolean) => void;
}) {
  const overlayRef = useRef<SVGSVGElement>(null);
  const dragIndexRef = useRef<number | undefined>(undefined);
  const [draft, setDraft] = useState<PenPathPoint[]>([]);
  const [hover, setHover] = useState<[number, number]>();

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const draw = () => {
      const overlay = overlayRef.current;
      if (!overlay) return;
      const bounds = overlay.getBoundingClientRect();
      const screen = (point: [number, number]) => {
        const value = renderer.clientPointFromWorld(point[0], point[1]);
        return [value.x - bounds.left, value.y - bounds.top] as [
          number,
          number,
        ];
      };
      const path = overlay.querySelector<SVGPathElement>("[data-pen-path]");
      if (path) path.setAttribute("d", draftPath(draft, screen));
      const preview =
        overlay.querySelector<SVGLineElement>("[data-pen-preview]");
      const last = draft.at(-1);
      if (preview && last && hover) {
        const from = screen(last.position);
        const to = screen(hover);
        preview.setAttribute("x1", String(from[0]));
        preview.setAttribute("y1", String(from[1]));
        preview.setAttribute("x2", String(to[0]));
        preview.setAttribute("y2", String(to[1]));
      }
      for (const anchor of overlay.querySelectorAll<SVGCircleElement>(
        "[data-pen-anchor]",
      )) {
        const point = draft[Number(anchor.dataset.index)];
        if (!point) continue;
        const value = screen(point.position);
        anchor.setAttribute("cx", String(value[0]));
        anchor.setAttribute("cy", String(value[1]));
      }
      const active = draft.at(-1);
      for (const handle of overlay.querySelectorAll<SVGCircleElement>(
        "[data-pen-handle]",
      )) {
        if (!active) continue;
        const value =
          handle.dataset.handle === "in" ? active.handle_in : active.handle_out;
        if (!value) continue;
        const point = screen(value);
        handle.setAttribute("cx", String(point[0]));
        handle.setAttribute("cy", String(point[1]));
      }
      for (const line of overlay.querySelectorAll<SVGLineElement>(
        "[data-pen-handle-line]",
      )) {
        if (!active) continue;
        const value =
          line.dataset.handle === "in" ? active.handle_in : active.handle_out;
        if (!value) continue;
        const from = screen(active.position);
        const to = screen(value);
        line.setAttribute("x1", String(from[0]));
        line.setAttribute("y1", String(from[1]));
        line.setAttribute("x2", String(to[0]));
        line.setAttribute("y2", String(to[1]));
      }
    };
    const unsubscribe = renderer.onFrame(draw);
    draw();
    return unsubscribe;
  }, [draft, hover, rendererRef]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finish(false);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setDraft([]);
      } else if (event.key === "Backspace" && draft.length > 0) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setDraft((points) => points.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  });

  function worldFromEvent(event: PointerEvent<SVGSVGElement>) {
    const renderer = rendererRef.current;
    if (!renderer) return undefined;
    const world = renderer.worldPointFromClient(event.clientX, event.clientY);
    let position = [world.x, world.y] as [number, number];
    const previous = draft.at(-1)?.position;
    if (event.shiftKey && previous)
      position = constrainAngle(previous, position);
    return position;
  }

  function finish(closed: boolean, points = draft) {
    const minimum = closed ? 3 : 2;
    if (points.length >= minimum) onCreatePath(points, closed);
    setDraft([]);
    setHover(undefined);
    dragIndexRef.current = undefined;
  }

  function pointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    const renderer = rendererRef.current;
    const position = worldFromEvent(event);
    if (!renderer || !position) return;
    if (draft.length >= 3) {
      const first = renderer.clientPointFromWorld(
        draft[0].position[0],
        draft[0].position[1],
      );
      if (Math.hypot(first.x - event.clientX, first.y - event.clientY) <= 10) {
        event.preventDefault();
        finish(true);
        return;
      }
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragIndexRef.current = draft.length;
    setDraft((points) => [...points, { position, point_type: "corner" }]);
  }

  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    const position = worldFromEvent(event);
    if (!position) return;
    setHover(position);
    const index = dragIndexRef.current;
    if (
      index === undefined ||
      !event.currentTarget.hasPointerCapture(event.pointerId)
    )
      return;
    setDraft((points) => {
      const next = [...points];
      const point = next[index];
      if (!point) return points;
      const outgoing = event.shiftKey
        ? constrainAngle(point.position, position)
        : position;
      next[index] = {
        ...point,
        handle_out: outgoing,
        handle_in: [
          point.position[0] * 2 - outgoing[0],
          point.position[1] * 2 - outgoing[1],
        ],
        point_type: "symmetric",
      };
      return next;
    });
  }

  function pointerUp(event: PointerEvent<SVGSVGElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    dragIndexRef.current = undefined;
  }

  const active = draft.at(-1);
  return (
    <svg
      ref={overlayRef}
      className="pen-tool-overlay"
      aria-label="Pen tool canvas"
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={pointerUp}
      onDoubleClick={(event) => {
        event.preventDefault();
        const points = draft.length > 2 ? draft.slice(0, -1) : draft;
        finish(false, points);
      }}
    >
      <path data-pen-path="true" className="pen-draft-path" />
      {draft.length > 0 && hover && (
        <line data-pen-preview="true" className="pen-preview-line" />
      )}
      {draft.map((_, index) => (
        <circle
          key={index}
          data-pen-anchor="true"
          data-index={index}
          className={index === 0 ? "first" : undefined}
          r={index === 0 && draft.length >= 3 ? 5 : 4}
        />
      ))}
      {active &&
        (["in", "out"] as const).map((handle) => {
          if (!(handle === "in" ? active.handle_in : active.handle_out))
            return null;
          return (
            <g key={handle}>
              <line
                data-pen-handle-line="true"
                data-handle={handle}
                className="vector-handle-line"
              />
              <circle
                data-pen-handle="true"
                data-handle={handle}
                className="vector-handle"
                r={4}
              />
            </g>
          );
        })}
    </svg>
  );
}

function draftPath(
  points: PenPathPoint[],
  screen: (point: [number, number]) => [number, number],
) {
  const first = points[0];
  if (!first) return "";
  const start = screen(first.position);
  const commands = [`M ${start[0]} ${start[1]}`];
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const endpoint = screen(to.position);
    if (from.handle_out || to.handle_in) {
      const a = screen(from.handle_out ?? from.position);
      const b = screen(to.handle_in ?? to.position);
      commands.push(
        `C ${a[0]} ${a[1]} ${b[0]} ${b[1]} ${endpoint[0]} ${endpoint[1]}`,
      );
    } else commands.push(`L ${endpoint[0]} ${endpoint[1]}`);
  }
  return commands.join(" ");
}

function constrainAngle(origin: [number, number], point: [number, number]) {
  const dx = point[0] - origin[0];
  const dy = point[1] - origin[1];
  const length = Math.hypot(dx, dy);
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return [
    origin[0] + Math.cos(angle) * length,
    origin[1] + Math.sin(angle) * length,
  ] as [number, number];
}
