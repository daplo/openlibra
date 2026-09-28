import assert from "node:assert/strict";

// Runs against the production app in an isolated browser profile and real IndexedDB.
export async function testProjectSafety(browser, url) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const saved = () =>
    page
      .locator(".save-status > span")
      .filter({ hasText: /^Saved in this browser/ })
      .waitFor();
  try {
    await page.goto(url);
    await saved();
    await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("open-libra-documents", 2);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const initial = await new Promise((resolve) => {
        const request = db
          .transaction("recent-documents")
          .objectStore("recent-documents")
          .getAll();
        request.onsuccess = () => resolve(request.result[0]);
      });
      const document = JSON.parse(initial.json);
      delete document.operation_history; // Fixture changes establish a new baseline.
      document.pages[0].name = "Latest retained page";
      document.active_page_id = document.pages[0].id;
      const tx = db.transaction(
        ["recent-documents", "recovery-snapshots"],
        "readwrite",
      );
      for (let i = 1; i <= 13; i++) {
        tx.objectStore("recent-documents").put({
          ...initial,
          id: `retained-${i}`,
          name: `Retained ${i}.libra`,
          updatedAt: i,
          json: JSON.stringify(document),
        });
      }
      document.pages[0].name = "Recovered earlier page";
      tx.objectStore("recovery-snapshots").put({
        id: "retained-snapshot",
        documentId: "retained-1",
        name: "Retained 1.libra",
        createdAt: 1,
        json: JSON.stringify(document),
      });
      tx.objectStore("recovery-snapshots").put({
        id: "damaged-snapshot",
        documentId: "retained-1",
        name: "Retained 1.libra",
        createdAt: 2,
        json: "damaged",
      });
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    });
    // An actual app save must not prune any older project or its snapshots.
    await page.getByRole("button", { name: "File", exact: true }).click();
    await page.getByRole("menuitem", { name: /^New document/ }).click();
    await page
      .locator("button.file-name")
      .filter({ hasText: "Untitled.libra" })
      .waitFor();
    await saved();
    await page.reload();
    await saved();
    await page.getByRole("button", { name: "Library", exact: true }).click();
    const library = page.getByTestId("project-library-view");
    await library.getByTestId("recent-project-retained-13").waitFor();
    const oldest = library.getByTestId("recent-project-retained-1");
    await oldest.waitFor();
    assert.ok((await library.locator(".project-card").count()) >= 15);

    const recovery = page.getByRole("dialog", { name: "Recovery history" });
    await library
      .getByTestId("recent-project-retained-13")
      .getByRole("button", { name: /Recover/ })
      .click();
    await recovery
      .getByText(
        "No recovery snapshots yet. Snapshots are created during autosave.",
      )
      .waitFor();
    assert.equal(
      await recovery
        .getByRole("button", { name: "Open as recovered copy" })
        .isDisabled(),
      true,
    );
    await page.keyboard.press("Escape");
    await recovery.waitFor({ state: "detached" });

    await oldest.getByRole("button", { name: /Recover/ }).click();
    await recovery.getByRole("region", { name: "Snapshot preview" }).waitFor();
    await recovery
      .getByText("Recovered earlier page", { exact: true })
      .waitFor();
    assert.equal(await recovery.getByRole("radio").count(), 2);
    assert.equal(await recovery.getByRole("radio").first().isDisabled(), true);
    assert.ok((await recovery.locator(".project-preview-node").count()) > 0);
    if (process.env.OPEN_LIBRA_RECOVERY_SCREENSHOT)
      await page.screenshot({
        path: process.env.OPEN_LIBRA_RECOVERY_SCREENSHOT,
      });
    await recovery.getByRole("button", { name: "Cancel", exact: true }).click();
    await recovery.waitFor({ state: "detached" });
    assert.equal(
      JSON.parse(
        (await readRecord(page, "recent-documents", "retained-1")).json,
      ).pages[0].name,
      "Latest retained page",
    );

    await page.evaluate(() => {
      window.failRecoveryReads = true;
      const getAll = IDBIndex.prototype.getAll;
      IDBIndex.prototype.getAll = function (...args) {
        if (
          window.failRecoveryReads &&
          this.objectStore.name === "recovery-snapshots"
        )
          throw new DOMException("Unavailable", "UnknownError");
        return getAll.apply(this, args);
      };
    });
    await oldest.getByRole("button", { name: /Recover/ }).click();
    await recovery.getByRole("alert").waitFor();
    await page.evaluate(() => {
      window.failRecoveryReads = false;
    });
    await recovery.getByRole("button", { name: "Retry", exact: true }).click();
    await recovery.getByRole("region", { name: "Snapshot preview" }).waitFor();
    await recovery.getByRole("button", { name: "Cancel", exact: true }).click();

    // Recovery forks the old snapshot and leaves the latest source intact.
    await oldest.getByRole("button", { name: /Recover/ }).click();
    await page
      .getByRole("dialog", { name: "Recovery history" })
      .getByRole("button", { name: "Open as recovered copy" })
      .click();
    await page
      .getByRole("dialog", { name: "Recovery history" })
      .waitFor({ state: "detached" });
    await page
      .locator("button.file-name")
      .filter({ hasText: "Retained 1 recovered.libra" })
      .waitFor();
    await page.getByText("Recovered earlier page", { exact: true }).waitFor();
    await saved();
    const source = await readRecord(page, "recent-documents", "retained-1");
    assert.equal(JSON.parse(source.json).pages[0].name, "Latest retained page");
    assert.ok(
      await readRecord(page, "recovery-snapshots", "retained-snapshot"),
    );
    await page.reload();
    await page.getByText("Recovered earlier page", { exact: true }).waitFor();
    await saved();

    const recoveredId = await page.evaluate(() =>
      localStorage.getItem("open-libra-last-document-id"),
    );
    const beforeFailure = await readRecord(
      page,
      "recent-documents",
      recoveredId,
    );
    // Simulate exhausted browser storage. The committed record must remain intact.
    await page.evaluate(() => {
      window.failProjectWrites = true;
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (window.failProjectWrites && this.name === "recent-documents")
          throw new DOMException("Storage full", "QuotaExceededError");
        return put.apply(this, args);
      };
    });
    await page.getByRole("button", { name: "+ Add page" }).click();
    await page
      .getByText("Browser save failed · changes are not saved", { exact: true })
      .waitFor();
    assert.equal(
      (await readRecord(page, "recent-documents", recoveredId)).json,
      beforeFailure.json,
    );
    assert.equal(
      await page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }),
      true,
    );

    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download .libra", exact: true })
      .click();
    assert.equal(
      (await downloadPromise).suggestedFilename(),
      "Retained 1 recovered.libra",
    );
    await page.getByText("Download requested", { exact: true }).waitFor();
    await page
      .getByText("Browser save failed · changes are not saved", { exact: true })
      .waitFor();
    await page.evaluate(() => {
      window.failProjectWrites = false;
    });
    await page.getByRole("button", { name: "Retry save", exact: true }).click();
    await saved();
    await page.waitForFunction(
      () => !document.querySelector(".save-status button"),
    );
    const afterRetry = await readRecord(page, "recent-documents", recoveredId);
    assert.equal(
      JSON.parse(afterRetry.json).pages.length,
      JSON.parse(beforeFailure.json).pages.length + 1,
    );
    assert.equal(
      await page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }),
      false,
    );
    await page.reload();
    await saved();
    assert.equal(
      await page.getByTestId(/^page-node-/).count(),
      JSON.parse(afterRetry.json).pages.length,
    );

    // A failed recovery snapshot must not masquerade as a failed main save.
    await page.evaluate(() => {
      window.failRecoveryWrites = true;
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (window.failRecoveryWrites && this.name === "recovery-snapshots")
          throw new DOMException("Storage full", "QuotaExceededError");
        return put.apply(this, args);
      };
    });
    await page.getByRole("button", { name: "+ Add page" }).click();
    await page
      .getByText(
        "Project saved in this browser, but its recovery snapshot failed. Download a copy or retry.",
        { exact: true },
      )
      .waitFor();
    assert.equal(
      JSON.parse((await readRecord(page, "recent-documents", recoveredId)).json)
        .pages.length,
      JSON.parse(afterRetry.json).pages.length + 1,
    );
    await page.evaluate(() => {
      window.failRecoveryWrites = false;
    });
    await page.getByRole("button", { name: "Retry save", exact: true }).click();
    await page.waitForFunction(
      () => !document.querySelector(".save-status button"),
    );

    // Permanent deletion is explicit, cancelable, and removes only its own history.
    await page.getByRole("button", { name: "Library", exact: true }).click();
    const original = page.getByTestId("recent-project-retained-1");
    page.once("dialog", (dialog) => dialog.dismiss());
    await original
      .getByRole("button", { name: /Delete .* permanently/ })
      .click();
    assert.ok(await readRecord(page, "recent-documents", "retained-1"));
    page.once("dialog", (dialog) => dialog.accept());
    await original
      .getByRole("button", { name: /Delete .* permanently/ })
      .click();
    await original.waitFor({ state: "detached" });
    assert.equal(
      await readRecord(page, "recent-documents", "retained-1"),
      undefined,
    );
    assert.equal(
      await readRecord(page, "recovery-snapshots", "retained-snapshot"),
      undefined,
    );
    assert.ok(await readRecord(page, "recent-documents", recoveredId));
    // Corrupt startup data stays recoverable instead of being overwritten by the demo.
    await page.evaluate(async (id) => {
      const db = await new Promise((resolve) => {
        const request = indexedDB.open("open-libra-documents", 2);
        request.onsuccess = () => resolve(request.result);
      });
      const tx = db.transaction("recent-documents", "readwrite");
      const store = tx.objectStore("recent-documents");
      const request = store.get(id);
      request.onsuccess = () =>
        store.put({ ...request.result, json: "corrupt project" });
      await new Promise((resolve) => {
        tx.oncomplete = resolve;
      });
      db.close();
    }, recoveredId);
    await page.reload();
    await saved();
    assert.equal(
      (await readRecord(page, "recent-documents", recoveredId)).json,
      "corrupt project",
    );
    assert.notEqual(
      await page.evaluate(() =>
        localStorage.getItem("open-libra-last-document-id"),
      ),
      recoveredId,
    );
    assert.deepEqual(errors, []);
    console.log(
      "Project safety passed (15+ projects, recovery fork/reload, quota failure, download, retry, close guard, deliberate deletion).",
    );
  } finally {
    await context.close();
  }
}

async function readRecord(page, store, id) {
  return page.evaluate(
    async ({ store, id }) => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("open-libra-documents", 2);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise((resolve, reject) => {
          const request = db.transaction(store).objectStore(store).get(id);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      } finally {
        db.close();
      }
    },
    { store, id },
  );
}
