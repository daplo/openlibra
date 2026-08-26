import { useEffect, useRef, type RefObject } from "react";
import type { OpenLibraRenderer } from "../renderer";
import { rgbaToHex } from "../editor/model-utils";
import type { NodeSummary, VectorPoint } from "../editor/types";

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
