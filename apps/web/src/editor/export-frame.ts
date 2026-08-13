import type { MediaAsset, NodeSummary } from "./types";

export async function exportFramePng(
  frame: NodeSummary,
  nodes: NodeSummary[],
  assets: MediaAsset[],
  scale: number,
) {
  if (frame.kind !== "frame") throw new Error("Select a frame to export.");
  const width = Math.round(frame.width * scale);
  const height = Math.round(frame.height * scale);
  if (width < 1 || height < 1 || width > 16_384 || height > 16_384)
    throw new Error(
      "The exported image must be between 1 and 16,384 pixels per side.",
    );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create the export canvas.");
  context.scale(scale, scale);
  const descendants = nodes.filter((node) =>
    isDescendant(node, frame.id, nodes),
  );
  for (const node of [frame, ...descendants])
    await drawNode(context, node, frame, assets);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Could not encode the PNG export.");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFilename(frame.name)}@${scale}x.png`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function drawNode(
  context: CanvasRenderingContext2D,
  node: NodeSummary,
  frame: NodeSummary,
  assets: MediaAsset[],
) {
  if (node.kind === "group") return;
  const x = node.x - frame.x;
  const y = node.y - frame.y;
  context.save();
  context.globalAlpha = node.opacity;
  context.translate(x + node.width / 2, y + node.height / 2);
  context.rotate((node.rotation * Math.PI) / 180);
  context.scale(node.flip_x ? -1 : 1, node.flip_y ? -1 : 1);
  context.translate(-node.width / 2, -node.height / 2);
  roundedRect(context, 0, 0, node.width, node.height, node.corner_radii);
  context.clip();
  const asset = node.asset_id
    ? assets.find((candidate) => candidate.id === node.asset_id)
    : undefined;
  if (asset && (node.kind === "image" || node.kind === "icon")) {
    try {
      const image = await loadImage(asset.source);
      drawFittedImage(context, image, node.width, node.height, node.image_fit);
    } catch {
      context.fillStyle = "#c7cbd3";
      context.fillRect(0, 0, node.width, node.height);
    }
  } else if (node.kind !== "text") {
    context.fillStyle = rgba(node.fill);
    context.fillRect(0, 0, node.width, node.height);
  }
  if (node.kind === "text" && node.text) {
    context.fillStyle = rgba(node.fill);
    context.font = `${node.text.font_style} ${node.text.font_weight} ${node.text.font_size}px ${JSON.stringify(node.text.font_family)}`;
    context.textBaseline = "top";
    const lines = node.text.content.split("\n");
    lines.forEach((line, index) =>
      context.fillText(line, 0, index * node.text!.line_height, node.width),
    );
  }
  if (node.stroke_width > 0) {
    context.restore();
    context.save();
    context.globalAlpha = node.opacity;
    context.translate(x + node.width / 2, y + node.height / 2);
    context.rotate((node.rotation * Math.PI) / 180);
    context.translate(-node.width / 2, -node.height / 2);
    context.strokeStyle = rgba(node.stroke);
    context.lineWidth = node.stroke_width;
    roundedRect(context, 0, 0, node.width, node.height, node.corner_radii);
    context.stroke();
  }
  context.restore();
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radii: number[],
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radii);
}

function drawFittedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  fit: NodeSummary["image_fit"],
) {
  if (fit === "fill") {
    context.drawImage(image, 0, 0, width, height);
    return;
  }
  const ratio =
    fit === "contain"
      ? Math.min(width / image.naturalWidth, height / image.naturalHeight)
      : Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * ratio;
  const drawHeight = image.naturalHeight * ratio;
  context.drawImage(
    image,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image decode failed"));
    image.src = source;
  });
}

function isDescendant(node: NodeSummary, rootId: string, nodes: NodeSummary[]) {
  const byId = new Map(nodes.map((item) => [item.id, item]));
  let parentId = node.parent_id;
  while (parentId) {
    if (parentId === rootId) return true;
    parentId = byId.get(parentId)?.parent_id;
  }
  return false;
}

function rgba(color: number[]) {
  const [red = 0, green = 0, blue = 0, alpha = 1] = color;
  return `rgba(${red * 255}, ${green * 255}, ${blue * 255}, ${alpha})`;
}

function safeFilename(name: string) {
  return name.trim().replace(/[\\/:*?"<>|]+/g, "-") || "frame";
}
