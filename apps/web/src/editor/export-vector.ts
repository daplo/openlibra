import { localGeometryBounds } from "./scene-bounds";
import { rgbaToHex } from "./model-utils";
import type { NodeSummary, VectorPoint } from "./types";

export function exportVectorSvg(node: NodeSummary) {
  if (node.kind !== "vector" || !node.vector)
    throw new Error("Select a vector to export.");
  const geometry = vectorMarkup(node);
  const bounds = localGeometryBounds(node);
  const margin =
    node.stroke_width > 0 && node.stroke[3] > 0 ? node.stroke_width / 2 : 0;
  const x = bounds.left - margin,
    y = bounds.top - margin;
  const width = bounds.right - bounds.left + margin * 2,
    height = bounds.bottom - bounds.top + margin * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${width}" height="${height}">${geometry}</svg>`;
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFilename(node.name)}.svg`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function vectorMarkup(node: NodeSummary) {
  const vector = node.vector!;
  const fill = rgbaToHex(node.fill);
  const stroke = node.stroke_width > 0 ? rgbaToHex(node.stroke) : "none";
  const style = `fill="${fill}" fill-opacity="${node.fill[3] ?? 1}" stroke="${stroke}" stroke-opacity="${node.stroke[3] ?? 1}" stroke-width="${node.stroke_width}" stroke-linejoin="${node.stroke_join === "round" ? "round" : "miter"}" opacity="${node.opacity}" fill-rule="${vector.fill_rule}"`;
  const geometry = vector.geometry;
  if (geometry.type === "ellipse")
    return `<ellipse cx="${node.width / 2}" cy="${node.height / 2}" rx="${node.width / 2}" ry="${node.height / 2}" ${style}/>`;
  if (geometry.type === "line")
    return `<line x1="0" y1="${node.height / 2}" x2="${node.width}" y2="${node.height / 2}" ${style} stroke-linecap="round"/>`;
  return `<path d="${pathData(node)}" ${style}/>`;
}

function pathData(node: NodeSummary) {
  const geometry = node.vector!.geometry;
  if (geometry.type === "polygon" || geometry.type === "star") {
    const count =
      geometry.type === "polygon" ? geometry.sides : geometry.points * 2;
    const radius = Math.min(node.width, node.height) / 2;
    return (
      Array.from({ length: count }, (_, index) => {
        const scale =
          geometry.type === "star" && index % 2 === 1
            ? geometry.inner_ratio
            : 1;
        const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
        const x = node.width / 2 + Math.cos(angle) * radius * scale;
        const y = node.height / 2 + Math.sin(angle) * radius * scale;
        return `${index === 0 ? "M" : "L"}${number(x)} ${number(y)}`;
      }).join(" ") + " Z"
    );
  }
  if (geometry.type !== "path") return "";
  return geometry.contours
    .map((contour) => {
      const first = contour.points[0];
      if (!first) return "";
      const commands = [`M${point(first, node)}`];
      for (let index = 1; index < contour.points.length; index += 1)
        commands.push(
          segment(contour.points[index - 1], contour.points[index], node),
        );
      if (contour.closed) {
        commands.push(
          segment(contour.points[contour.points.length - 1], first, node),
        );
        commands.push("Z");
      }
      return commands.join(" ");
    })
    .join(" ");
}

function segment(from: VectorPoint, to: VectorPoint, node: NodeSummary) {
  if (!from.handle_out && !to.handle_in) return `L${point(to, node)}`;
  return `C${pointAt(from.handle_out ?? from.position, node)} ${pointAt(to.handle_in ?? to.position, node)} ${point(to, node)}`;
}

function point(value: VectorPoint, node: NodeSummary) {
  return pointAt(value.position, node);
}

function pointAt(value: [number, number], node: NodeSummary) {
  return `${number(value[0] * node.width)} ${number(value[1] * node.height)}`;
}

function number(value: number) {
  return Number(value.toFixed(4));
}

function safeFilename(name: string) {
  return name.trim().replace(/[\\/:*?"<>|]+/g, "-") || "vector";
}
