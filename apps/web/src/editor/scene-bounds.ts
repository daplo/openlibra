import type { NodeSummary } from "./types";

export function localGeometryBounds(node: NodeSummary) {
  let left = 0,
    top = 0,
    right = node.width,
    bottom = node.height;
  if (node.vector?.geometry.type === "path") {
    for (const contour of node.vector.geometry.contours) {
      for (const point of contour.points) {
        for (const position of [
          point.position,
          point.handle_in,
          point.handle_out,
        ]) {
          if (!position) continue;
          left = Math.min(left, position[0] * node.width);
          right = Math.max(right, position[0] * node.width);
          top = Math.min(top, position[1] * node.height);
          bottom = Math.max(bottom, position[1] * node.height);
        }
      }
    }
  }
  return { left, top, right, bottom };
}
