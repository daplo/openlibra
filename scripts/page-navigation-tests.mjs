import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export async function testPageNavigation(browser, url) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    await page.locator(".page-main").first().waitFor();
    const waitSaved = () =>
      page
        .locator(".save-status > span")
        .filter({ hasText: /^Saved in this browser/ })
        .waitFor({ timeout: 60000 });
    const savedProject = () =>
      page.evaluate(async () => {
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open("open-libra-documents", 2);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          return await new Promise((resolve, reject) => {
            const request = db
              .transaction("recent-documents")
              .objectStore("recent-documents")
              .get(localStorage.getItem("open-libra-last-document-id"));
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
        } finally {
          db.close();
        }
      });
    await waitSaved();
    assert.equal(
      await page.locator(".page-main").count(),
      1,
      "Starter has only real project pages",
    );
    await page.getByRole("button", { name: "+ Add page", exact: true }).click();
    await page.getByRole("button", { name: "Rectangle", exact: true }).click();
    await waitSaved();
    const baseline = await savedProject();
    const project = JSON.parse(baseline.json);
    assert.equal(project.pages.length, 2);
    assert.ok(project.pages.every((item) => !item.benchmark_node_count));
    const samples = [];
    for (const count of [1000, 10000, 50000, 100000, 1000]) {
      const button = page.getByRole("button", {
        name: `${count / 1000}K Nodes stress test`,
        exact: true,
      });
      const started = Date.now();
      await button.click();
      await page
        .locator(".editor-loading-overlay")
        .waitFor({ state: "hidden", timeout: 60000 });
      await page.waitForFunction(
        (n) =>
          [...document.querySelectorAll(".metrics > div")].some(
            (row) =>
              row.querySelector("dt")?.textContent === "Objects" &&
              row.querySelector("dd")?.textContent ===
                n.toLocaleString("en-US"),
          ),
        count,
      );
      assert.equal(await button.getAttribute("aria-pressed"), "true");
      assert.equal(await page.locator(".page-main").count(), 2);
      await page
        .getByTestId(/^layer-node-/)
        .first()
        .locator(".layer-main")
        .click();
      const width = page.getByRole("spinbutton", { name: "W", exact: true });
      assert.equal(
        await width.inputValue(),
        "12",
        "Benchmark edits reset on every entry",
      );
      await width.fill("40");
      await width.press("Enter");
      assert.equal(await width.inputValue(), "40");
      await page.getByRole("button", { name: "Zoom in", exact: true }).click();
      await page.getByRole("button", { name: "Zoom out", exact: true }).click();
      await page.waitForTimeout(1000);
      assert.deepEqual(
        await savedProject(),
        baseline,
        "Benchmark edits must not trigger project writes",
      );
      samples.push({ count, elapsed: Date.now() - started });
    }
    // Explicit save while benchmarking must also use project metadata and payload.
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "File", exact: true }).click();
    await page.getByRole("menuitem", { name: /^Save/ }).click();
    const downloaded = JSON.parse(
      readFileSync(await (await downloadPromise).path(), "utf8"),
    );
    // .libra downloads wrap the engine document in the project envelope.
    assert.deepEqual(downloaded.document ?? downloaded, project);
    const afterSave = await savedProject();
    for (const field of [
      "json",
      "pages",
      "pageCount",
      "objectCount",
      "preview",
      "coverPageId",
      "revision",
    ])
      assert.deepEqual(
        afterSave[field],
        baseline[field],
        `Save polluted ${field}`,
      );
    await page
      .getByRole("button", { name: "Back to project", exact: true })
      .click();
    assert.match(
      await page
        .locator('.page-row[data-active="true"] .page-main')
        .innerText(),
      /Page 2$/,
    );
    // Local view navigation neither advances history nor writes the project.
    for (const index of [0, 1, 0, 1])
      await page.locator(".page-main").nth(index).click();
    await page.waitForTimeout(1100);
    assert.equal((await savedProject()).revision, baseline.revision);
    // Clicking a project page directly also exits a benchmark.
    await page
      .getByRole("button", { name: "10K Nodes stress test", exact: true })
      .click();
    await page
      .locator(".editor-loading-overlay")
      .waitFor({ state: "hidden", timeout: 60000 });
    await page.locator(".page-main").first().click();
    assert.equal(
      await page.getByRole("button", { name: "Back to project" }).count(),
      0,
    );
    await page.reload();
    await page.locator(".page-main").first().waitFor();
    assert.equal(await page.locator(".page-main").count(), 2);
    assert.equal(
      await page.locator(".page-row").first().getAttribute("data-active"),
      "true",
    );
    assert.equal(
      await page.getByRole("button", { name: "Back to project" }).count(),
      0,
    );
    assert.deepEqual(errors, []);
    console.log(
      "Temporary stress tests and project navigation passed:",
      JSON.stringify(samples),
    );
  } finally {
    await context.close();
  }
}
