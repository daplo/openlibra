import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
export async function testPathEditing(browser, url) {
  const page = await browser.newPage({
    viewport: { width: 1500, height: 1000 },
  });
  await page.goto(url);
  await page.locator(".scene-content").waitFor();
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: /^New document/ }).click();
  await page
    .getByText("This page is empty. Add a frame or rectangle.")
    .waitFor();
  const start = async () => {
    await page.getByRole("button", { name: "Pen tool", exact: true }).click();
    return page.getByRole("graphics-document", { name: "Path editing canvas" });
  };
  await start();
  const overlay = page.locator(".path-editor");
  const box = await overlay.boundingBox();
  const click = async (x, y) => page.mouse.click(box.x + x, box.y + y);
  const drag = async (x, y, dx, dy) => {
    await page.mouse.move(box.x + x, box.y + y);
    await page.mouse.down();
    await page.mouse.move(box.x + x + dx, box.y + y + dy, { steps: 5 });
    await page.mouse.up();
  };
  await click(170, 200);
  await drag(300, 250, 45, -40);
  await click(440, 190);
  assert.equal(await overlay.locator("rect[data-point]").count(), 3);
  await page.getByRole("button", { name: "Finish path", exact: true }).click();
  await overlay.waitFor({ state: "detached" });
  await page
    .getByRole("button", { name: "Edit curve points", exact: true })
    .click();
  assert.equal(await overlay.locator("rect[data-point]").count(), 3);
  const anchor = overlay.locator('rect[data-point="1"]');
  await anchor.click();
  const beforeDrag = await overlay.locator("path").getAttribute("d");
  const anchorBox = await anchor.boundingBox();
  await page.mouse.move(anchorBox.x + 5, anchorBox.y + 5);
  await page.mouse.down();
  await page.mouse.move(anchorBox.x + 25, anchorBox.y + 20, { steps: 5 });
  await page.mouse.up();
  assert.notEqual(await overlay.locator("path").getAttribute("d"), beforeDrag);
  const handle = overlay.locator('circle[data-handle="handle_out"]');
  const handleBox = await handle.boundingBox();
  const beforeHandle = await overlay.locator("path").getAttribute("d");
  await page.mouse.move(handleBox.x + 5, handleBox.y + 5);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 25, handleBox.y - 10, { steps: 5 });
  await page.mouse.up();
  assert.notEqual(
    await overlay.locator("path").getAttribute("d"),
    beforeHandle,
  );
  await page.screenshot({ path: "/tmp/openlibra-path-handles.png" });
  await page.getByRole("button", { name: "Add anchor", exact: true }).click();
  assert.equal(await overlay.locator("rect[data-point]").count(), 4);
  await page
    .getByRole("button", { name: "Smooth (soft)", exact: true })
    .click();
  assert.equal(await overlay.locator("circle[data-handle]").count(), 2);
  assert.equal(
    await page
      .getByRole("button", { name: "Smooth (soft)", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("button", { name: "Sharp (hard)", exact: true }).click();
  assert.equal(await overlay.locator("circle[data-handle]").count(), 0);
  await page
    .getByRole("button", { name: "Delete anchor", exact: true })
    .click();
  assert.equal(await overlay.locator("rect[data-point]").count(), 3);
  await overlay.locator('rect[data-point="2"]').click();
  await page
    .getByRole("button", { name: "Continue path", exact: true })
    .click();
  await click(550, 290);
  await page.getByRole("button", { name: "Finish path", exact: true }).click();
  await page.getByRole("button", { name: "Edit path", exact: true }).click();
  assert.equal(await overlay.locator("rect[data-point]").count(), 4);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  // Re-enter a finished path directly from its canvas geometry.
  await page
    .getByRole("button", { name: "Edit curve points", exact: true })
    .click();
  const reentry = await overlay.locator('rect[data-point="1"]').boundingBox();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.mouse.dblclick(reentry.x + 5, reentry.y + 5);
  await overlay.waitFor();
  assert.equal(await overlay.locator("rect[data-point]").count(), 4);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  // Use the real SVG download; curves and transparent fills survive authoring.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export SVG", exact: true }).click();
  const svg = readFileSync(await (await download).path(), "utf8");
  assert.match(svg, /<path d="M.*C/);
  assert.match(svg, /fill-opacity="0"/);
  await page.keyboard.press("ControlOrMeta+z");
  await page.getByRole("button", { name: "Edit path", exact: true }).click();
  assert.equal(await overlay.locator("rect[data-point]").count(), 3);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.keyboard.press("ControlOrMeta+Shift+z");
  // Reload from browser autosave then inspect persisted geometry.
  await page.getByText(/^Saved in this browser/).waitFor();
  await page.reload();
  await page.locator(".scene-content").waitFor();
  await page.getByRole("button", { name: /^(◇|□) Path$/, exact: true }).click();
  await page.getByRole("button", { name: "Edit path", exact: true }).click();
  assert.equal(await overlay.locator("rect[data-point]").count(), 4);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await start();
  await click(180, 400);
  await click(260, 430);
  await click(330, 380);
  await overlay.locator('rect[data-point="0"]').click();
  await overlay.waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Edit path", exact: true }).click();
  assert.match(await overlay.locator("path").getAttribute("d"), /Z/);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await start();
  await click(180, 500);
  await page.keyboard.press("Escape");
  await overlay.waitFor({ state: "detached" });
  // Curve subdivision must preserve all sampled points, not just the midpoint.
  const bundle = await build({
    stdin: {
      contents: 'export * from "./apps/web/src/editor/path-editing";',
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "iife",
    globalName: "pathTest",
  });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const math = await page.evaluate(() => {
    const c = {
      closed: false,
      points: [
        { position: [0, 0], handle_out: [0.1, 1], point_type: "smooth" },
        { position: [1, 0], handle_in: [0.8, -0.5], point_type: "corner" },
      ],
    };
    const split = pathTest.splitSegment(c, 0);
    const sample = (a, b, t) => {
      const p = pathTest.lerp(a.position, a.handle_out ?? a.position, t),
        q = pathTest.lerp(
          a.handle_out ?? a.position,
          b.handle_in ?? b.position,
          t,
        ),
        r = pathTest.lerp(b.handle_in ?? b.position, b.position, t);
      return pathTest.lerp(pathTest.lerp(p, q, t), pathTest.lerp(q, r, t), t);
    };
    let error = 0;
    for (let i = 0; i <= 100; i++) {
      const t = i / 100,
        p = sample(c.points[0], c.points[1], t),
        q =
          t <= 0.5
            ? sample(split.points[0], split.points[1], t * 2)
            : sample(split.points[1], split.points[2], t * 2 - 1);
      error = Math.max(error, Math.hypot(p[0] - q[0], p[1] - q[1]));
    }
    const p = {
      position: [0, 0],
      handle_in: [-2, 0],
      handle_out: [2, 0],
      point_type: "symmetric",
    };
    return {
      error,
      symmetric: pathTest.movePoint(p, [1, 3], "handle_out").handle_in,
      broken: pathTest.movePoint(p, [1, 3], "handle_out", true).handle_in,
    };
  });
  assert.ok(math.error < 1e-10);
  assert.deepEqual(math.symmetric, [-1, -3]);
  assert.deepEqual(math.broken, [-2, 0]);
  await page.screenshot({ path: "/tmp/openlibra-path-editor.png" });
  await page.close();
  console.log(
    "Path editing passed (pen curves, close/cancel/continue, anchors, conversion, undo/redo, reload, SVG, exact subdivision and handle constraints).",
  );
}
