import type { MediaAsset, NodeSummary } from "./types";
import {
  loadSceneFonts,
  loadSceneImages,
  paintScene,
  sceneSubtree,
} from "./scene-painter";

export async function renderFramePng(
  frame: NodeSummary,
  nodes: NodeSummary[],
  assets: MediaAsset[],
  scale: number,
) {
  if (frame.kind !== "frame") throw new Error("Select a frame to export.");
  const width = Math.round(frame.width * scale),
    height = Math.round(frame.height * scale);
  if (
    !Number.isFinite(scale) ||
    scale <= 0 ||
    width < 1 ||
    height < 1 ||
    width > 16_384 ||
    height > 16_384 ||
    width * height > 67_108_864
  )
    throw new Error(
      "Export must be at most 16,384 pixels per side and 64 megapixels.",
    );
  const inverse = new DOMMatrix()
    .translate(frame.x + frame.width / 2, frame.y + frame.height / 2)
    .rotate(frame.rotation)
    .scale(frame.flip_x ? -1 : 1, frame.flip_y ? -1 : 1)
    .translate(-frame.x - frame.width / 2, -frame.y - frame.height / 2)
    .inverse();
  const descendants = sceneSubtree(nodes, frame.id).map((node) => {
    const center = inverse.transformPoint({
      x: node.x + node.width / 2,
      y: node.y + node.height / 2,
    });
    const orientation = inverse.multiply(
      new DOMMatrix()
        .rotate(node.rotation)
        .scale(node.flip_x ? -1 : 1, node.flip_y ? -1 : 1),
    );
    const sign =
      orientation.a * orientation.d - orientation.b * orientation.c < 0
        ? -1
        : 1;
    return {
      ...node,
      x: center.x - node.width / 2,
      y: center.y - node.height / 2,
      rotation:
        (Math.atan2(orientation.b * sign, orientation.a * sign) * 180) /
        Math.PI,
      flip_x: sign < 0,
      flip_y: false,
    };
  });
  await loadSceneFonts(descendants);
  const images = await loadSceneImages(descendants, assets);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create the export canvas.");
  context.scale(scale, scale);
  context.translate(-frame.x, -frame.y);
  paintScene(context, descendants, assets, images);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Could not encode the PNG export.");
  return blob;
}

export async function exportFramePng(
  frame: NodeSummary,
  nodes: NodeSummary[],
  assets: MediaAsset[],
  scale: number,
) {
  const blob = await renderFramePng(frame, nodes, assets, scale);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${frame.name.trim().replace(/[\\/:*?"<>|]+/g, "-") || "frame"}@${scale}x.png`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
