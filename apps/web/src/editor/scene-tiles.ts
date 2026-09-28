import { createScenePainter, type SceneResources } from "./scene-painter";

// Large, mostly static documents retain raster tiles between camera changes.
// A new prepared painter (document/resource/editing revision) invalidates all
// tiles. The cache never upscales: its raster density is >= viewport density.
export function createTiledScenePainter(
  paint: ReturnType<typeof createScenePainter>,
) {
  const size = 512,
    limit = 32;
  const tiles = new Map<string, HTMLCanvasElement>();
  let previousImages: SceneResources | undefined;
  return (
    context: CanvasRenderingContext2D,
    images: SceneResources,
    options: { editingTextId?: string } = {},
  ) => {
    if (images !== previousImages) {
      tiles.clear();
      previousImages = images;
    }
    const view = context.getTransform();
    if (view.b !== 0 || view.c !== 0 || view.a <= 0 || view.d !== view.a)
      return paint(context, images, options);
    const scale = 2 ** (Math.ceil(Math.log2(view.a) * 4) / 4);
    const worldSize = size / scale;
    const left = Math.floor(-view.e / view.a / worldSize),
      top = Math.floor(-view.f / view.a / worldSize);
    const right = Math.ceil(
        (context.canvas.width - view.e) / view.a / worldSize,
      ),
      bottom = Math.ceil((context.canvas.height - view.f) / view.a / worldSize);
    if ((right - left) * (bottom - top) > limit)
      return paint(context, images, options);
    let built = 0,
      peakSurfacePixels = 0;
    for (let y = top; y < bottom; y++)
      for (let x = left; x < right; x++) {
        const key = `${scale}:${x}:${y}`;
        let tile = tiles.get(key);
        if (!tile) {
          tile = document.createElement("canvas");
          tile.width = size;
          tile.height = size;
          const target = tile.getContext("2d")!;
          target.setTransform(scale, 0, 0, scale, -x * size, -y * size);
          const stats = paint(target, images, options);
          peakSurfacePixels = Math.max(
            peakSurfacePixels,
            stats.peakSurfacePixels,
          );
          while (tiles.size >= limit) tiles.delete(tiles.keys().next().value!);
          tiles.set(key, tile);
          built++;
        } else {
          tiles.delete(key);
          tiles.set(key, tile);
        }
        // Snap adjoining destination edges to the same device pixel: no gaps or
        // doubled translucent pixels along independently cached tile boundaries.
        const dx = Math.round(x * worldSize * view.a + view.e),
          dy = Math.round(y * worldSize * view.a + view.f);
        const dr = Math.round((x + 1) * worldSize * view.a + view.e),
          db = Math.round((y + 1) * worldSize * view.a + view.f);
        context.save();
        context.resetTransform();
        context.drawImage(tile, dx, dy, dr - dx, db - dy);
        context.restore();
      }
    const visible = paint.countVisible(
      view,
      context.canvas.width,
      context.canvas.height,
    );
    return {
      visible,
      visited: visible,
      culled: paint.nodeCount - visible,
      surfacePixels: 0,
      peakSurfacePixels,
      tilesBuilt: built,
      tileCacheBytes: tiles.size * size * size * 4,
    };
  };
}
