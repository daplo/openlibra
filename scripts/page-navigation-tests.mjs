import assert from "node:assert/strict";

export async function testPageNavigation(browser, url) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(url);
    await page.locator(".page-main").first().waitFor();
    const samples = [];
    const savedRevision = () =>
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
            request.onsuccess = () => resolve(request.result?.revision);
            request.onerror = () => reject(request.error);
          });
        } finally {
          db.close();
        }
      });
    let benchmarkRevision;
    for (const index of [2, 0, 3, 0, 3, 0]) {
      const started = Date.now();
      const interactionMs = await page
        .locator(".page-main")
        .nth(index)
        .evaluate(
          (button) =>
            new Promise((resolve) => {
              const start = performance.now();
              button.click();
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve(performance.now() - start)),
              );
            }),
        );
      await page.waitForFunction(
        (i) =>
          document
            .querySelectorAll(".page-row")
            [i]?.getAttribute("data-active") === "true",
        index,
      );
      const elapsed = Date.now() - started;
      samples.push({
        index,
        elapsed,
        interactionMs: Math.round(interactionMs),
      });
      // Initial stress-scene generation is deliberately excluded. Returning to
      // Home must stay interactive even with a large saved journal.
      if (index === 0)
        assert.ok(
          interactionMs < 500,
          `Home switch blocked for ${interactionMs}ms`,
        );
      await page
        .locator(".save-status > span")
        .filter({ hasText: /^Saved in this browser/ })
        .waitFor({ timeout: 60000 });
      if (index === 3 && benchmarkRevision === undefined)
        benchmarkRevision = await savedRevision();
    }
    await page.waitForTimeout(1200);
    assert.equal(
      await savedRevision(),
      benchmarkRevision,
      "Navigation must not rewrite the project or invalidate another tab",
    );
    await page.reload();
    await page.waitForFunction(
      () =>
        document
          .querySelectorAll(".page-row")[0]
          ?.getAttribute("data-active") === "true",
      null,
      { timeout: 60000 },
    );
    console.log(
      "Page navigation and large-scene autosave passed:",
      JSON.stringify(samples),
    );
  } finally {
    await context.close();
  }
}
