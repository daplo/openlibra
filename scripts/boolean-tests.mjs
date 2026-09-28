import assert from "node:assert/strict";
import { mixedFixture, openFixture } from "./mixed-fixture.mjs";

export async function testBooleans(browser, url) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  try {
    await page.goto(url);
    await page
      .locator(".save-status > span")
      .filter({ hasText: /^Saved in this browser/ })
      .waitFor();
    const fixture = await mixedFixture(page, 2);
    const nodes = fixture.document.pages[0].nodes;
    nodes.forEach((n, i) =>
      Object.assign(n, {
        kind: "rectangle",
        vector: null,
        x: 100 + i * 100,
        y: 100,
        width: 200,
        height: 200,
        fill: i ? [0, 1, 0, 1] : [1, 0, 0, 1],
        opacity: 1,
        rotation: 0,
        flip_x: false,
        flip_y: false,
        shadows: [],
        stroke_width: 0,
        corner_radii: [0, 0, 0, 0],
      }),
    );
    await openFixture(page, fixture.document, "Boolean test.libra");
    await page.getByTestId(`layer-node-${nodes[0].id}`).click();
    await page
      .getByTestId(`layer-node-${nodes[1].id}`)
      .click({ modifiers: ["Shift"] });
    await page.getByRole("button", { name: "Union", exact: true }).click();
    await page
      .getByRole("button", { name: "Release boolean", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Fit", exact: true }).click();
    const pixels = async () =>
      page.locator(".scene-content").evaluate((c) => {
        const v = JSON.parse(c.dataset.view);
        return [150, 250, 350].map((x) => [
          ...c
            .getContext("2d")
            .getImageData(
              Math.round((x * v.zoom + v.pan.x) * v.ratio),
              Math.round((200 * v.zoom + v.pan.y) * v.ratio),
              1,
              1,
            ).data,
        ]);
      });
    for (const [mode, visible] of [
      ["Union", [true, true, true]],
      ["Subtract", [true, false, false]],
      ["Intersect", [false, true, false]],
      ["Exclude", [true, false, true]],
    ]) {
      await page.getByRole("button", { name: mode, exact: true }).click();
      await page.waitForTimeout(100);
      const colors = await pixels();
      assert.deepEqual(
        colors.map((p) => p[3] > 0),
        visible,
        mode,
      );
      colors
        .filter((p) => p[3] > 0)
        .forEach((p) => assert.deepEqual(p, [255, 0, 0, 255]));
    }
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export SVG", exact: true }).click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const svg = Buffer.concat(chunks).toString();
    assert.match(svg, /<path/);
    assert.match(svg, /evenodd/);
    await page
      .locator(".save-status > span")
      .filter({ hasText: /^Saved in this browser/ })
      .waitFor();
    await page.reload();
    await page.locator(".scene-content[data-view]").waitFor();
    const group = page
      .getByTestId(/layer-node-/)
      .filter({ hasText: "Boolean / Union" })
      .first();
    await group.click();
    await page
      .getByRole("button", { name: "Release boolean", exact: true })
      .waitFor();
    assert.deepEqual(
      (await pixels()).map((p) => p[3] > 0),
      [true, false, true],
    );
    await page.getByTestId(`layer-node-${nodes[1].id}`).click();
    const canvas = page.getByLabel("Open Libra WebGPU editor canvas");
    const box = await canvas.boundingBox();
    const view = await page
      .locator(".scene-content")
      .evaluate((c) => JSON.parse(c.dataset.view));
    const origin = {
      x: box.x + 250 * view.zoom + view.pan.x,
      y: box.y + 200 * view.zoom + view.pan.y,
    };
    await page.mouse.move(origin.x, origin.y);
    await page.mouse.down();
    await page.mouse.move(origin.x + 120 * view.zoom, origin.y, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    assert.deepEqual(
      (await pixels())[1],
      [255, 0, 0, 255],
      "Moving an operand from a cut-out must recompute the result",
    );
    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(100);
    assert.equal((await pixels())[1][3], 0);
    await group.click();
    await page
      .getByRole("button", { name: "Release boolean", exact: true })
      .click();
    await page.waitForTimeout(100);
    assert.deepEqual((await pixels())[1], [0, 255, 0, 255]);
    await page.keyboard.press("ControlOrMeta+z");
    await page
      .getByRole("button", { name: "Release boolean", exact: true })
      .waitFor();
    await page.waitForTimeout(100);
    assert.equal((await pixels())[1][3], 0);
    await page.screenshot({ path: "/tmp/openlibra-boolean.png" });
    console.log(
      "Booleans passed (four modes, hidden operands, SVG, reload, release, undo).",
    );
  } finally {
    await page.close();
  }
}
