import { useEffect, useRef, type RefObject } from "react";
import type { OpenLibraRenderer } from "../renderer";
import { hexWithAlpha, rgbaToHex } from "../editor/model-utils";
import type { NodeSummary } from "../editor/types";

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
