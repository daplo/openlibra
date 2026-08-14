import type { MediaAsset, NodeSummary, VectorPoint } from "./types";
import { ensureGoogleFont, isGoogleFont } from "./font-catalog";
import { mediaImageSource } from "./media-source";
import { rgbaToHex } from "./model-utils";

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
  await loadExportFonts(nodes);
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
      const image = await loadImage(
        mediaImageSource(
          asset,
          node.kind === "icon" ? rgbaToHex(node.fill) : undefined,
        ),
      );
      drawFittedImage(context, image, node.width, node.height, node.image_fit);
    } catch {
      context.fillStyle = "#c7cbd3";
      context.fillRect(0, 0, node.width, node.height);
    }
  } else if (node.kind === "vector" && node.vector) {
    const path = exportVectorPath(node);
    const isOpen =
      node.vector.geometry.type === "line" ||
      (node.vector.geometry.type === "path" &&
        node.vector.geometry.contours.every((contour) => !contour.closed));
    if (!isOpen) {
      context.fillStyle = rgba(node.fill);
      context.fill(
        path,
        node.vector.fill_rule === "evenodd" ? "evenodd" : "nonzero",
      );
    }
    if (node.stroke_width > 0) {
      context.strokeStyle = rgba(node.stroke);
      context.lineWidth = node.stroke_width;
      context.stroke(path);
    }
  } else if (node.kind !== "text") {
    context.fillStyle = rgba(node.fill);
    context.fillRect(0, 0, node.width, node.height);
  }
  if (node.kind === "text" && node.text) {
    const text = node.text;
    context.fillStyle = rgba(node.fill);
    context.font = fontDeclaration(text);
    context.textBaseline = "top";
    context.textAlign =
      text.horizontal_align === "justify" ? "left" : text.horizontal_align;
    const lines =
      text.sizing === "auto_width"
        ? text.content.split("\n")
        : wrapExportText(
            context,
            text.content,
            node.width,
            text.letter_spacing,
          );
    const lineHeight = text.font_size * text.line_height;
    const blockHeight = lines.length * lineHeight;
    let lineY = 0;
    if (text.vertical_align === "middle")
      lineY = (node.height - blockHeight) / 2;
    if (text.vertical_align === "bottom") lineY = node.height - blockHeight;
    const lineX =
      text.horizontal_align === "center"
        ? node.width / 2
        : text.horizontal_align === "right"
          ? node.width
          : 0;
    for (const line of lines) {
      context.fillText(line, lineX, lineY);
      lineY += lineHeight;
    }
  }
  if (node.stroke_width > 0 && node.kind !== "vector") {
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

async function loadExportFonts(nodes: NodeSummary[]) {
  if (!document.fonts) return;
  const families = new Set(
    nodes.flatMap((node) => (node.text ? [node.text.font_family] : [])),
  );
  for (const family of families) ensureGoogleFont(family);
  await Promise.all(
    [...families]
      .filter(isGoogleFont)
      .map((family) => waitForFontStylesheet(family)),
  );
  const declarations = new Set(
    nodes.flatMap((node) => (node.text ? [fontDeclaration(node.text)] : [])),
  );
  await Promise.all(
    [...declarations].map((declaration) =>
      document.fonts.load(declaration).catch(() => []),
    ),
  );
  await document.fonts.ready;
}

function waitForFontStylesheet(family: string) {
  const link = [...document.querySelectorAll<HTMLLinkElement>("link")].find(
    (candidate) => candidate.dataset.openLibraFont === family,
  );
  if (!link || link.sheet) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, 3000);
    const finish = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    link.addEventListener("load", finish, { once: true });
    link.addEventListener("error", finish, { once: true });
  });
}

function fontDeclaration(text: NonNullable<NodeSummary["text"]>) {
  return `${text.font_style} ${text.font_weight} ${text.font_size}px ${JSON.stringify(text.font_family)}, sans-serif`;
}

function wrapExportText(
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

function exportVectorPath(node: NodeSummary) {
  const path = new Path2D();
  const geometry = node.vector!.geometry;
  if (geometry.type === "ellipse") {
    path.ellipse(
      node.width / 2,
      node.height / 2,
      node.width / 2,
      node.height / 2,
      0,
      0,
      Math.PI * 2,
    );
  } else if (geometry.type === "line") {
    path.moveTo(0, node.height / 2);
    path.lineTo(node.width, node.height / 2);
  } else if (geometry.type === "polygon" || geometry.type === "star") {
    const count =
      geometry.type === "polygon" ? geometry.sides : geometry.points * 2;
    const radius = Math.min(node.width, node.height) / 2;
    for (let index = 0; index < count; index += 1) {
      const scale =
        geometry.type === "star" && index % 2 === 1 ? geometry.inner_ratio : 1;
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
      const x = node.width / 2 + Math.cos(angle) * radius * scale;
      const y = node.height / 2 + Math.sin(angle) * radius * scale;
      if (index === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    path.closePath();
  } else {
    for (const contour of geometry.contours) {
      const first = contour.points[0];
      if (!first) continue;
      path.moveTo(
        first.position[0] * node.width,
        first.position[1] * node.height,
      );
      for (let index = 1; index < contour.points.length; index += 1) {
        const from = contour.points[index - 1];
        const to = contour.points[index];
        addExportVectorSegment(path, from, to, node.width, node.height);
      }
      if (contour.closed) {
        addExportVectorSegment(
          path,
          contour.points[contour.points.length - 1],
          first,
          node.width,
          node.height,
        );
        path.closePath();
      }
    }
  }
  return path;
}

function addExportVectorSegment(
  path: Path2D,
  from: VectorPoint,
  to: VectorPoint,
  width: number,
  height: number,
) {
  const a = from.handle_out ?? from.position;
  const b = to.handle_in ?? to.position;
  if (from.handle_out || to.handle_in)
    path.bezierCurveTo(
      a[0] * width,
      a[1] * height,
      b[0] * width,
      b[1] * height,
      to.position[0] * width,
      to.position[1] * height,
    );
  else path.lineTo(to.position[0] * width, to.position[1] * height);
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
