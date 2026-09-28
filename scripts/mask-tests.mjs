import assert from "node:assert/strict";
import { mixedFixture, openFixture } from "./mixed-fixture.mjs";
export async function testMasks(browser, url) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  try {
    await page.goto(url);
    await page
      .locator(".save-status > span")
      .filter({ hasText: /^Saved in this browser/ })
      .waitFor();
    const fixture = await mixedFixture(page, 2),
      nodes = fixture.document.pages[0].nodes;
    nodes.forEach((n, i) =>
      Object.assign(n, {
        kind: i ? "vector" : "rectangle",
        vector: i
          ? { geometry: { type: "ellipse" }, fill_rule: "nonzero" }
          : null,
        x: i ? 150 : 100,
        y: i ? 150 : 100,
        width: i ? 100 : 200,
        height: i ? 100 : 200,
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
    await openFixture(page, fixture.document, "Mask test.libra");
    await page.getByTestId(`layer-node-${nodes[0].id}`).click();
    await page
      .getByTestId(`layer-node-${nodes[1].id}`)
      .click({ modifiers: ["Shift"] });
    await page
      .getByRole("button", { name: "Use as mask", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Release mask", exact: true })
      .waitFor();
    await page.waitForFunction(() => {
      const bounds = JSON.parse(
        document.querySelector(".selection-overlay").dataset.visibleBounds ??
          "[]",
      )[0];
      return (
        bounds &&
        Math.abs(bounds.x - 150) < 1 &&
        Math.abs(bounds.y - 150) < 1 &&
        Math.abs(bounds.width - 100) < 1 &&
        Math.abs(bounds.height - 100) < 1
      );
    });
    await page.getByRole("button", { name: "Fit", exact: true }).click();
    await page.waitForTimeout(200);
    const pixel = async (x, y) =>
      page.locator(".scene-content").evaluate(
        (c, { x, y }) => {
          const v = JSON.parse(c.dataset.view);
          return [
            ...c
              .getContext("2d")
              .getImageData(
                Math.round((x * v.zoom + v.pan.x) * v.ratio),
                Math.round((y * v.zoom + v.pan.y) * v.ratio),
                1,
                1,
              ).data,
          ];
        },
        { x, y },
      );
    assert.deepEqual(
      await pixel(200, 200),
      [255, 0, 0, 255],
      "Mask shape must not paint over content",
    );
    assert.equal(
      (await pixel(155, 155))[3],
      0,
      "Ellipse corner must clip content",
    );
    assert.equal(
      (await pixel(120, 120))[3],
      0,
      "Outside mask must be transparent",
    );
    await page
      .locator(".save-status > span")
      .filter({ hasText: /^Saved in this browser/ })
      .waitFor();
    await page.reload();
    await page.locator(".scene-content[data-view]").waitFor();
    const canvas = page.getByLabel("Open Libra WebGPU editor canvas");
    const box = await canvas.boundingBox();
    const point = async (x, y) => {
      const view = await page
        .locator(".scene-content")
        .evaluate((c) => JSON.parse(c.dataset.view));
      return {
        x: box.x + x * view.zoom + view.pan.x,
        y: box.y + y * view.zoom + view.pan.y,
      };
    };
    const center = await point(200, 200),
      empty = await point(350, 350);
    await page.mouse.click(empty.x, empty.y);
    await page.mouse.click(center.x, center.y);
    await page
      .getByRole("button", { name: "Release mask", exact: true })
      .waitFor();
    await page.mouse.dblclick(center.x, center.y);
    await page
      .getByRole("button", { name: "Release mask", exact: true })
      .waitFor();
    // Only an explicit panel selection allows direct manipulation of a child.
    await page.getByTestId(`layer-node-${nodes[1].id}`).click();
    await page.mouse.click(center.x, center.y);
    assert.equal(
      await page
        .getByRole("button", { name: "Release mask", exact: true })
        .count(),
      0,
    );
    await page.getByText(/Mask shape · its geometry/).waitFor();
    await page.mouse.click(empty.x, empty.y);
    await page.mouse.click(center.x, center.y);

    await page
      .getByRole("button", { name: "Release mask", exact: true })
      .click();
    await page.waitForTimeout(100);
    assert.deepEqual(await pixel(200, 200), [0, 255, 0, 255]);
    await page.mouse.click(empty.x, empty.y);
    await page.mouse.click(center.x, center.y);
    await page.getByRole("button", { name: "Ungroup", exact: true }).waitFor();
    assert.deepEqual(await pixel(120, 120), [255, 0, 0, 255]);
    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(100);
    assert.deepEqual(await pixel(200, 200), [255, 0, 0, 255]);
    assert.equal((await pixel(120, 120))[3], 0);
    await page.screenshot({ path: "/tmp/openlibra-mask.png" });
    console.log(
      "Masks passed (shape clipping, hidden source, browser reload, release and undo).",
    );
  } finally {
    await page.close();
  }
}
