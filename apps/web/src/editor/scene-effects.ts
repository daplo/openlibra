import { localGeometryBounds } from "./scene-bounds";
import type { NodeSummary, ShadowSummary } from "./types";

// Effects use the actual path silhouette, including holes and open strokes.
// Cache device-space tiles rather than full-viewport layers. Each prepared
// document retains at most 16 MiB of effect pixels.
export function createEffectPainter() {
  const cache = new Map<
    string,
    { canvas: HTMLCanvasElement; pixels: number }
  >();
  let pixels = 0;
  const remember = (key: string, make: () => HTMLCanvasElement) => {
    let tile = cache.get(key);
    if (tile) {
      cache.delete(key);
      cache.set(key, tile);
      return tile.canvas;
    }
    const canvas = make();
    tile = { canvas, pixels: canvas.width * canvas.height };
    while (pixels + tile.pixels > 4_194_304 && cache.size) {
      const first = cache.keys().next().value!;
      pixels -= cache.get(first)!.pixels;
      cache.delete(first);
    }
    if (tile.pixels <= 4_194_304) {
      cache.set(key, tile);
      pixels += tile.pixels;
    }
    return canvas;
  };
  const draw = (
    context: CanvasRenderingContext2D,
    node: NodeSummary,
    path: Path2D,
    kind: "inner" | "outer",
    silhouette?: (context: CanvasRenderingContext2D) => void,
  ) => {
    for (const shadow of node.shadows) {
      if (!shadow.enabled || shadow.kind !== kind || shadow.color[3] <= 0)
        continue;
      const matrix = context.getTransform();
      const scale = Math.hypot(matrix.a, matrix.b);
      // Rasterize small effects in shape-local axes at a reusable resolution
      // bucket. Panning/rotation reuse the tile; zoom never upsamples it.
      const rasterScale = Math.max(
        0.125,
        2 ** (Math.ceil(Math.log2(scale) * 2) / 2),
      );
      const geometryBounds = localGeometryBounds(node);
      const localPadding =
        shadow.blur * 1.5 +
        Math.abs(shadow.spread) +
        node.stroke_width +
        3 / rasterScale;
      const lx = Math.floor(
        (geometryBounds.left - localPadding - Math.abs(shadow.offset_x)) *
          rasterScale,
      );
      const ly = Math.floor(
        (geometryBounds.top - localPadding - Math.abs(shadow.offset_y)) *
          rasterScale,
      );
      const rw =
        Math.ceil(
          (geometryBounds.right + localPadding + Math.abs(shadow.offset_x)) *
            rasterScale,
        ) - lx;
      const rh =
        Math.ceil(
          (geometryBounds.bottom + localPadding + Math.abs(shadow.offset_y)) *
            rasterScale,
        ) - ly;
      if (
        rw > 0 &&
        rh > 0 &&
        rw * rh <= 4_194_304 &&
        rw <= 16384 &&
        rh <= 16384
      ) {
        const key = JSON.stringify([node.id, shadow, rasterScale]);
        const tile = remember(key, () =>
          renderShadow(
            node,
            path,
            shadow,
            new DOMMatrix().translate(-lx, -ly).scale(rasterScale),
            rw,
            rh,
            (shadow.blur * rasterScale) / 2,
            shadow.offset_x * rasterScale,
            shadow.offset_y * rasterScale,
            silhouette,
          ),
        );
        context.drawImage(
          tile,
          lx / rasterScale,
          ly / rasterScale,
          rw / rasterScale,
          rh / rasterScale,
        );
        continue;
      }
      const blur = (shadow.blur * scale) / 2;
      const dx = matrix.a * shadow.offset_x + matrix.c * shadow.offset_y;
      const dy = matrix.b * shadow.offset_x + matrix.d * shadow.offset_y;
      const padding = Math.ceil(
        blur * 3 +
          Math.abs(shadow.spread) * scale +
          node.stroke_width * scale +
          3,
      );
      const box = localGeometryBounds(node);
      const corners = [
        [box.left, box.top],
        [box.right, box.top],
        [box.right, box.bottom],
        [box.left, box.bottom],
      ].map(([x, y]) => matrix.transformPoint({ x, y }));
      // Keep the blur source outside the viewport so offscreen geometry can cast into it.
      const left = Math.floor(
        Math.max(
          -padding - Math.abs(dx),
          Math.min(...corners.map((p) => p.x)) - padding - Math.abs(dx),
        ),
      );
      const top = Math.floor(
        Math.max(
          -padding - Math.abs(dy),
          Math.min(...corners.map((p) => p.y)) - padding - Math.abs(dy),
        ),
      );
      const right = Math.ceil(
        Math.min(
          context.canvas.width + padding + Math.abs(dx),
          Math.max(...corners.map((p) => p.x)) + padding + Math.abs(dx),
        ),
      );
      const bottom = Math.ceil(
        Math.min(
          context.canvas.height + padding + Math.abs(dy),
          Math.max(...corners.map((p) => p.y)) + padding + Math.abs(dy),
        ),
      );
      const width = right - left,
        height = bottom - top;
      if (width <= 0 || height <= 0) continue;
      if (width > 32767 || height > 32767 || width * height > 16_777_216)
        throw new Error(
          "This shadow is too large to render. Reduce the export scale or shadow size.",
        );
      const local = new DOMMatrix().translate(-left, -top).multiply(matrix);
      const key = JSON.stringify([
        node.id,
        shadow,
        local.a,
        local.b,
        local.c,
        local.d,
        local.e,
        local.f,
        width,
        height,
      ]);
      const tile = remember(key, () =>
        renderShadow(
          node,
          path,
          shadow,
          local,
          width,
          height,
          blur,
          dx,
          dy,
          silhouette,
        ),
      );
      context.save();
      context.resetTransform();
      context.drawImage(tile, left, top);
      context.restore();
    }
  };
  return Object.assign(draw, {
    clear: () => {
      cache.clear();
      pixels = 0;
    },
  });
}

