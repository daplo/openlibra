import { localGeometryBounds } from "./scene-bounds";
import { createEffectPainter } from "./scene-effects";
import type { MediaAsset, NodeSummary, VectorPoint } from "./types";
import { ensureGoogleFont, isGoogleFont } from "./font-catalog";
import { mediaImageSource } from "./media-source";
import { rgbaToHex } from "./model-utils";

export type SceneResources = Map<string, HTMLImageElement>;

export function imageKey(node: NodeSummary, assets: Map<string, MediaAsset>) {
  const asset = node.asset_id ? assets.get(node.asset_id) : undefined;
  return asset
    ? mediaImageSource(
        asset,
        node.kind === "icon" ? rgbaToHex(node.fill) : undefined,
      )
    : undefined;
}

export async function loadSceneImages(
  nodes: NodeSummary[],
  assets: MediaAsset[],
): Promise<SceneResources> {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  for (const node of nodes) {
    if (
      (node.kind === "image" || node.kind === "icon") &&
      !imageKey(node, byId)
    )
      throw new Error(`Missing image asset for ${node.name}.`);
  }
  const keys = new Set(
    nodes
      .filter((node) => node.kind === "image" || node.kind === "icon")
      .map((node) => imageKey(node, byId))
      .filter((key): key is string => !!key),
  );
  const images = new Map<string, HTMLImageElement>();
  await Promise.all(
    [...keys].map(async (key) => {
      images.set(key, await loadSceneImage(key));
    }),
  );
  return images;
}

export function sceneSubtree(nodes: NodeSummary[], rootId: string) {
  const children = childIndex(nodes);
  const result: NodeSummary[] = [];
  const visit = (node: NodeSummary) => {
    result.push(node);
    for (const child of children.get(node.id) ?? []) visit(child);
  };
  const root = nodes.find((node) => node.id === rootId);
  if (root) visit(root);
  return result;
}

function childIndex(nodes: NodeSummary[]) {
  const children = new Map<string | undefined, NodeSummary[]>();
  const ids = new Set(nodes.map((node) => node.id));
  for (const node of nodes) {
    const parent =
      node.parent_id && ids.has(node.parent_id) ? node.parent_id : undefined;
    const siblings = children.get(parent) ?? [];
    siblings.push(node);
    children.set(parent, siblings);
  }
  return children;
}

export type PaintStats = {
  visible: number;
  visited: number;
  culled: number;
  surfacePixels: number;
  peakSurfacePixels: number;
};
type Bounds = { left: number; top: number; right: number; bottom: number };

function union(a: Bounds, b: Bounds): Bounds {
  return {
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  };
}
function mappedBounds(bounds: Bounds, matrix: DOMMatrix): Bounds {
  if (matrix.b === 0 && matrix.c === 0) {
    const x1 = bounds.left * matrix.a + matrix.e,
      x2 = bounds.right * matrix.a + matrix.e;
    const y1 = bounds.top * matrix.d + matrix.f,
      y2 = bounds.bottom * matrix.d + matrix.f;
    return {
      left: Math.min(x1, x2),
      top: Math.min(y1, y2),
      right: Math.max(x1, x2),
      bottom: Math.max(y1, y2),
    };
  }
  const corners = [
    [bounds.left, bounds.top],
    [bounds.right, bounds.top],
    [bounds.right, bounds.bottom],
    [bounds.left, bounds.bottom],
  ].map(([x, y]) => matrix.transformPoint({ x, y }));
  return {
    left: Math.min(...corners.map((p) => p.x)),
    top: Math.min(...corners.map((p) => p.y)),
    right: Math.max(...corners.map((p) => p.x)),
    bottom: Math.max(...corners.map((p) => p.y)),
  };
}
function nodeBounds(node: NodeSummary): Bounds {
  let margin = node.stroke_width * 10 + 2;
  for (const shadow of node.shadows)
    if (shadow.enabled && shadow.kind === "outer")
      margin = Math.max(
        margin,
        Math.abs(shadow.offset_x) +
          Math.abs(shadow.offset_y) +
          shadow.blur * 3 +
          Math.abs(shadow.spread) +
          node.stroke_width +
          2,
      );
  const matrix = new DOMMatrix()
    .translate(node.x + node.width / 2, node.y + node.height / 2)
    .rotate(node.rotation)
    .scale(node.flip_x ? -1 : 1, node.flip_y ? -1 : 1)
    .translate(-node.width / 2, -node.height / 2);
  const box = localGeometryBounds(node);
  return mappedBounds(
    {
      left: box.left - margin,
      top: box.top - margin,
      right: box.right + margin,
      bottom: box.bottom + margin,
    },
    matrix,
  );
}

