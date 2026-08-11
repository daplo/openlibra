import type { DocumentReadModel, NodeSummary } from "./types";

export function rgbaToHex(color: number[]) {
  return `#${color
    .slice(0, 3)
    .map((channel) =>
      Math.round(channel * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`.toUpperCase();
}

export function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255,
  ];
}

export function hexWithAlpha(hex: string, alpha: number) {
  return `${hex}${Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0")}`;
}

export function collectDocumentColors(model: DocumentReadModel) {
  const colors = new Set<string>();
  for (const color of model.document_colors)
    colors.add(color.value.toUpperCase());
  for (const node of model.nodes) {
    colors.add(rgbaToHex(node.fill));
    if (node.stroke_width > 0) colors.add(rgbaToHex(node.stroke));
  }
  return [...colors];
}

export function preferredArtboardId(
  nodes: NodeSummary[],
  selectedIds: number[],
) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let current = selectedIds.length === 1 ? byId.get(selectedIds[0]) : undefined;
  while (current) {
    if (current.kind === "frame" && current.parent_id == null)
      return current.id;
    current =
      current.parent_id == null ? undefined : byId.get(current.parent_id);
  }
  return [...nodes]
    .reverse()
    .find((node) => node.kind === "frame" && node.parent_id == null)?.id;
}

export function findSelectedAncestor(
  id: number,
  selectedIds: number[],
  nodes: NodeSummary[],
) {
  let current = nodes.find((node) => node.id === id);
  while (current?.parent_id !== undefined && current.parent_id !== null) {
    if (selectedIds.includes(current.parent_id)) return current.parent_id;
    current = nodes.find((node) => node.id === current?.parent_id);
  }
  return undefined;
}
