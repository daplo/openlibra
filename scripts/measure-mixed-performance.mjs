import { chromium } from "playwright-core";
import { mixedFixture, openFixture } from "./mixed-fixture.mjs";
import os from "node:os";

const url = process.env.OPEN_LIBRA_URL ?? "http://127.0.0.1:4173/openlibra/";
const headless = process.env.HEADLESS !== "false";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless,
  args: ["--enable-unsafe-webgpu"],
});
try {
  const results = [];
  for (const count of (process.env.MIXED_COUNTS ?? "1000,10000")
    .split(",")
    .map(Number)) {
    console.error(`Measuring ${count} mixed objects…`);
    const page = await browser.newPage({
      viewport: { width: 1720, height: 900 },
    });
    await page.goto(url);
    await page
      .locator(".save-status > span")
      .filter({ hasText: /^Saved in this browser/ })
      .waitFor();
    const fixture = await mixedFixture(page, count);
    await page.evaluate(() => {
      window.paintSamples = [];
      const canvas = document.querySelector(".scene-content");
      window.paintObserver = new MutationObserver(() => {
        const current = Number(canvas.dataset.paintCount);
        if (current !== window.lastPaintCount) {
          window.lastPaintCount = current;
          window.paintSamples.push({
            ms: Number(canvas.dataset.paintMs),
            ...JSON.parse(canvas.dataset.paintStats),
          });
        }
      });
      window.paintObserver.observe(canvas, {
        attributes: true,
        attributeFilter: ["data-paint-count"],
      });
    });
    await openFixture(page, fixture.document, `Mixed-${count}.libra`);
    await page.getByRole("button", { name: "Fit", exact: true }).click();
    await page.waitForTimeout(500);
    const cold = await page.evaluate(() => {
      const paints = window.paintSamples;
      window.paintSamples = [];
      return paints;
    });
    const bounds = await page
      .getByLabel("Open Libra WebGPU editor canvas")
      .boundingBox();
    await page.mouse.move(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    );
    for (let i = 0; i < 80; i++) {
      await page.mouse.wheel(i % 2 ? 4 : -4, i % 2 ? 6 : -6);
      await page.waitForTimeout(16);
    }
    // Pan in addition to wheel zoom.
    await page.keyboard.down("Space");
    await page.mouse.down();
    for (let i = 0; i < 40; i++)
      await page.mouse.move(
        bounds.x + bounds.width / 2 + i * 2,
        bounds.y + bounds.height / 2 + Math.sin(i / 4) * 20,
        { steps: 1 },
      );
    await page.mouse.up();
    await page.keyboard.up("Space");
    const samples = await page.evaluate(() => {
      window.paintObserver.disconnect();
      return window.paintSamples;
    });
    if (samples.length < 20)
      throw Error(`Only ${samples.length} paints measured`);
    const sorted = samples.map((sample) => sample.ms).sort((a, b) => a - b);
    results.push({
      nodes: count,
      coldMaxPaintMs: Math.max(0, ...cold.map((sample) => sample.ms)),
      coldTileBuilds: cold.reduce(
        (sum, sample) => sum + (sample.tilesBuilt ?? 0),
        0,
      ),
      maxTileCacheMiB: Math.max(
        0,
        ...[...cold, ...samples].map(
          (sample) => (sample.tileCacheBytes ?? 0) / 1048576,
        ),
      ),
      samples: samples.length,
      meanMs: sorted.reduce((a, b) => a + b, 0) / sorted.length,
      p95Ms: sorted[Math.floor(sorted.length * 0.95)],
      maxMs: sorted.at(-1),
      peakOpacityMiB:
        (Math.max(...samples.map((s) => s.peakSurfacePixels)) * 4) / 1048576,
      meanCulled: samples.reduce((n, s) => n + s.culled, 0) / samples.length,
      viewport: "1720x900",
      targetPaintP95Ms: count === 1000 ? 16.7 : 33.3,
    });
    await page.screenshot({ path: `/tmp/openlibra-mixed-${count}.png` });
    console.error(JSON.stringify(results.at(-1)));
    await page.close();
  }
  console.log(
    JSON.stringify(
      {
        hardware: os.cpus()[0].model,
        memoryGiB: os.totalmem() / 1073741824,
        platform: `${os.platform()} ${os.release()} ${os.arch()}`,
        browser: browser.version(),
        headless,
        results,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
