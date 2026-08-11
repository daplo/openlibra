import { useEffect, useRef, type RefObject } from "react";
import type { OpenLibraRenderer, ColorTheme } from "../renderer";
import { hexWithAlpha, rgbaToHex } from "../editor/model-utils";
import type { NodeSummary } from "../editor/types";

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
        drawSelectionOverlay(canvas, renderer.getViewState(), visibleSelection);
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
  context.strokeStyle = "#34f2ad";
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