// Create once per document revision. Camera movement reuses tree, paths and
// bounded scratch canvases; callers must rebuild after in-place node edits.
export function createScenePainter(nodes: NodeSummary[], assets: MediaAsset[]) {
  const children = childIndex(nodes);
  const drawShadows = createEffectPainter();
  const byAsset = new Map(assets.map((asset) => [asset.id, asset]));
  const paths = new Map<string, Path2D>();
  const bounds = new Map<string, Bounds>();
  const ownBounds = new Map<string, Bounds>();
  const prepare = (node: NodeSummary): Bounds => {
    paths.set(node.id, nodePath(node));
    let box = nodeBounds(node);
    ownBounds.set(node.id, box);
    for (const child of children.get(node.id) ?? [])
      box = union(box, prepare(child));
    bounds.set(node.id, box);
    return box;
  };
  for (const root of children.get(undefined) ?? []) prepare(root);
  const pool: HTMLCanvasElement[] = [];
  let retainedPixels = 0;
  let previousImages: SceneResources | undefined;
  const paint = (
    context: CanvasRenderingContext2D,
    images: SceneResources,
    options: { editingTextId?: string } = {},
  ): PaintStats => {
    if (previousImages !== images) {
      drawShadows.clear();
      previousImages = images;
    }
    const stats: PaintStats = {
      visible: 0,
      visited: 0,
      culled: 0,
      surfacePixels: 0,
      peakSurfacePixels: 0,
    };
    const visibleIds = new Set<string>();
    function visit(
      target: CanvasRenderingContext2D,
      node: NodeSummary,
      isolated = false,
      inheritedOpacity = 1,
    ) {
      const opacity = node.opacity * inheritedOpacity;
      if (opacity <= 0) return;
      stats.visited++;
      const box = mappedBounds(bounds.get(node.id)!, target.getTransform());
      const left = Math.max(0, Math.floor(box.left)),
        top = Math.max(0, Math.floor(box.top));
      const right = Math.min(target.canvas.width, Math.ceil(box.right)),
        bottom = Math.min(target.canvas.height, Math.ceil(box.bottom));
      if (right <= left || bottom <= top) {
        stats.culled++;
        return;
      }
      visibleIds.add(node.id);
      const descendants = children.get(node.id) ?? [];
      // A transparent one-child group has no overlapping paints to isolate.
      if (
        node.kind === "group" &&
        node.fill[3] === 0 &&
        (node.stroke_width === 0 || node.stroke[3] === 0) &&
        !node.shadows.some((s) => s.enabled) &&
        descendants.length === 1
      ) {
        visit(target, descendants[0], false, opacity);
        return;
      }
      const singlePaint =
        descendants.length === 0 &&
        node.kind !== "text" &&
        (node.stroke_width === 0 || node.stroke[3] === 0) &&
        !node.shadows.some((shadow) => shadow.enabled);
      if (opacity < 1 && !isolated && !singlePaint) {
        if (stats.surfacePixels + (right - left) * (bottom - top) > 16_777_216)
          throw new Error(
            "Transparency layers exceed the 64 MiB rendering budget. Reduce the export scale or simplify nested opacity.",
          );
        const pooled = pool.pop();
        if (pooled) retainedPixels -= pooled.width * pooled.height;
        const surface = pooled ?? document.createElement("canvas");
        if (surface.width !== right - left) surface.width = right - left;
        if (surface.height !== bottom - top) surface.height = bottom - top;
        const pixels = surface.width * surface.height;
        stats.surfacePixels += pixels;
        stats.peakSurfacePixels = Math.max(
          stats.peakSurfacePixels,
          stats.surfacePixels,
        );
        const layer = surface.getContext("2d")!;
        layer.resetTransform();
        layer.clearRect(0, 0, surface.width, surface.height);
        layer.setTransform(
          new DOMMatrix()
            .translate(-left, -top)
            .multiply(target.getTransform()),
        );
        visit(layer, node, true);
        target.save();
        target.resetTransform();
        target.globalAlpha = opacity;
        target.drawImage(surface, left, top);
        target.restore();
        stats.surfacePixels -= pixels;
        // Retain at most 8M pixels (32 MiB) across frames. Active nested
        // layers are bounded by their clipped subtree, not the full viewport.
        if (retainedPixels + pixels <= 8_388_608) {
          pool.push(surface);
          retainedPixels += pixels;
        } else {
          surface.width = 0;
          surface.height = 0;
        }
        return;
      }
      target.save();
      try {
        const world = target.getTransform();
        if (singlePaint && !isolated) target.globalAlpha = opacity;
        transformNode(target, node);
        const path = paths.get(node.id)!;
        const silhouette =
          (node.kind === "text" ||
            node.kind === "image" ||
            node.kind === "icon") &&
          node.shadows.some((shadow) => shadow.enabled)
            ? (mask: CanvasRenderingContext2D) => {
                drawContent(mask, node, path, images, byAsset);
                drawStroke(mask, node, path);
              }
            : undefined;
        drawShadows(target, node, path, "outer", silhouette);
        drawContent(target, node, path, images, byAsset, options.editingTextId);
        drawShadows(target, node, path, "inner", silhouette);
        drawStroke(target, node, path);
        if (node.kind === "frame") target.clip(path);
        target.setTransform(world);
        for (const child of descendants) visit(target, child);
      } finally {
        target.restore();
      }
    }
    for (const root of children.get(undefined) ?? []) visit(context, root);
    stats.visible = visibleIds.size;
    return stats;
  };
  const roots = children.get(undefined) ?? [];
  const sceneBounds = roots.reduce<Bounds | undefined>(
    (box, node) =>
      box ? union(box, bounds.get(node.id)!) : bounds.get(node.id)!,
    undefined,
  );
  const countVisible = (matrix: DOMMatrix, width: number, height: number) => {
    let count = 0;
    for (const node of nodes) {
      const box = mappedBounds(ownBounds.get(node.id)!, matrix);
      if (
        node.opacity > 0 &&
        box.right > 0 &&
        box.bottom > 0 &&
        box.left < width &&
        box.top < height
      )
        count++;
    }
    return count;
  };
  return Object.assign(paint, {
    bounds: sceneBounds,
    countVisible,
    nodeCount: nodes.length,
  });
}

