import { useEffect, useRef, type RefObject } from "react";
import type { OpenLibraRenderer } from "../renderer";
import { rgbaToHex } from "../editor/model-utils";
import { mediaImageSource } from "../editor/media-source";
import type { MediaAsset, NodeSummary } from "../editor/types";

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
