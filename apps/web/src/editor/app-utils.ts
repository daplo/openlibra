import { rgbaToHex } from "./model-utils";
import type { DocumentReadModel, NodeSummary, TextStyleSummary } from "./types";
import type { OpenLibraRenderer } from "../renderer";

export function textEditorStyle(
  node: NodeSummary,
  renderer?: OpenLibraRenderer,
) {
  const view = renderer?.getViewState() ?? { pan: { x: 0, y: 0 }, zoom: 1 };
  const text = node.text!;
  return {
    left: node.x * view.zoom + view.pan.x,
    top: node.y * view.zoom + view.pan.y,
    width: node.width * view.zoom,
    height: node.height * view.zoom,
    fontFamily: text.font_family,
    fontWeight: text.font_weight,
    fontStyle: text.font_style,
    fontSize: text.font_size * view.zoom,
    lineHeight: text.line_height,
    letterSpacing: text.letter_spacing * view.zoom,
    textAlign: text.horizontal_align,
    whiteSpace: text.sizing === "auto_width" ? "pre" : "pre-wrap",
    overflow: text.sizing === "fixed" ? "auto" : "hidden",
    color: rgbaToHex(node.fill),
  } as const;
}

export function measureTextBounds(node: NodeSummary, text: TextStyleSummary) {
  if (text.sizing === "fixed") return undefined;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return undefined;
  context.font = `${text.font_style} ${text.font_weight} ${text.font_size}px ${JSON.stringify(text.font_family)}, sans-serif`;
  const measure = (value: string) =>
    context.measureText(value).width +
    Math.max(0, value.length - 1) * text.letter_spacing;
  let lines: string[];
  if (text.sizing === "auto_width") {
    lines = text.content.split("\n");
  } else {
    lines = [];
    for (const paragraph of text.content.split("\n")) {
      const words = paragraph.split(/\s+/);
      let line = "";
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && measure(candidate) > node.width) {
          lines.push(line);
          line = word;
        } else line = candidate;
      }
      lines.push(line);
    }
  }
  return {
    width:
      text.sizing === "auto_width"
        ? Math.max(8, ...lines.map(measure))
        : node.width,
    height: Math.max(8, lines.length * text.font_size * text.line_height),
  };
}

export function textStylesEqual(
  left: TextStyleSummary,
  right: TextStyleSummary,
) {
  return (
    left.content === right.content &&
    left.font_family === right.font_family &&
    left.font_weight === right.font_weight &&
    left.font_size === right.font_size &&
    left.line_height === right.line_height &&
    left.letter_spacing === right.letter_spacing &&
    left.horizontal_align === right.horizontal_align &&
    left.vertical_align === right.vertical_align &&
    left.font_style === right.font_style &&
    left.sizing === right.sizing
  );
}

export function textTypographyEqual(
  left: TextStyleSummary,
  right: TextStyleSummary,
) {
  return (
    left.font_family === right.font_family &&
    left.font_weight === right.font_weight &&
    left.font_size === right.font_size &&
    left.line_height === right.line_height &&
    left.letter_spacing === right.letter_spacing &&
    left.horizontal_align === right.horizontal_align &&
    left.vertical_align === right.vertical_align &&
    left.font_style === right.font_style &&
    left.sizing === right.sizing
  );
}

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

export function readImageDimensions(source: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("The selected image is invalid."));
    image.src = source;
  });
}

export function topLevelFrameAtPoint(
  nodes: NodeSummary[],
  x: number,
  y: number,
) {
  return nodes
    .filter(
      (node) =>
        node.kind === "frame" &&
        !node.parent_id &&
        x >= node.x &&
        x <= node.x + node.width &&
        y >= node.y &&
        y <= node.y + node.height,
    )
    .at(-1);
}

export function isNodeWithinRoot(
  nodeId: string,
  rootId: string,
  nodesById: Map<string, NodeSummary>,
) {
  let current = nodesById.get(nodeId);
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    if (current.id === rootId) return true;
    visited.add(current.id);
    current = current.parent_id ? nodesById.get(current.parent_id) : undefined;
  }
  return false;
}

export function findComponentMasterRoot(
  nodeId: string,
  nodesById: Map<string, NodeSummary>,
) {
  let current = nodesById.get(nodeId);
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    if (current.component_id && !current.instance_root_id) return current;
    visited.add(current.id);
    current = current.parent_id ? nodesById.get(current.parent_id) : undefined;
  }
  return undefined;
}

export function isComponentMasterNode(
  nodeId: string,
  nodesById: Map<string, NodeSummary>,
) {
  return Boolean(findComponentMasterRoot(nodeId, nodesById));
}

export function componentSourceRootForNode(
  nodeId: string,
  nodesById: Map<string, NodeSummary>,
  model: DocumentReadModel,
) {
  let current = nodesById.get(nodeId);
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    const componentId = current.component_id;
    const variantId = current.component_variant_id;
    if (componentId && variantId) {
      return model.components
        .find((component) => component.id === componentId)
        ?.variants.find((variant) => variant.id === variantId)?.source_root_id;
    }
    visited.add(current.id);
    current = current.parent_id ? nodesById.get(current.parent_id) : undefined;
  }
  return undefined;
}

export function autosaveLabel(
  state: "idle" | "saving" | "saved" | "error",
  dirty: boolean,
) {
  if (state === "saving") return "Saving locally…";
  if (state === "error") return "Local save failed";
  if (state === "saved" && dirty) return "Saved locally · file not downloaded";
  if (state === "saved") return "Saved locally";
  return "Current";
}

export function nearestSnap(
  moving: number[],
  targets: number[],
  threshold: number,
) {
  let best: { offset: number; target: number } | undefined;
  for (const source of moving) {
    for (const target of targets) {
      const offset = target - source;
      if (
        Math.abs(offset) <= threshold &&
        (!best || Math.abs(offset) < Math.abs(best.offset))
      )
        best = { offset, target };
    }
  }
  return best;
}