export function paintScene(
  context: CanvasRenderingContext2D,
  nodes: NodeSummary[],
  assets: MediaAsset[],
  images: SceneResources,
  options: { editingTextId?: string } = {},
) {
  return createScenePainter(nodes, assets)(context, images, options);
}

function transformNode(context: CanvasRenderingContext2D, node: NodeSummary) {
  context.translate(node.x + node.width / 2, node.y + node.height / 2);
  context.rotate((node.rotation * Math.PI) / 180);
  context.scale(node.flip_x ? -1 : 1, node.flip_y ? -1 : 1);
  context.translate(-node.width / 2, -node.height / 2);
}

function nodePath(node: NodeSummary) {
  if (node.vector) return vectorPath(node);
  const path = new Path2D();
  path.roundRect(0, 0, node.width, node.height, node.corner_radii);
  return path;
}

function drawContent(
  context: CanvasRenderingContext2D,
  node: NodeSummary,
  path: Path2D,
  images: SceneResources,
  assets: Map<string, MediaAsset>,
  editingTextId?: string,
) {
  context.save();
  if (node.kind === "text" && node.text) {
    context.clip(path);
    if (node.id !== editingTextId) drawText(context, node);
  } else if (node.kind === "image" || node.kind === "icon") {
    context.clip(path);
    const key = imageKey(node, assets);
    const image = key ? images.get(key) : undefined;
    if (image)
      drawFittedImage(context, image, node.width, node.height, node.image_fit);
    else {
      context.fillStyle = "#c7cbd3";
      context.fill(path);
    }
  } else {
    const geometry = node.vector?.geometry;
    const open =
      geometry?.type === "line" ||
      (geometry?.type === "path" &&
        geometry.contours.every((contour) => !contour.closed));
    if (!open) {
      context.fillStyle = rgba(node.fill);
      context.fill(
        path,
        node.vector?.fill_rule === "evenodd" ? "evenodd" : "nonzero",
      );
    }
  }
  context.restore();
}

