import assert from "node:assert/strict";
import { mixedFixture, openFixture } from "./mixed-fixture.mjs";

export async function testRenderingInteraction(browser, url) {
  await testMultiSelectionDrag(browser, url);
  for (const count of [1, 2000])
    await testSceneInteraction(browser, url, count);
}

async function testSceneInteraction(browser, url, count) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  try {
    await page.goto(url);
    await page
      .locator(".save-status > span")
      .filter({ hasText: /^Saved in this browser/ })
      .waitFor();
    const fixture = await mixedFixture(page, count);
    Object.assign(fixture.firstNode, {
      x: 100,
      y: 100,
      width: 60,
      height: 40,
      fill: [1, 0, 0, 1],
      stroke_width: 0,
      corner_radii: [0, 0, 0, 0],
      opacity: 1,
      rotation: 0,
      flip_x: false,
      shadows: [],
    });
    fixture.document.pages[0].nodes = [
      fixture.firstNode,
      ...fixture.document.pages[0].nodes.slice(1).map((node) => ({
        ...node,
        x: 100,
        y: 100,
        width: 60,
        height: 40,
        opacity: 0,
        shadows: [],
      })),
    ];
    await openFixture(page, fixture.document, "Live rendering.libra");
    await page.getByTestId(`layer-node-${fixture.firstNode.id}`).click();
    await page.getByRole("button", { name: "Fit", exact: true }).click();
    await page.waitForTimeout(150);
    const view = await page
      .locator(".scene-content")
      .evaluate((canvas) => JSON.parse(canvas.dataset.view));
    const bounds = await page
      .getByLabel("Open Libra WebGPU editor canvas")
      .boundingBox();
    const x = 130 * view.zoom + view.pan.x,
      y = 120 * view.zoom + view.pan.y;
    const dx = 60 * view.zoom + 30;
    const alpha = async (atX) =>
      page
        .locator(".scene-content")
        .evaluate(
          (canvas, { x, y, ratio }) =>
            canvas
              .getContext("2d")
              .getImageData(Math.round(x * ratio), Math.round(y * ratio), 1, 1)
              .data[3],
          { x: atX, y, ratio: view.ratio },
        );
    assert.equal(await alpha(x), 255);
    const paintCount = Number(
      await page.locator(".scene-content").getAttribute("data-paint-count"),
    );
    await page.mouse.move(bounds.x + x, bounds.y + y);
    await page.mouse.down();
    await page.mouse.move(bounds.x + x + dx, bounds.y + y, { steps: 4 });
    await page.waitForFunction(
      (count) =>
        Number(document.querySelector(".scene-content").dataset.paintCount) >
        count,
      paintCount,
    );
    // Check before pointerup: committing/reloading must not be needed to repaint.
    assert.equal(
      await alpha(x),
      0,
      "Old geometry is still visible during drag",
    );
    assert.equal(
      await alpha(x + dx),
      255,
      "Moved geometry is missing during drag",
    );
    await page.mouse.up();
    await page.keyboard.press("Meta+z");
    await page.waitForFunction(
      ({ x, y, ratio }) =>
        document
          .querySelector(".scene-content")
          .getContext("2d")
          .getImageData(Math.round(x * ratio), Math.round(y * ratio), 1, 1)
          .data[3] === 255,
      { x, y, ratio: view.ratio },
    );
    await page.getByLabel("Rotation degrees").fill("90");
    await page.getByLabel("Rotation degrees").press("Enter");
    await page
      .locator(".save-status > span")
      .filter({ hasText: /^Saved in this browser/ })
      .waitFor();
    await page.reload();
    await page.getByTestId(`layer-node-${fixture.firstNode.id}`).click();
    assert.equal(await page.getByLabel("Rotation degrees").inputValue(), "90");
    console.log(
      `Rendering interaction passed for ${count} nodes (live drag pixels, undo repaint, transform persistence).`,
    );
  } finally {
    await page.close();
  }
}

async function testMultiSelectionDrag(browser, url) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  try {
    await page.goto(url);
    await page
      .locator(".save-status > span")
      .filter({ hasText: /^Saved in this browser/ })
      .waitFor();
    const fixture = await mixedFixture(page, 3);
    fixture.document.pages[0].nodes.forEach((n, i) =>
      Object.assign(n, {
        kind: "rectangle",
        vector: null,
        text: null,
        asset_id: null,
        x: 100 + i * 180,
        y: 100,
        width: 60,
        height: 40,
        fill: [1, 0, 0, 1],
        opacity: 1,
        rotation: 0,
        flip_x: false,
        flip_y: false,
        shadows: [],
        stroke_width: 0,
        corner_radii: [0, 0, 0, 0],
      }),
    );
    await openFixture(page, fixture.document, "Multi drag.libra");
    const nodes = fixture.document.pages[0].nodes;
    await page.getByTestId(`layer-node-${nodes[0].id}`).click();
    await page
      .getByTestId(`layer-node-${nodes[1].id}`)
      .click({ modifiers: ["Shift"] });
    await page.getByRole("button", { name: "Fit", exact: true }).click();
    await page.waitForTimeout(200);
    const view = await page
      .locator(".scene-content")
      .evaluate((c) => JSON.parse(c.dataset.view));
    const bounds = await page
      .getByLabel("Open Libra WebGPU editor canvas")
      .boundingBox();
    const alpha = async (x, y) =>
      page
        .locator(".scene-content")
        .evaluate(
          (c, { x, y }) => c.getContext("2d").getImageData(x, y, 1, 1).data[3],
          {
            x: Math.round((x * view.zoom + view.pan.x) * view.ratio),
            y: Math.round((y * view.zoom + view.pan.y) * view.ratio),
          },
        );
    const x = bounds.x + 130 * view.zoom + view.pan.x,
      y = bounds.y + 120 * view.zoom + view.pan.y;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 90 * view.zoom, { steps: 6 });
    await page.waitForTimeout(100);
    assert.equal(
      await alpha(130, 210),
      255,
      "First selected object must move during drag",
    );
    assert.equal(
      await alpha(310, 210),
      255,
      "Second selected object must move during drag",
    );
    assert.equal(
      await alpha(310, 120),
      0,
      "Second selected object must leave its old position",
    );
    assert.equal(await alpha(490, 120), 255, "Unselected object must stay put");
    await page.mouse.up();
    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(100);
    assert.equal(await alpha(130, 120), 255);
    assert.equal(await alpha(310, 120), 255);
    assert.equal(await alpha(130, 210), 0);
    assert.equal(await alpha(310, 210), 0);
    console.log(
      "Multi-selection drag passed (both objects move live, unselected object stays, one undo restores both).",
    );
  } finally {
    await page.close();
  }
}
