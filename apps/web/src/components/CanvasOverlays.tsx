import { useEffect, useRef, type RefObject } from "react";
import type { OpenLibraRenderer, ColorTheme } from "../renderer";
import { hexWithAlpha, rgbaToHex } from "../editor/model-utils";
import { ensureGoogleFont } from "../editor/font-catalog";
import { mediaImageSource } from "../editor/media-source";
import type { MediaAsset, NodeSummary, VectorPoint } from "../editor/types";

export function CanvasGrid({
  rendererRef,
  theme,
}: {
  rendererRef: RefObject<OpenLibraRenderer | undefined>;
  theme: ColorTheme;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const renderer = rendererRef.current;
      if (canvas && renderer)
        drawCanvasGrid(canvas, renderer.getViewState(), theme);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [rendererRef, theme]);
  return (
    <canvas
      ref={canvasRef}
      className="canvas-grid"
      data-testid="canvas-grid"
      aria-hidden="true"
    />
  );
}

function drawCanvasGrid(
  canvas: HTMLCanvasElement,
  view: { pan: { x: number; y: number }; zoom: number },
  theme: ColorTheme,
) {
  const width = canvas.clientWidth,
    height = canvas.clientHeight,
    ratio = devicePixelRatio;
  if (
    canvas.width !== Math.floor(width * ratio) ||
    canvas.height !== Math.floor(height * ratio)
  ) {
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  let worldStep = 16;
  while (worldStep * view.zoom < 12) worldStep *= 2;
  const spacing = worldStep * view.zoom;
  const startX = ((view.pan.x % spacing) + spacing) % spacing;
  const startY = ((view.pan.y % spacing) + spacing) % spacing;
  const drawLines = (major: boolean) => {
    context.beginPath();
    for (
      let x = startX, index = Math.round((x - view.pan.x) / spacing);
      x <= width;
      x += spacing, index += 1
    ) {
      if ((index % 4 === 0) !== major) continue;
      context.moveTo(Math.round(x) + 0.5, 0);
      context.lineTo(Math.round(x) + 0.5, height);
    }
    for (
      let y = startY, index = Math.round((y - view.pan.y) / spacing);
      y <= height;
      y += spacing, index += 1
    ) {
      if ((index % 4 === 0) !== major) continue;
      context.moveTo(0, Math.round(y) + 0.5);
      context.lineTo(width, Math.round(y) + 0.5);
    }
    context.strokeStyle =
      theme === "light"
        ? major
          ? "#87909f35"
          : "#87909f1c"
        : major
          ? "#d8dde52c"
          : "#d8dde516";
    context.lineWidth = 1;
    context.stroke();
  };
  drawLines(false);
  drawLines(true);
}

export function Rulers({
  rendererRef,
  theme,
}: {
  rendererRef: RefObject<OpenLibraRenderer | undefined>;
  theme: ColorTheme;
}) {
  const horizontalRef = useRef<HTMLCanvasElement>(null);
  const verticalRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let frame = 0;
    function draw() {
      const renderer = rendererRef.current;
      const horizontal = horizontalRef.current;
      const vertical = verticalRef.current;
      if (renderer && horizontal && vertical)
        drawRulers(horizontal, vertical, renderer.getViewState(), theme);
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [rendererRef, theme]);
  return (
    <div className="rulers" aria-hidden="true">
      <canvas className="horizontal-ruler" ref={horizontalRef} />
      <canvas className="vertical-ruler" ref={verticalRef} />
      <span className="ruler-corner" />
    </div>
  );
}

export function SelectionOverlay({
  rendererRef,
  selected,
}: {
  rendererRef: RefObject<OpenLibraRenderer | undefined>;
  selected: NodeSummary[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const renderer = rendererRef.current;
      if (canvas && renderer) {
        const liveNodes = renderer.getSelectionNodes();
        const liveBounds =
          selected.length === 1 ? renderer.getSelectionBounds() : undefined;
        const liveById = new Map(liveNodes.map((node) => [node.id, node]));
        const hasCompleteLiveSelection =
          liveNodes.length === selected.length &&
          selected.every((node) => liveById.has(node.id));
        const visibleSelection = hasCompleteLiveSelection
          ? selected.map((node) => ({ ...node, ...liveById.get(node.id) }))
          : liveBounds && selected[0]
            ? [{ ...selected[0], ...liveBounds }]
            : selected;
        const resizing = renderer.isResizingSelection();
        canvas.dataset.resizing = String(resizing);
        canvas.dataset.componentSelection = String(
          visibleSelection.some(
            (node) => node.component_id || node.instance_root_id === node.id,
          ),
        );
        canvas.dataset.dimensions =
          resizing && visibleSelection[0]
            ? `${visibleSelection[0].width}x${visibleSelection[0].height}`
            : "";
        drawSelectionOverlay(
          canvas,
          renderer.getViewState(),
          visibleSelection,
          resizing,
        );
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [rendererRef, selected]);
  return (
    <canvas ref={canvasRef} className="selection-overlay" aria-hidden="true" />
  );
}

export function IsolationOverlay({
  rendererRef,
  root,
  theme,
}: {
  rendererRef: RefObject<OpenLibraRenderer | undefined>;
  root: NodeSummary;
  theme: ColorTheme;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const renderer = rendererRef.current;
      if (canvas && renderer) {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const ratio = devicePixelRatio;
        if (
          canvas.width !== Math.floor(width * ratio) ||
          canvas.height !== Math.floor(height * ratio)
        ) {
          canvas.width = Math.floor(width * ratio);
          canvas.height = Math.floor(height * ratio);
        }
        const context = canvas.getContext("2d");
        if (context) {
          const view = renderer.getViewState();
          const padding = 10;
          context.setTransform(ratio, 0, 0, ratio, 0, 0);
          context.clearRect(0, 0, width, height);
          context.fillStyle =
            theme === "light"
              ? "rgba(235, 238, 244, 0.9)"
              : "rgba(9, 10, 14, 0.88)";
          context.fillRect(0, 0, width, height);
          context.globalCompositeOperation = "destination-out";
          context.fillRect(
            root.x * view.zoom + view.pan.x - padding,
            root.y * view.zoom + view.pan.y - padding,
            root.width * view.zoom + padding * 2,
            root.height * view.zoom + padding * 2,
          );
          context.globalCompositeOperation = "source-over";
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [rendererRef, root, theme]);
  return (
    <canvas
      ref={canvasRef}
      className="isolation-overlay"
      data-testid="component-isolation-mask"
      aria-hidden="true"
    />
  );
}

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

export function TextOverlay({
  rendererRef,
  nodes,
  editingTextId,
}: {
  rendererRef: RefObject<OpenLibraRenderer | undefined>;
  nodes: NodeSummary[];
  editingTextId?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    for (const node of nodes) {
      if (node.text) ensureGoogleFont(node.text.font_family);
    }
  }, [nodes]);
  useEffect(() => {
    let cancelled = false;
    let discoveryFrame = 0;
    let unsubscribe: (() => void) | undefined;
    const draw = () => {
      const canvas = canvasRef.current;
      const renderer = rendererRef.current;
      if (canvas && renderer)
        drawTextOverlay(canvas, renderer.getViewState(), nodes, editingTextId);
    };
    const connect = () => {
      if (cancelled) return;
      const renderer = rendererRef.current;
      if (renderer) {
        unsubscribe = renderer.onFrame(draw);
        draw();
      } else {
        discoveryFrame = requestAnimationFrame(connect);
      }
    };
    connect();
    return () => {
      cancelled = true;
      cancelAnimationFrame(discoveryFrame);
      unsubscribe?.();
    };
  }, [rendererRef, nodes, editingTextId]);
  return <canvas ref={canvasRef} className="text-overlay" aria-hidden="true" />;
}

const mediaImageCache = new Map<string, HTMLImageElement>();

export function MediaOverlay({
  rendererRef,
  nodes,
  assets,
}: {
  rendererRef: RefObject<OpenLibraRenderer | undefined>;
  nodes: NodeSummary[];
  assets: MediaAsset[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    let discoveryFrame = 0;
    let unsubscribe: (() => void) | undefined;
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    const draw = () => {
      const canvas = canvasRef.current;
      const renderer = rendererRef.current;
      if (canvas && renderer)
        drawMediaOverlay(canvas, renderer.getViewState(), nodes, assetsById);
    };
    const connect = () => {
      if (cancelled) return;
      const renderer = rendererRef.current;
      if (renderer) {
        unsubscribe = renderer.onFrame(draw);
        draw();
      } else discoveryFrame = requestAnimationFrame(connect);
    };
    connect();
    return () => {
      cancelled = true;
      cancelAnimationFrame(discoveryFrame);
      unsubscribe?.();
    };
  }, [rendererRef, nodes, assets]);
  return (
    <canvas ref={canvasRef} className="media-overlay" aria-hidden="true" />
  );
}

export function VectorOverlay({
  rendererRef,
  nodes,
}: {
  rendererRef: RefObject<OpenLibraRenderer | undefined>;
  nodes: NodeSummary[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    let discoveryFrame = 0;
    let unsubscribe: (() => void) | undefined;
    const draw = () => {
      const canvas = canvasRef.current;
      const renderer = rendererRef.current;
      if (canvas && renderer)
        drawVectorOverlay(canvas, renderer.getViewState(), nodes);
    };
    const connect = () => {
      if (cancelled) return;
      const renderer = rendererRef.current;
      if (renderer) {
        unsubscribe = renderer.onFrame(draw);
        draw();
      } else discoveryFrame = requestAnimationFrame(connect);
    };
    connect();
    return () => {
      cancelled = true;
      cancelAnimationFrame(discoveryFrame);
      unsubscribe?.();
    };
  }, [rendererRef, nodes]);
  return (
    <canvas ref={canvasRef} className="vector-overlay" aria-hidden="true" />
  );
}

function drawVectorOverlay(
  canvas: HTMLCanvasElement,
  view: { pan: { x: number; y: number }; zoom: number },
  nodes: NodeSummary[],
) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const ratio = devicePixelRatio;
  if (
    canvas.width !== Math.floor(width * ratio) ||
    canvas.height !== Math.floor(height * ratio)
  ) {
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  for (const node of nodes) {
    if (node.kind !== "vector" || !node.vector) continue;
    const nodeWidth = node.width * view.zoom;
    const nodeHeight = node.height * view.zoom;
    const centerX = (node.x + node.width / 2) * view.zoom + view.pan.x;
    const centerY = (node.y + node.height / 2) * view.zoom + view.pan.y;
    context.save();
    context.translate(centerX, centerY);
    context.rotate((node.rotation * Math.PI) / 180);
    context.scale(node.flip_x ? -1 : 1, node.flip_y ? -1 : 1);
    context.translate(-nodeWidth / 2, -nodeHeight / 2);
    const path = vectorPath(node.vector.geometry, nodeWidth, nodeHeight);
    const isOpen =
      node.vector.geometry.type === "line" ||
      (node.vector.geometry.type === "path" &&
        node.vector.geometry.contours.every((contour) => !contour.closed));
    context.globalAlpha = node.opacity;
    if (!isOpen && node.fill[3] > 0) {
      context.fillStyle = rgbaToHex(node.fill);
      context.globalAlpha = node.opacity * node.fill[3];
      context.fill(
        path,
        node.vector.fill_rule === "evenodd" ? "evenodd" : "nonzero",
      );
    }
    if (node.stroke_width > 0 && node.stroke[3] > 0) {
      context.strokeStyle = rgbaToHex(node.stroke);
      context.lineWidth = node.stroke_width * view.zoom;
      context.lineJoin = node.stroke_join === "round" ? "round" : "miter";
      context.lineCap = node.vector.geometry.type === "line" ? "round" : "butt";
      context.globalAlpha = node.opacity * node.stroke[3];
      context.stroke(path);
    }
    context.restore();
  }
}

function vectorPath(
  geometry: NonNullable<NodeSummary["vector"]>["geometry"],
  width: number,
  height: number,
) {
  const path = new Path2D();
  if (geometry.type === "ellipse") {
    path.ellipse(
      width / 2,
      height / 2,
      width / 2,
      height / 2,
      0,
      0,
      Math.PI * 2,
    );
    return path;
  }
  if (geometry.type === "line") {
    path.moveTo(0, height / 2);
    path.lineTo(width, height / 2);
    return path;
  }
  if (geometry.type === "polygon" || geometry.type === "star") {
    const count =
      geometry.type === "polygon" ? geometry.sides : geometry.points * 2;
    const outerRadius = Math.min(width, height) / 2;
    const centerX = width / 2;
    const centerY = height / 2;
    for (let index = 0; index < count; index += 1) {
      const radius =
        geometry.type === "star" && index % 2 === 1
          ? outerRadius * geometry.inner_ratio
          : outerRadius;
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      if (index === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    path.closePath();
    return path;
  }
  for (const contour of geometry.contours) {
    const first = contour.points[0];
    if (!first) continue;
    path.moveTo(first.position[0] * width, first.position[1] * height);
    for (let index = 1; index < contour.points.length; index += 1) {
      addVectorSegment(
        path,
        contour.points[index - 1],
        contour.points[index],
        width,
        height,
      );
    }
    if (contour.closed) {
      addVectorSegment(
        path,
        contour.points[contour.points.length - 1],
        first,
        width,
        height,
      );
      path.closePath();
    }
  }
  return path;
}

function addVectorSegment(
  path: Path2D,
  from: VectorPoint,
  to: VectorPoint,
  width: number,
  height: number,
) {
  if (from.handle_out || to.handle_in) {
    const controlA = from.handle_out ?? from.position;
    const controlB = to.handle_in ?? to.position;
    path.bezierCurveTo(
      controlA[0] * width,
      controlA[1] * height,
      controlB[0] * width,
      controlB[1] * height,
      to.position[0] * width,
      to.position[1] * height,
    );
  } else path.lineTo(to.position[0] * width, to.position[1] * height);
}

function drawMediaOverlay(
  canvas: HTMLCanvasElement,
  view: { pan: { x: number; y: number }; zoom: number },
  nodes: NodeSummary[],
  assets: Map<string, MediaAsset>,
) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const ratio = devicePixelRatio;
  if (
    canvas.width !== Math.floor(width * ratio) ||
    canvas.height !== Math.floor(height * ratio)
  ) {
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  for (const node of nodes) {
    if ((node.kind !== "image" && node.kind !== "icon") || !node.asset_id)
      continue;
    const asset = assets.get(node.asset_id);
    if (!asset) continue;
    const image = getMediaImage(
      asset,
      node.kind === "icon" ? rgbaToHex(node.fill) : undefined,
    );
    if (!image.complete || image.naturalWidth === 0) continue;
    const nodeWidth = node.width * view.zoom;
    const nodeHeight = node.height * view.zoom;
    const centerX = (node.x + node.width / 2) * view.zoom + view.pan.x;
    const centerY = (node.y + node.height / 2) * view.zoom + view.pan.y;
    context.save();
    context.translate(centerX, centerY);
    context.rotate((node.rotation * Math.PI) / 180);
    context.scale(node.flip_x ? -1 : 1, node.flip_y ? -1 : 1);
    context.globalAlpha = node.opacity;
    context.beginPath();
    context.roundRect(
      -nodeWidth / 2,
      -nodeHeight / 2,
      nodeWidth,
      nodeHeight,
      node.corner_radii.map((radius) => radius * view.zoom),
    );
    context.clip();
    drawFittedImage(context, image, node.image_fit, nodeWidth, nodeHeight);
    context.restore();
    if (node.stroke_width > 0 && node.stroke[3] > 0) {
      context.save();
      context.translate(centerX, centerY);
      context.rotate((node.rotation * Math.PI) / 180);
      context.globalAlpha = node.opacity * node.stroke[3];
      context.strokeStyle = rgbaToHex(node.stroke);
      context.lineWidth = node.stroke_width * view.zoom;
      context.beginPath();
      context.roundRect(
        -nodeWidth / 2,
        -nodeHeight / 2,
        nodeWidth,
        nodeHeight,
        node.corner_radii.map((radius) => radius * view.zoom),
      );
      context.stroke();
      context.restore();
    }
  }
}

function getMediaImage(asset: MediaAsset, color?: string) {
  const key = `${asset.id}:${color ?? "original"}`;
  const cached = mediaImageCache.get(key);
  if (cached) return cached;
  const image = new Image();
  image.decoding = "async";
  image.src = mediaImageSource(asset, color);
  mediaImageCache.set(key, image);
  return image;
}

function drawFittedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  fit: NodeSummary["image_fit"],
  width: number,
  height: number,
) {
  if (fit === "fill") {
    context.drawImage(image, -width / 2, -height / 2, width, height);
    return;
  }
  const scale =
    fit === "contain"
      ? Math.min(width / image.naturalWidth, height / image.naturalHeight)
      : Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(
    image,
    -drawWidth / 2,
    -drawHeight / 2,
    drawWidth,
    drawHeight,
  );
}

function drawTextOverlay(
  canvas: HTMLCanvasElement,
  view: { pan: { x: number; y: number }; zoom: number },
  nodes: NodeSummary[],
  editingTextId?: string,
) {
  const width = canvas.clientWidth,
    height = canvas.clientHeight,
    ratio = devicePixelRatio;
  if (
    canvas.width !== Math.floor(width * ratio) ||
    canvas.height !== Math.floor(height * ratio)
  ) {
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  for (const node of nodes) {
    if (node.kind !== "text" || !node.text || node.id === editingTextId)
      continue;
    const text = node.text;
    const nodeWidth = node.width * view.zoom;
    const nodeHeight = node.height * view.zoom;
    const centerX = (node.x + node.width / 2) * view.zoom + view.pan.x;
    const centerY = (node.y + node.height / 2) * view.zoom + view.pan.y;
    context.save();
    context.translate(centerX, centerY);
    context.rotate((node.rotation * Math.PI) / 180);
    context.beginPath();
    context.rect(-nodeWidth / 2, -nodeHeight / 2, nodeWidth, nodeHeight);
    context.clip();
    const fontSize = text.font_size * view.zoom;
    const lineHeight = fontSize * text.line_height;
    context.font = `${text.font_style} ${text.font_weight} ${fontSize}px ${JSON.stringify(text.font_family)}, sans-serif`;
    context.fillStyle = rgbaToHex(node.fill);
    context.globalAlpha = Math.min(1, node.opacity * (node.fill[3] ?? 1));
    context.textBaseline = "top";
    context.textAlign =
      text.horizontal_align === "justify" ? "left" : text.horizontal_align;
    const lines =
      text.sizing === "auto_width"
        ? text.content.split("\n")
        : wrapText(
            context,
            text.content,
            nodeWidth,
            text.letter_spacing * view.zoom,
          );
    const blockHeight = lines.length * lineHeight;
    let y = -nodeHeight / 2;
    if (text.vertical_align === "middle") y -= blockHeight / 2 - nodeHeight / 2;
    if (text.vertical_align === "bottom") y += nodeHeight - blockHeight;
    const x =
      text.horizontal_align === "center"
        ? 0
        : text.horizontal_align === "right"
          ? nodeWidth / 2
          : -nodeWidth / 2;
    for (const line of lines) {
      context.fillText(line, x, y);
      y += lineHeight;
    }
    context.restore();
  }
}

function wrapText(
  context: CanvasRenderingContext2D,
  content: string,
  maxWidth: number,
  letterSpacing: number,
) {
  const lines: string[] = [];
  for (const paragraph of content.split("\n")) {
    const words = paragraph.split(/\s+/);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      const width =
        context.measureText(candidate).width +
        Math.max(0, candidate.length - 1) * letterSpacing;
      if (line && width > maxWidth) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    lines.push(line);
  }
  return lines;
}

export function ArtboardGuides({
  rendererRef,
  artboards,
  nodes,
}: {
  rendererRef: RefObject<OpenLibraRenderer | undefined>;
  artboards: NodeSummary[];
  nodes: NodeSummary[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const renderer = rendererRef.current;
      if (canvas && renderer)
        drawArtboardGuides(canvas, renderer.getViewState(), artboards, nodes);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [rendererRef, artboards, nodes]);
  return (
    <canvas ref={canvasRef} className="artboard-guides" aria-hidden="true" />
  );
}

function drawArtboardGuides(
  canvas: HTMLCanvasElement,
  view: { pan: { x: number; y: number }; zoom: number },
  artboards: NodeSummary[],
  nodes: NodeSummary[],
) {
  const width = canvas.clientWidth,
    height = canvas.clientHeight,
    ratio = devicePixelRatio;
  if (
    canvas.width !== Math.floor(width * ratio) ||
    canvas.height !== Math.floor(height * ratio)
  ) {
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  for (const node of artboards) {
    const artboardWidth = node.width * view.zoom,
      artboardHeight = node.height * view.zoom;
    const centerX = (node.x + node.width / 2) * view.zoom + view.pan.x,
      centerY = (node.y + node.height / 2) * view.zoom + view.pan.y;
    const color = rgbaToHex(node.guide_color);
    const alpha = node.guide_opacity;
    context.save();
    context.translate(centerX, centerY);
    context.rotate((node.rotation * Math.PI) / 180);
    context.beginPath();
    context.rect(
      -artboardWidth / 2,
      -artboardHeight / 2,
      artboardWidth,
      artboardHeight,
    );
    context.clip();
    if (node.guide_mode === "columns") {
      const count = Math.max(1, node.guide_count),
        gutter = node.guide_gap * view.zoom;
      const columnWidth = Math.max(
        0,
        (artboardWidth - gutter * (count - 1)) / count,
      );
      context.fillStyle = hexWithAlpha(color, alpha);
      for (let index = 0; index < count; index++)
        context.fillRect(
          -artboardWidth / 2 + index * (columnWidth + gutter),
          -artboardHeight / 2,
          columnWidth,
          artboardHeight,
        );
    } else {
      const spacing = Math.max(2, node.guide_gap * view.zoom);
      context.strokeStyle = hexWithAlpha(color, alpha);
      context.lineWidth = 1;
      context.beginPath();
      for (let x = -artboardWidth / 2; x <= artboardWidth / 2; x += spacing) {
        context.moveTo(x, -artboardHeight / 2);
        context.lineTo(x, artboardHeight / 2);
      }
      for (let y = -artboardHeight / 2; y <= artboardHeight / 2; y += spacing) {
        context.moveTo(-artboardWidth / 2, y);
        context.lineTo(artboardWidth / 2, y);
      }
      context.stroke();
    }
    context.restore();
    const descendants = nodes.filter(
      (candidate) =>
        candidate.id !== node.id &&
        isDescendantOf(candidate, node.id, nodeById) &&
        candidate.kind !== "group" &&
        candidate.fill[3] * candidate.opacity > 0,
    );
    context.save();
    context.globalCompositeOperation = "destination-out";
    context.fillStyle = "#000000";
    for (const child of descendants) {
      const childWidth = child.width * view.zoom,
        childHeight = child.height * view.zoom;
      const childCenterX = (child.x + child.width / 2) * view.zoom + view.pan.x,
        childCenterY = (child.y + child.height / 2) * view.zoom + view.pan.y;
      context.save();
      context.translate(childCenterX, childCenterY);
      context.rotate((child.rotation * Math.PI) / 180);
      context.globalAlpha = Math.min(1, child.fill[3] * child.opacity);
      context.beginPath();
      context.roundRect(
        -childWidth / 2,
        -childHeight / 2,
        childWidth,
        childHeight,
        child.corner_radii.map((radius) =>
          Math.min(radius * view.zoom, childWidth / 2, childHeight / 2),
        ),
      );
      context.fill();
      context.restore();
    }
    context.restore();
  }
}

function isDescendantOf(
  node: NodeSummary,
  ancestorId: string,
  byId: Map<string, NodeSummary>,
) {
  let parentId = node.parent_id;
  while (parentId != null) {
    if (parentId === ancestorId) return true;
    parentId = byId.get(parentId)?.parent_id;
  }
  return false;
}

function drawSelectionOverlay(
  canvas: HTMLCanvasElement,
  view: { pan: { x: number; y: number }; zoom: number },
  selected: NodeSummary[],
  showDimensions: boolean,
) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const ratio = devicePixelRatio;
  const pixelWidth = Math.max(1, Math.floor(width * ratio));
  const pixelHeight = Math.max(1, Math.floor(height * ratio));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  if (selected.length === 0) return;
  const minX =
    Math.min(...selected.map((node) => node.x)) * view.zoom + view.pan.x;
  const minY =
    Math.min(...selected.map((node) => node.y)) * view.zoom + view.pan.y;
  const maxX =
    Math.max(...selected.map((node) => node.x + node.width)) * view.zoom +
    view.pan.x;
  const maxY =
    Math.max(...selected.map((node) => node.y + node.height)) * view.zoom +
    view.pan.y;
  const angle =
    selected.length === 1 ? (selected[0].rotation * Math.PI) / 180 : 0;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const rotate = ([x, y]: number[]) => [
    centerX + (x - centerX) * Math.cos(angle) - (y - centerY) * Math.sin(angle),
    centerY + (x - centerX) * Math.sin(angle) + (y - centerY) * Math.cos(angle),
  ];
  const isComponentSelection = selected.some(
    (node) => node.component_id || node.instance_root_id === node.id,
  );
  context.strokeStyle = isComponentSelection ? "#a970ff" : "#34f2ad";
  context.lineWidth = 2;
  const corners = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ].map(rotate);
  context.beginPath();
  context.moveTo(corners[0][0], corners[0][1]);
  for (const point of corners.slice(1)) context.lineTo(point[0], point[1]);
  context.closePath();
  context.stroke();
  if (showDimensions && selected.length === 1) {
    drawDimensionBadge(
      context,
      corners[2][0],
      corners[2][1],
      selected[0].width,
      selected[0].height,
      width,
      height,
    );
  }
  if (selected.length !== 1 || selected[0].kind === "group") return;
  const size = 8;
  const points = [
    [minX, minY],
    [(minX + maxX) / 2, minY],
    [maxX, minY],
    [maxX, (minY + maxY) / 2],
    [maxX, maxY],
    [(minX + maxX) / 2, maxY],
    [minX, maxY],
    [minX, (minY + maxY) / 2],
  ].map(rotate);
  context.fillStyle = "#ffffff";
  for (const [x, y] of points) {
    context.fillRect(x - size / 2, y - size / 2, size, size);
    context.strokeRect(x - size / 2, y - size / 2, size, size);
  }
}

function drawDimensionBadge(
  context: CanvasRenderingContext2D,
  anchorX: number,
  anchorY: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  const format = (value: number) =>
    Number.isInteger(value) ? String(value) : value.toFixed(1);
  const label = `${format(width)} × ${format(height)}`;
  context.save();
  context.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.textBaseline = "middle";
  const badgeWidth = Math.ceil(context.measureText(label).width) + 14;
  const badgeHeight = 24;
  const x = Math.max(4, Math.min(viewportWidth - badgeWidth - 4, anchorX + 10));
  const y = Math.max(
    4,
    Math.min(viewportHeight - badgeHeight - 4, anchorY + 10),
  );
  context.fillStyle = "#171b1f";
  context.strokeStyle = "#82e6b8";
  context.lineWidth = 1;
  context.beginPath();
  context.roundRect(x, y, badgeWidth, badgeHeight, 5);
  context.fill();
  context.stroke();
  context.fillStyle = "#e8fff4";
  context.fillText(label, x + 7, y + badgeHeight / 2);
  context.restore();
}

function drawRulers(
  horizontal: HTMLCanvasElement,
  vertical: HTMLCanvasElement,
  view: { pan: { x: number; y: number }; zoom: number },
  theme: ColorTheme,
) {
  const stage = horizontal.parentElement?.parentElement;
  if (!stage) return;
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  const ratio = devicePixelRatio;
  const setup = (
    canvas: HTMLCanvasElement,
    cssWidth: number,
    cssHeight: number,
  ) => {
    if (
      canvas.width !== cssWidth * ratio ||
      canvas.height !== cssHeight * ratio
    ) {
      canvas.width = cssWidth * ratio;
      canvas.height = cssHeight * ratio;
    }
    const context = canvas.getContext("2d")!;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, cssWidth, cssHeight);
    context.fillStyle = theme === "light" ? "#F7F8FA" : "#17181C";
    context.fillRect(0, 0, cssWidth, cssHeight);
    context.strokeStyle = theme === "light" ? "#A8ADB7" : "#666B75";
    context.fillStyle = theme === "light" ? "#555B66" : "#A8ADB7";
    context.font = "9px ui-monospace, monospace";
    return context;
  };
  const h = setup(horizontal, width - 24, 24);
  const v = setup(vertical, 24, height - 24);
  const steps = [10, 20, 50, 100, 200, 500, 1000];
  const step = steps.find((candidate) => candidate * view.zoom >= 55) ?? 1000;
  const minorStep = step / 5;
  const firstX = Math.floor(-view.pan.x / view.zoom / step) * step;
  const firstY = Math.floor(-view.pan.y / view.zoom / step) * step;
  const firstMinorX =
    Math.floor(-view.pan.x / view.zoom / minorStep) * minorStep;
  const firstMinorY =
    Math.floor(-view.pan.y / view.zoom / minorStep) * minorStep;
  h.globalAlpha = 0.55;
  for (
    let world = firstMinorX;
    world * view.zoom + view.pan.x < width;
    world += minorStep
  ) {
    const subdivision = Math.round(world / minorStep);
    if (subdivision % 5 === 0) continue;
    const x = world * view.zoom + view.pan.x - 24;
    const tickHeight = subdivision % 5 === 2 || subdivision % 5 === 3 ? 6 : 4;
    h.beginPath();
    h.moveTo(x, 24 - tickHeight);
    h.lineTo(x, 24);
    h.stroke();
  }
  v.globalAlpha = 0.55;
  for (
    let world = firstMinorY;
    world * view.zoom + view.pan.y < height;
    world += minorStep
  ) {
    const subdivision = Math.round(world / minorStep);
    if (subdivision % 5 === 0) continue;
    const y = world * view.zoom + view.pan.y - 24;
    const tickWidth = subdivision % 5 === 2 || subdivision % 5 === 3 ? 6 : 4;
    v.beginPath();
    v.moveTo(24 - tickWidth, y);
    v.lineTo(24, y);
    v.stroke();
  }
  h.globalAlpha = 1;
  v.globalAlpha = 1;
  for (
    let world = firstX;
    world * view.zoom + view.pan.x < width;
    world += step
  ) {
    const x = world * view.zoom + view.pan.x - 24;
    h.beginPath();
    h.moveTo(x, 14);
    h.lineTo(x, 24);
    h.stroke();
    h.fillText(String(world), x + 3, 10);
  }
  for (
    let world = firstY;
    world * view.zoom + view.pan.y < height;
    world += step
  ) {
    const y = world * view.zoom + view.pan.y - 24;
    v.beginPath();
    v.moveTo(14, y);
    v.lineTo(24, y);
    v.stroke();
    v.save();
    v.translate(10, y + 3);
    v.rotate(-Math.PI / 2);
    v.fillText(String(world), 0, 0);
    v.restore();
  }
}