function drawText(context: CanvasRenderingContext2D, node: NodeSummary) {
  const text = node.text!;
  context.fillStyle = rgba(node.fill);
  context.font = fontDeclaration(text);
  context.letterSpacing = `${text.letter_spacing}px`;
  context.textBaseline = "alphabetic";
  context.textAlign =
    text.horizontal_align === "justify" ? "left" : text.horizontal_align;
  const lines =
    text.sizing === "auto_width"
      ? text.content
          .split("\n")
          .map((content) => ({ content, paragraphEnd: true }))
      : layoutTextLines(context, text.content, node.width);
  const lineHeight = text.font_size * text.line_height;
  const blockHeight = lines.length * lineHeight;
  // Use font-wide metrics, not the current glyphs: every line must share a
  // stable baseline, with CSS-style half-leading above and below the font.
  const metrics = context.measureText("Mg");
  const ascent = metrics.fontBoundingBoxAscent;
  const descent = metrics.fontBoundingBoxDescent;
  const baseline = (lineHeight - ascent - descent) / 2 + ascent;
  let y =
    text.vertical_align === "middle"
      ? (node.height - blockHeight) / 2
      : text.vertical_align === "bottom"
        ? node.height - blockHeight
        : 0;
  y += baseline;
  const x =
    text.horizontal_align === "center"
      ? node.width / 2
      : text.horizontal_align === "right"
        ? node.width
        : 0;
  for (const line of lines) {
    const words = line.content.split(/\s+/);
    if (
      text.horizontal_align === "justify" &&
      !line.paragraphEnd &&
      words.length > 1
    ) {
      const widths = words.map((word) => context.measureText(word).width);
      const gap =
        (node.width - widths.reduce((sum, width) => sum + width, 0)) /
        (words.length - 1);
      let cursor = 0;
      words.forEach((word, index) => {
        context.fillText(word, cursor, y);
        cursor += widths[index] + gap;
      });
    } else context.fillText(line.content, x, y);
    y += lineHeight;
  }
}

function drawStroke(
  context: CanvasRenderingContext2D,
  node: NodeSummary,
  path: Path2D,
) {
  if (node.stroke_width <= 0 || node.stroke[3] <= 0) return;
  context.save();
  context.strokeStyle = rgba(node.stroke);
  context.lineJoin = node.stroke_join === "round" ? "round" : "miter";
  context.lineCap = node.vector?.geometry.type === "line" ? "round" : "butt";
  const geometry = node.vector?.geometry;
  const open =
    geometry?.type === "line" ||
    (geometry?.type === "path" &&
      geometry.contours.some((contour) => !contour.closed));
  const align = open ? "center" : node.stroke_align;
  context.lineWidth = node.stroke_width * (align === "center" ? 1 : 2);
  if (align === "inside")
    context.clip(
      path,
      node.vector?.fill_rule === "evenodd" ? "evenodd" : "nonzero",
    );
  if (align === "outside") {
    const outside = new Path2D();
    const extent = Math.max(node.width, node.height) + node.stroke_width * 4;
    outside.rect(-extent, -extent, extent * 3, extent * 3);
    outside.addPath(path);
    context.clip(outside, "evenodd");
  }
  context.stroke(path);
  context.restore();
}

export async function loadSceneFonts(nodes: NodeSummary[]) {
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

export function layoutTextLines(
  context: CanvasRenderingContext2D,
  content: string,
  maxWidth: number,
) {
  const lines: { content: string; paragraphEnd: boolean }[] = [];
  for (const paragraph of content.split("\n")) {
    const words = paragraph.split(/\s+/);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push({ content: line, paragraphEnd: false });
        line = word;
      } else line = candidate;
    }
    lines.push({ content: line, paragraphEnd: true });
  }
  return lines;
}

function vectorPath(node: NodeSummary) {
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

const imageCache = new Map<string, Promise<HTMLImageElement>>();

export function loadSceneImage(source: string) {
  const cached = imageCache.get(source);
  if (cached) return cached;
  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      imageCache.delete(source);
      reject(new Error("Image decode failed"));
    };
    image.crossOrigin = "anonymous";
    image.src = source;
  });
  if (imageCache.size >= 128)
    imageCache.delete(imageCache.keys().next().value!);
  imageCache.set(source, pending);
  return pending;
}

function rgba(color: number[]) {
  const [red = 0, green = 0, blue = 0, alpha = 1] = color;
  return `rgba(${red * 255}, ${green * 255}, ${blue * 255}, ${alpha})`;
}
