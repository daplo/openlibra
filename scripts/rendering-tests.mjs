import { testAdvancedRendering } from "./rendering-advanced-tests.mjs";
import assert from "node:assert/strict";
import { build } from "esbuild";

export async function testRendering(browser, url) {
  const bundle = await build({
    stdin: {
      contents:
        'export * from "./apps/web/src/editor/scene-painter"; export * from "./apps/web/src/editor/export-frame"; export * from "./apps/web/src/editor/scene-tiles";',
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "iife",
    globalName: "sceneTest",
  });
  const page = await browser.newPage();
  await page.goto(url);
  await page.locator(".scene-content").waitFor();
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(async () => {
    const base = {
      kind: "rectangle",
      x: 0,
      y: 0,
      width: 40,
      height: 40,
      fill: [1, 0, 0, 1],
      stroke: [0, 0, 0, 0],
      stroke_width: 0,
      corner_radii: [0, 0, 0, 0],
      opacity: 1,
      rotation: 0,
      flip_x: false,
      flip_y: false,
      shadows: [],
      stroke_align: "center",
      stroke_join: "straight",
    };
    const node = (id, props = {}) => ({ ...base, id, name: id, ...props });
    const frame = node("frame", {
      kind: "frame",
      width: 200,
      height: 160,
      fill: [1, 1, 1, 1],
    });
    const nodes = [
      frame,
      node("image", {
        kind: "image",
        parent_id: "frame",
        asset_id: "asset",
        image_fit: "fill",
      }),
      node("cover", { parent_id: "frame", x: 20, y: 20, fill: [0, 0, 1, 1] }),
      node("clip", {
        kind: "frame",
        parent_id: "frame",
        x: 80,
        width: 30,
        height: 30,
        fill: [0, 0, 0, 0],
      }),
      node("group", {
        kind: "group",
        parent_id: "frame",
        x: 0,
        y: 70,
        opacity: 0.5,
        fill: [0, 0, 0, 0],
      }),
      node("clipped", { parent_id: "clip", x: 90, fill: [0, 1, 0, 1] }),
      node("a", { parent_id: "group", y: 70 }),
      node("b", { parent_id: "group", x: 20, y: 70 }),
      node("vector", {
        kind: "vector",
        parent_id: "frame",
        x: 140,
        y: 10,
        vector: { geometry: { type: "ellipse" }, fill_rule: "nonzero" },
        fill: [0, 1, 0, 1],
      }),
      node("text", {
        kind: "text",
        parent_id: "frame",
        x: 100,
        y: 70,
        width: 80,
        text: {
          content: "Ab",
          font_family: "Arial",
          font_size: 22,
          font_weight: 400,
          font_style: "normal",
          line_height: 1.2,
          letter_spacing: 2,
          horizontal_align: "left",
          vertical_align: "top",
          sizing: "fixed",
        },
      }),
      node("rotated", {
        parent_id: "frame",
        x: 100,
        y: 120,
        width: 40,
        height: 10,
        rotation: 90,
        flip_x: true,
        fill: [0, 0, 1, 1],
      }),
    ];
    const assets = [
      {
        id: "asset",
        kind: "image",
        source:
          "data:image/svg+xml," +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><path fill="red" d="M0 0h40v40H0z"/></svg>',
          ),
        mime_type: "image/svg+xml",
      },
    ];
    const images = await sceneTest.loadSceneImages(nodes, assets);
    await sceneTest.loadSceneFonts(nodes);
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 160;
    const ctx = canvas.getContext("2d");
    sceneTest.paintScene(ctx, nodes, assets, images);
    const pixel = (x, y) => [...ctx.getImageData(x, y, 1, 1).data];
    const samples = [
      [10, 10],
      [25, 25],
      [100, 10],
      [115, 10],
      [10, 80],
      [30, 80],
      [160, 30],
      [120, 110],
    ].map(([x, y]) => pixel(x, y));
    const original = ctx.getImageData(0, 0, 200, 160).data;
    let difference = 0;
    for (const scale of [1, 2]) {
      const blob = await sceneTest.renderFramePng(frame, nodes, assets, scale);
      const bitmap = await createImageBitmap(blob);
      if (bitmap.width !== 200 * scale || bitmap.height !== 160 * scale)
        throw Error("Wrong PNG size");
      if (scale === 1) {
        ctx.clearRect(0, 0, 200, 160);
        ctx.drawImage(bitmap, 0, 0);
        const data = ctx.getImageData(0, 0, 200, 160).data;
        for (let i = 0; i < data.length; i++)
          difference = Math.max(difference, Math.abs(data[i] - original[i]));
      }
      bitmap.close();
    }
    let rejected = false;
    try {
      await sceneTest.renderFramePng(frame, nodes, assets, Infinity);
    } catch {
      rejected = true;
    }
    let missingRejected = false;
    try {
      await sceneTest.renderFramePng(frame, nodes, [], 1);
    } catch {
      missingRejected = true;
    }
    ctx.clearRect(0, 0, 200, 160);
    sceneTest.paintScene(
      ctx,
      [
        node("stroke", {
          x: 20,
          y: 20,
          width: 20,
          height: 20,
          stroke: [0, 0, 1, 1],
          stroke_width: 4,
          stroke_align: "inside",
        }),
        node("shadow", {
          x: 70,
          y: 20,
          width: 20,
          height: 20,
          shadows: [
            {
              enabled: true,
              kind: "outer",
              color: [0, 0, 0, 1],
              offset_x: 10,
              offset_y: 0,
              blur: 0,
              spread: 0,
            },
          ],
        }),
      ],
      [],
      new Map(),
    );
    const effectSamples = [
      [18, 30],
      [21, 30],
      [30, 30],
      [95, 30],
    ].map(([x, y]) => pixel(x, y));
    // Increasing leading must move the ink by half the added line height.
    // This catches top-baseline rendering that leaves all spacing below text.
    const inkTop = (lineHeight, alignment, content = "Send") => {
      ctx.clearRect(0, 0, 200, 160);
      sceneTest.paintScene(
        ctx,
        [
          node("label", {
            kind: "text",
            width: 180,
            height: 120,
            text: {
              ...nodes.find((n) => n.id === "text").text,
              content,
              font_size: 20,
              line_height: lineHeight,
              vertical_align: alignment,
            },
          }),
        ],
        [],
        new Map(),
      );
      const pixels = ctx.getImageData(0, 0, 200, 160).data;
      for (let y = 0; y < 160; y++)
        for (let x = 0; x < 200; x++)
          if (pixels[(y * 200 + x) * 4 + 3] > 128) return y;
      throw Error("Text did not render");
    };
    const textOffsets = {
      leading: inkTop(2, "top") - inkTop(1, "top"),
      middle: inkTop(2, "middle") - inkTop(2, "top"),
      bottom: inkTop(2, "bottom") - inkTop(2, "top"),
      multiline:
        inkTop(2, "middle", "Send\nRequest") -
        inkTop(2, "top", "Send\nRequest"),
    };
    return {
      samples,
      difference,
      rejected,
      missingRejected,
      effectSamples,
      textOffsets,
    };
  });
  assert.deepEqual(result.samples, [
    [255, 0, 0, 255],
    [0, 0, 255, 255],
    [0, 255, 0, 255],
    [255, 255, 255, 255],
    [255, 127, 127, 255],
    [255, 127, 127, 255],
    [0, 255, 0, 255],
    [0, 0, 255, 255],
  ]);
  assert.deepEqual(result.textOffsets, {
    leading: 10,
    middle: 40,
    bottom: 80,
    multiline: 20,
  });
  assert.equal(result.difference, 0, "Canvas and PNG pixels differ");
  assert.equal(result.rejected, true);
  assert.equal(result.missingRejected, true);
  assert.deepEqual(result.effectSamples, [
    [0, 0, 0, 0],
    [0, 0, 255, 255],
    [255, 0, 0, 255],
    [0, 0, 0, 255],
  ]);
  await testAdvancedRendering(page);
  await page.screenshot({ path: "/tmp/openlibra-rendering.png" });
  await page.close();
  console.log(
    "Rendering pixel tests passed (mixed paint order, frame clipping, isolated opacity, vectors, text, transforms, PNG 1x/2x).",
  );
}
