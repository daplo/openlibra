import { useEffect, useRef, type RefObject } from "react";
import type { OpenLibraRenderer } from "../renderer";
import { ensureGoogleFont } from "../editor/font-catalog";
import { rgbaToHex } from "../editor/model-utils";
import type { NodeSummary } from "../editor/types";

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
