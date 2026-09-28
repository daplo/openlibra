import type { MediaAsset, NodeSummary } from "./types";
import {
  createScenePainter,
  loadSceneFonts,
  loadSceneImages,
  sceneSubtree,
} from "./scene-painter";

export type VisibleBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Measure an isolated masked subtree, so hidden geometry and unrelated artwork
 * cannot enlarge its selection outline. Raster work is bounded and cached by
 * the overlay per document change, never performed in the animation loop. */
export async function maskedSelectionBounds(
  root: NodeSummary,
  nodes: NodeSummary[],
  assets: MediaAsset[],
): Promise<VisibleBounds | null> {
  const subtree = sceneSubtree(nodes, root.id);
  const mask = subtree.find((n) => n.parent_id === root.id && n.mask_shape);
  if (!mask) return root;
  const painter = createScenePainter(subtree, assets);
  let bounds = painter.bounds;
  const maskBounds = createScenePainter([mask], []).bounds;
  if (
    bounds &&
    maskBounds &&
    root.fill[3] === 0 &&
    (root.stroke_width === 0 || root.stroke[3] === 0) &&
    !root.shadows.some((shadow) => shadow.enabled)
  ) {
    bounds = {
      left: Math.max(bounds.left, maskBounds.left),
      top: Math.max(bounds.top, maskBounds.top),
      right: Math.min(bounds.right, maskBounds.right),
      bottom: Math.min(bounds.bottom, maskBounds.bottom),
    };
  }
  if (!bounds) return null;
  const width = Math.max(1, bounds.right - bounds.left),
    height = Math.max(1, bounds.bottom - bounds.top);
  const scale = Math.min(2, 2048 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  const [images] = await Promise.all([
    loadSceneImages(subtree, assets),
    loadSceneFonts(subtree),
  ]);
  context.scale(scale, scale);
  context.translate(-bounds.left, -bounds.top);
  painter(context, images);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let left = canvas.width,
    top = canvas.height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < canvas.height; y++)
    for (let x = 0; x < canvas.width; x++) {
      if (pixels[(y * canvas.width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  if (right < left) return null;
  return {
    x: bounds.left + left / scale,
    y: bounds.top + top / scale,
    width: (right - left + 1) / scale,
    height: (bottom - top + 1) / scale,
  };
}
