import assert from "node:assert/strict";

export async function testAdvancedRendering(page) {
  const result = await page.evaluate(async () => {
    const base = {
      kind: "rectangle",
      x: 20,
      y: 20,
      width: 60,
      height: 60,
      fill: [1, 1, 1, 1],
      stroke: [0, 0, 0, 0],
      stroke_width: 0,
      corner_radii: [0, 0, 0, 0],
      stroke_align: "center",
      stroke_join: "round",
      opacity: 1,
      rotation: 0,
      flip_x: false,
      flip_y: false,
      shadows: [],
    };
    const node = (id, values = {}) => ({ ...base, id, name: id, ...values });
    const effect = (values = {}) => ({
      id: "shadow",
      enabled: true,
      kind: "inner",
      color: [0, 0, 0, 1],
      offset_x: 0,
      offset_y: 0,
      blur: 0,
      spread: 0,
      ...values,
    });
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 160;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const pixel = (x, y) => [...ctx.getImageData(x, y, 1, 1).data];
    const draw = (nodes) => {
      ctx.resetTransform();
      ctx.clearRect(0, 0, 200, 160);
      return sceneTest.paintScene(ctx, nodes, [], new Map());
    };
    draw([
      node("ellipse", {
        kind: "vector",
        vector: { geometry: { type: "ellipse" }, fill_rule: "nonzero" },
        shadows: [effect({ offset_x: 8 })],
      }),
    ]);
    const ellipse = [
      [22, 50],
      [50, 50],
      [21, 21],
    ].map(([x, y]) => pixel(x, y));
    const contour = (start, end) => ({
      closed: true,
      points: [
        [start, start],
        [end, start],
        [end, end],
        [start, end],
      ].map((position) => ({ position })),
    });
    const ring = (rule) =>
      node("ring", {
        kind: "vector",
        vector: {
          geometry: {
            type: "path",
            contours: [contour(0, 1), contour(0.3, 0.7)],
          },
          fill_rule: rule,
        },
        shadows: [effect({ spread: 3 })],
      });
    draw([ring("evenodd")]);
    const donut = [
      [50, 50],
      [36, 50],
      [30, 50],
    ].map(([x, y]) => pixel(x, y));
    draw([ring("nonzero")]);
    const union = [
      [50, 50],
      [36, 50],
    ].map(([x, y]) => pixel(x, y));
    draw([
      node("eroded", {
        fill: [0, 0, 0, 0],
        shadows: [effect({ kind: "outer", spread: -5 })],
      }),
    ]);
    const eroded = [
      [22, 50],
      [50, 50],
    ].map(([x, y]) => pixel(x, y));
    draw([
      node("line", {
        kind: "vector",
        height: 20,
        fill: [0, 0, 0, 0],
        stroke: [1, 0, 0, 1],
        stroke_width: 4,
        vector: { geometry: { type: "line" }, fill_rule: "nonzero" },
        shadows: [effect({ kind: "outer", offset_y: 10 })],
      }),
    ]);
    const line = [
      [40, 40],
      [40, 25],
    ].map(([x, y]) => pixel(x, y));
    const imageCanvas = document.createElement("canvas");
    imageCanvas.width = 60;
    imageCanvas.height = 60;
    const imageContext = imageCanvas.getContext("2d");
    imageContext.fillStyle = "red";
    imageContext.fillRect(20, 20, 20, 20);
    const asset = {
      id: "alpha",
      kind: "image",
      source: imageCanvas.toDataURL(),
      mime_type: "image/png",
    };
    const imageNode = node("alpha-image", {
      kind: "image",
      asset_id: "alpha",
      image_fit: "fill",
      shadows: [effect({ kind: "outer", offset_x: 10 })],
    });
    const alphaImages = await sceneTest.loadSceneImages([imageNode], [asset]);
    ctx.clearRect(0, 0, 200, 160);
    sceneTest.paintScene(ctx, [imageNode], [asset], alphaImages);
    const imageShadow = [
      [65, 50],
      [25, 25],
      [45, 45],
    ].map(([x, y]) => pixel(x, y));
    const blankText = node("blank-text", {
      kind: "text",
      text: {
        content: "",
        font_family: "Arial",
        font_size: 20,
        font_weight: 400,
        font_style: "normal",
        line_height: 1.2,
        letter_spacing: 0,
        horizontal_align: "left",
        vertical_align: "top",
        sizing: "fixed",
      },
      shadows: [effect({ kind: "outer", offset_x: 10 })],
    });
    draw([blankText]);
    const blankTextAlpha = pixel(50, 50)[3];
    const root = node("frame", {
      kind: "frame",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 90,
      flip_x: true,
    });
    const child = node("child", {
      parent_id: "frame",
      x: 60,
      y: 70,
      width: 30,
      height: 10,
      rotation: 90,
      flip_x: true,
      fill: [1, 0, 0, 1],
    });
    const exported = [];
    for (const scale of [1, 2]) {
      const bitmap = await createImageBitmap(
        await sceneTest.renderFramePng(root, [root, child], [], scale),
      );
      const output = document.createElement("canvas");
      output.width = 100 * scale;
      output.height = 100 * scale;
      const target = output.getContext("2d");
      target.drawImage(bitmap, 0, 0);
      exported.push(
        [...target.getImageData(15 * scale, 25 * scale, 1, 1).data],
        [...target.getImageData(85 * scale, 80 * scale, 1, 1).data],
      );
      bitmap.close();
    }
    const small = node("small", {
      x: 10,
      y: 10,
      width: 20,
      height: 20,
      opacity: 0.5,
      fill: [1, 0, 0, 1],
    });
    const stats = draw([
      small,
      ...Array.from({ length: 1000 }, (_, i) =>
        node(`off-${i}`, { x: 1000 + i * 80 }),
      ),
    ]);
    const visible = pixel(15, 15);
    // Deep transparent groups collapse into one isolation surface.
    const deep = Array.from({ length: 80 }, (_, i) =>
      node(`group-${i}`, {
        kind: "group",
        parent_id: i ? `group-${i - 1}` : undefined,
        fill: [0, 0, 0, 0],
        opacity: 0.99,
      }),
    );
    const deepStats = draw([...deep, { ...small, parent_id: "group-79" }]);
    ctx.font = "20px Arial";
    const wrapped = sceneTest.layoutTextLines(
      ctx,
      "one two three four\nlast",
      100,
    );
    const text = {
      content: "one two three four",
      font_family: "Arial",
      font_size: 20,
      font_weight: 400,
      font_style: "normal",
      line_height: 1.2,
      letter_spacing: 0,
      horizontal_align: "justify",
      vertical_align: "top",
      sizing: "fixed",
    };
    draw([
      node("text", {
        kind: "text",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        fill: [0, 0, 0, 1],
        text,
      }),
    ]);
    const scan = (top, bottom) => {
      let right = -1;
      for (let y = top; y < bottom; y++)
        for (let x = 0; x < 100; x++)
          if (pixel(x, y)[3] > 50) right = Math.max(right, x);
      return right;
    };
    const tileCanvas = document.createElement("canvas");
    tileCanvas.width = 1024;
    tileCanvas.height = 128;
    const tileContext = tileCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    const tileNodes = [
      node("across", {
        x: 500,
        y: 20,
        width: 40,
        height: 60,
        opacity: 0.5,
        fill: [1, 0, 0, 1],
        shadows: [effect({ kind: "outer", blur: 4, offset_x: 3 })],
      }),
    ];
    const tileImages = new Map();
    const prepared = sceneTest.createScenePainter(tileNodes, []);
    prepared(tileContext, tileImages);
    const expected = tileContext.getImageData(0, 0, 1024, 128).data;
    tileContext.clearRect(0, 0, 1024, 128);
    const tiled = sceneTest.createTiledScenePainter(prepared);
    const cold = tiled(tileContext, tileImages);
    const actual = tileContext.getImageData(0, 0, 1024, 128).data;
    let tileDifference = 0;
    for (let i = 0; i < actual.length; i++)
      tileDifference = Math.max(
        tileDifference,
        Math.abs(actual[i] - expected[i]),
      );
    tileContext.clearRect(0, 0, 1024, 128);
    const warm = tiled(tileContext, tileImages);
    tileContext.clearRect(0, 0, 1024, 128);
    tileContext.translate(-1024, 0);
    const panned = tiled(tileContext, tileImages);
    const pannedAlpha = tileContext.getImageData(512, 40, 1, 1).data[3];
    tileContext.resetTransform();
    tileContext.clearRect(0, 0, 1024, 128);
    const refreshed = tiled(tileContext, new Map());
    const budgetCanvas = document.createElement("canvas");
    budgetCanvas.width = 4097;
    budgetCanvas.height = 4096;
    let budgetRejected = false;
    try {
      sceneTest.paintScene(
        budgetCanvas.getContext("2d"),
        [
          node("huge", {
            x: 0,
            y: 0,
            width: 10000,
            height: 10000,
            opacity: 0.5,
            stroke: [0, 0, 0, 1],
            stroke_width: 1,
          }),
        ],
        [],
        new Map(),
      );
    } catch (error) {
      budgetRejected = error.message.includes("64 MiB");
    }
    budgetCanvas.width = 0;
    budgetCanvas.height = 0;
    return {
      budgetRejected,
      imageShadow,
      blankTextAlpha,
      tileDifference,
      cold,
      warm,
      panned,
      pannedAlpha,
      refreshed,
      ellipse,
      donut,
      union,
      eroded,
      line,
      exported,
      stats,
      deepStats,
      visible,
      wrapped,
      firstLineRight: scan(0, 23),
      lastLineRight: scan(24, 48),
    };
  });
  assert.equal(result.budgetRejected, true);
  assert.deepEqual(
    result.imageShadow,
    [
      [0, 0, 0, 255],
      [0, 0, 0, 0],
      [255, 0, 0, 255],
    ],
    "Image shadows must follow alpha, not image bounds",
  );
  assert.equal(
    result.blankTextAlpha,
    0,
    "Empty text must not cast a rectangular shadow",
  );
  assert.equal(
    result.tileDifference,
    0,
    "Tile boundaries must preserve transparent pixels and shadows at 1x",
  );
  assert.equal(result.cold.tilesBuilt, 2);
  assert.equal(result.warm.tilesBuilt, 0);
  assert.equal(result.panned.tilesBuilt, 2);
  assert.equal(result.pannedAlpha, 0);
  assert.equal(result.refreshed.tilesBuilt, 2);
  assert.ok(result.refreshed.tileCacheBytes <= 32 * 1024 * 1024);
  assert.deepEqual(result.ellipse, [
    [0, 0, 0, 255],
    [255, 255, 255, 255],
    [0, 0, 0, 0],
  ]);
  assert.deepEqual(result.donut, [
    [0, 0, 0, 0],
    [0, 0, 0, 255],
    [255, 255, 255, 255],
  ]);
  assert.deepEqual(
    result.union,
    [
      [255, 255, 255, 255],
      [255, 255, 255, 255],
    ],
    "Nonzero overlaps must not create a shadow hole",
  );
  assert.deepEqual(result.eroded, [
    [0, 0, 0, 0],
    [0, 0, 0, 255],
  ]);
  assert.deepEqual(result.line, [
    [0, 0, 0, 255],
    [0, 0, 0, 0],
  ]);
  assert.deepEqual(result.exported, [
    [255, 0, 0, 255],
    [255, 255, 255, 255],
    [255, 0, 0, 255],
    [255, 255, 255, 255],
  ]);
  assert.equal(result.stats.culled, 1000);
  assert.ok(
    result.stats.peakSurfacePixels < 2000,
    "Small translucent objects must not allocate a viewport surface",
  );
  assert.ok(
    result.deepStats.peakSurfacePixels < 2000,
    "One-child transparent groups should share isolation",
  );
  assert.equal(result.visible[3], 128);
  assert.deepEqual(
    result.wrapped.map((line) => line.paragraphEnd),
    [false, true, true],
  );
  assert.ok(
    result.firstLineRight >= 95,
    "Justified line should reach the right edge",
  );
  assert.ok(
    result.lastLineRight < 95,
    "Last paragraph line stays left aligned",
  );
  console.log(
    "Advanced rendering passed (path shadows, fill rules, signed spread, open strokes, transformed PNG, justification, culling, bounded opacity layers).",
  );
}
