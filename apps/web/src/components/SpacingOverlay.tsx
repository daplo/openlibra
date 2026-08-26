import { useEffect, useRef, type RefObject } from "react";
import type { OpenLibraRenderer } from "../renderer";
import type { NodeSummary } from "../editor/types";

export function SpacingOverlay({
  rendererRef,
  interactionCanvasRef,
  nodes,
  selected,
}: {
  rendererRef: RefObject<OpenLibraRenderer | undefined>;
  interactionCanvasRef: RefObject<HTMLCanvasElement | null>;
  nodes: NodeSummary[];
  selected: NodeSummary[];
}) {
  const overlayRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const interactionCanvas = interactionCanvasRef.current;
    if (!interactionCanvas) return;
    let altPressed = false;
    let pointer: { x: number; y: number } | undefined;
    let frame = 0;
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Alt") altPressed = true;
    };
    const keyUp = (event: KeyboardEvent) => {
      if (event.key === "Alt") altPressed = false;
    };
    const pointerMove = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
      altPressed = event.altKey || altPressed;
    };
    const pointerLeave = () => {
      pointer = undefined;
    };
    const clearAlt = () => {
      altPressed = false;
    };
    const draw = () => {
      const overlay = overlayRef.current;
      const renderer = rendererRef.current;
      if (overlay && renderer) {
        const hovered =
          altPressed && pointer && selected.length === 1
            ? findSpacingTarget(
                renderer.worldPointFromClient(pointer.x, pointer.y),
                selected[0],
                nodes,
              )
            : undefined;
        overlay.dataset.visible = String(Boolean(hovered));
        drawSpacingOverlay(
          overlay,
          renderer.getViewState(),
          selected[0],
          hovered,
        );
      }
      frame = requestAnimationFrame(draw);
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", clearAlt);
    interactionCanvas.addEventListener("pointermove", pointerMove);
    interactionCanvas.addEventListener("pointerleave", pointerLeave);
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", clearAlt);
      interactionCanvas.removeEventListener("pointermove", pointerMove);
      interactionCanvas.removeEventListener("pointerleave", pointerLeave);
    };
  }, [interactionCanvasRef, nodes, rendererRef, selected]);
  return (
    <canvas
      ref={overlayRef}
      className="spacing-overlay"
      data-testid="spacing-overlay"
      aria-hidden="true"
    />
  );
}

function findSpacingTarget(
  point: { x: number; y: number },
  selected: NodeSummary,
  nodes: NodeSummary[],
) {
  const contains = (node: NodeSummary) =>
    point.x >= node.x &&
    point.x <= node.x + node.width &&
    point.y >= node.y &&
    point.y <= node.y + node.height;
  const candidates = nodes.filter(
    (node) => node.id !== selected.id && !node.locked && contains(node),
  );
  const topmost = [...candidates].reverse();
  return (
    topmost.find((node) => node.parent_id === selected.parent_id) ?? topmost[0]
  );
}

function drawSpacingOverlay(
  canvas: HTMLCanvasElement,
  view: { pan: { x: number; y: number }; zoom: number },
  selected?: NodeSummary,
  hovered?: NodeSummary,
) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const ratio = devicePixelRatio;
  if (
    canvas.width !== Math.max(1, Math.floor(width * ratio)) ||
    canvas.height !== Math.max(1, Math.floor(height * ratio))
  ) {
    canvas.width = Math.max(1, Math.floor(width * ratio));
    canvas.height = Math.max(1, Math.floor(height * ratio));
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  if (!selected || !hovered) return;
  const screen = (node: NodeSummary) => ({
    left: node.x * view.zoom + view.pan.x,
    top: node.y * view.zoom + view.pan.y,
    right: (node.x + node.width) * view.zoom + view.pan.x,
    bottom: (node.y + node.height) * view.zoom + view.pan.y,
  });
  const a = screen(selected);
  const b = screen(hovered);
  context.save();
  context.strokeStyle = "#ff4f9a";
  context.fillStyle = "#ff4f9a";
  context.lineWidth = 1;
  context.setLineDash([4, 3]);
  context.strokeRect(
    b.left + 0.5,
    b.top + 0.5,
    b.right - b.left,
    b.bottom - b.top,
  );
  context.setLineDash([]);
  if (b.right <= a.left)
    drawSpacingDimension(
      context,
      b.right,
      a.left,
      overlapMidpoint(a.top, a.bottom, b.top, b.bottom),
      "horizontal",
      Math.round(selected.x - (hovered.x + hovered.width)),
    );
  else if (b.left >= a.right)
    drawSpacingDimension(
      context,
      a.right,
      b.left,
      overlapMidpoint(a.top, a.bottom, b.top, b.bottom),
      "horizontal",
      Math.round(hovered.x - (selected.x + selected.width)),
    );
  if (b.bottom <= a.top)
    drawSpacingDimension(
      context,
      b.bottom,
      a.top,
      overlapMidpoint(a.left, a.right, b.left, b.right),
      "vertical",
      Math.round(selected.y - (hovered.y + hovered.height)),
    );
  else if (b.top >= a.bottom)
    drawSpacingDimension(
      context,
      a.bottom,
      b.top,
      overlapMidpoint(a.left, a.right, b.left, b.right),
      "vertical",
      Math.round(hovered.y - (selected.y + selected.height)),
    );
  context.restore();
}

function overlapMidpoint(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
) {
  const start = Math.max(aStart, bStart);
  const end = Math.min(aEnd, bEnd);
  return start <= end ? (start + end) / 2 : (aStart + aEnd + bStart + bEnd) / 4;
}

function drawSpacingDimension(
  context: CanvasRenderingContext2D,
  start: number,
  end: number,
  cross: number,
  direction: "horizontal" | "vertical",
  value: number,
) {
  context.beginPath();
  if (direction === "horizontal") {
    context.moveTo(start, cross);
    context.lineTo(end, cross);
    context.moveTo(start, cross - 4);
    context.lineTo(start, cross + 4);
    context.moveTo(end, cross - 4);
    context.lineTo(end, cross + 4);
  } else {
    context.moveTo(cross, start);
    context.lineTo(cross, end);
    context.moveTo(cross - 4, start);
    context.lineTo(cross + 4, start);
    context.moveTo(cross - 4, end);
    context.lineTo(cross + 4, end);
  }
  context.stroke();
  const label = `${Math.max(0, value)} px`;
  context.font = "600 10px ui-monospace, SFMono-Regular, monospace";
  const labelWidth = context.measureText(label).width + 10;
  const x =
    direction === "horizontal" ? (start + end - labelWidth) / 2 : cross + 7;
  const y = direction === "horizontal" ? cross - 20 : (start + end) / 2 - 10;
  context.fillStyle = "#2b1020";
  context.beginPath();
  context.roundRect(x, y, labelWidth, 18, 4);
  context.fill();
  context.fillStyle = "#ff8bbb";
  context.textBaseline = "middle";
  context.fillText(label, x + 5, y + 9);
}