function renderShadow(
  node: NodeSummary,
  path: Path2D,
  shadow: ShadowSummary,
  matrix: DOMMatrix,
  width: number,
  height: number,
  blur: number,
  dx: number,
  dy: number,
  silhouette?: (context: CanvasRenderingContext2D) => void,
) {
  const mask = document.createElement("canvas");
  mask.width = width;
  mask.height = height;
  const context = mask.getContext("2d", { willReadFrequently: true })!;
  const rule = node.vector?.fill_rule === "evenodd" ? "evenodd" : "nonzero";
  const geometry = node.vector?.geometry;
  const open =
    geometry?.type === "line" ||
    (geometry?.type === "path" &&
      geometry.contours.every((contour) => !contour.closed));
  const spread = shadow.kind === "inner" ? -shadow.spread : shadow.spread;
  context.setTransform(matrix);
  context.fillStyle = "white";
  context.strokeStyle = "white";
  context.lineJoin = "round";
  context.lineCap = geometry?.type === "line" ? "round" : "butt";
  if (silhouette) silhouette(context);
  else if (open) {
    context.lineWidth = node.stroke_width;
    if (node.stroke_width > 0) context.stroke(path);
  } else context.fill(path, rule);
  if (spread !== 0)
    spreadMask(context, spread * Math.hypot(matrix.a, matrix.b));
  if (shadow.kind === "inner") {
    context.resetTransform();
    context.globalCompositeOperation = "source-out";
    context.fillRect(0, 0, width, height);
  }
  const result = document.createElement("canvas");
  result.width = width;
  result.height = height;
  const output = result.getContext("2d")!;
  output.filter = blur > 0 ? `blur(${blur}px)` : "none";
  output.drawImage(mask, dx, dy);
  output.filter = "none";
  if (shadow.kind === "inner") {
    // Reuse the scratch mask to clip to the original silhouette, not its box.
    context.resetTransform();
    context.clearRect(0, 0, width, height);
    context.globalCompositeOperation = "source-over";
    context.setTransform(matrix);
    if (silhouette) silhouette(context);
    else if (open) {
      context.lineWidth = node.stroke_width;
      if (node.stroke_width > 0) context.stroke(path);
    } else context.fill(path, rule);
    output.globalCompositeOperation = "destination-in";
    output.drawImage(mask, 0, 0);
  }
  output.globalCompositeOperation = "source-in";
  const [r, g, b, a] = shadow.color;
  output.fillStyle = `rgba(${r * 255},${g * 255},${b * 255},${a})`;
  output.fillRect(0, 0, width, height);
  mask.width = 0;
  mask.height = 0;
  return result;
}

// Euclidean distance transform of the rasterized silhouette. Unlike stroking
// every contour, this respects nonzero unions and evenodd holes. Two separable
// passes keep work linear in tile pixels even for a large spread radius.
function spreadMask(context: CanvasRenderingContext2D, radius: number) {
  const { width, height } = context.canvas;
  const image = context.getImageData(0, 0, width, height);
  const distance = new Float32Array(width * height);
  const length = Math.max(width, height);
  const f = new Float64Array(length),
    output = new Float64Array(length);
  const sites = new Int32Array(length),
    limits = new Float64Array(length + 1);
  const transform = (count: number) => {
    let k = 0;
    sites[0] = 0;
    limits[0] = -Infinity;
    limits[1] = Infinity;
    for (let q = 1; q < count; q++) {
      let intersection =
        (f[q] + q * q - (f[sites[k]] + sites[k] * sites[k])) /
        (2 * (q - sites[k]));
      while (intersection <= limits[k]) {
        k--;
        intersection =
          (f[q] + q * q - (f[sites[k]] + sites[k] * sites[k])) /
          (2 * (q - sites[k]));
      }
      k++;
      sites[k] = q;
      limits[k] = intersection;
      limits[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < count; q++) {
      while (limits[k + 1] < q) k++;
      output[q] = (q - sites[k]) ** 2 + f[sites[k]];
    }
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inside = image.data[(y * width + x) * 4 + 3] >= 128;
      f[x] = (radius > 0 ? inside : !inside) ? 0 : 1e12;
    }
    transform(width);
    for (let x = 0; x < width; x++) distance[y * width + x] = output[x];
  }
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = distance[y * width + x];
    transform(height);
    for (let y = 0; y < height; y++) {
      const index = (y * width + x) * 4;
      const coverage =
        radius > 0
          ? radius + 1 - Math.sqrt(output[y])
          : Math.sqrt(output[y]) + radius;
      const alpha = Math.max(0, Math.min(1, coverage)) * 255;
      image.data[index + 3] =
        radius > 0
          ? Math.max(image.data[index + 3], alpha)
          : Math.min(image.data[index + 3], alpha);
    }
  }
  context.putImageData(image, 0, 0);
}
