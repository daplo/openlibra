import assert from "node:assert/strict";

const saved = (page) =>
  page
    .locator(".save-status > span")
    .filter({ hasText: /^Saved in this browser/ })
    .waitFor();
const conflicted = (page) =>
  page.getByText("Project changed in another tab", { exact: true }).waitFor();
const pageCount = (page) => page.getByTestId(/^page-node-/).count();
const addPage = (page) =>
  page.getByRole("button", { name: "+ Add page" }).click();

export async function testCrossTab(browser, url) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const errors = [];
  context.on("page", (page) =>
    page.on("pageerror", (error) => errors.push(error.message)),
  );
  try {
    const first = await context.newPage();
    await first.goto(url);
    await saved(first);
    const id = await first.evaluate(() =>
      localStorage.getItem("open-libra-last-document-id"),
    );
    const initial = await readProject(first, id);
    const count = JSON.parse(initial.json).pages.length;
    const second = await context.newPage();
    await second.goto(url);
    await saved(second);
    assert.equal(
      (await readProject(first, id)).revision,
      initial.revision,
      "Opening another tab must not create a new revision",
    );

    await addPage(first);
    await saved(first);
    await conflicted(second);
    await addPage(second);
    await addPage(second);
    // Reload is cancelable and must not discard the second tab's work implicitly.
    second.once("dialog", (dialog) => dialog.dismiss());
    await second
      .getByRole("button", { name: "Reload latest", exact: true })
      .click();
    assert.equal(await pageCount(second), count + 2);
    await second
      .getByRole("button", { name: "Save as a copy", exact: true })
      .click();
    await saved(second);
    const copyId = await second.evaluate(() =>
      localStorage.getItem("open-libra-last-document-id"),
    );
    assert.notEqual(copyId, id);
    assert.equal(
      JSON.parse((await readProject(first, id)).json).pages.length,
      count + 1,
    );
    assert.equal(
      JSON.parse((await readProject(second, copyId)).json).pages.length,
      count + 2,
    );
    await second.reload();
    await saved(second);
    assert.equal(await pageCount(second), count + 2);

    // Recovering an earlier snapshot creates a new project without modifying
    // the original still open in the other tab.
    const beforeRecovery = await readProject(first, id);
    await second.getByRole("button", { name: "Library", exact: true }).click();
    await second
      .getByTestId(`recent-project-${id}`)
      .getByRole("button", { name: /Recover/ })
      .click();
    await second
      .getByRole("dialog", { name: "Recovery history" })
      .getByRole("button", { name: "Open as recovered copy" })
      .click();
    await second
      .getByRole("dialog", { name: "Recovery history" })
      .waitFor({ state: "detached" });
    await second
      .locator("button.file-name")
      .filter({ hasText: "recovered.libra" })
      .waitFor();
    await saved(second);
    const recoveryId = await second.evaluate(() =>
      localStorage.getItem("open-libra-last-document-id"),
    );
    assert.notEqual(recoveryId, id);
    assert.equal(
      (await readProject(first, id)).revision,
      beforeRecovery.revision,
    );
    assert.equal((await readProject(first, id)).json, beforeRecovery.json);
    await saved(first);
    await second.reload();
    await saved(second);
    assert.equal(await pageCount(second), count + 1);

    // Reopen the original; reload latest explicitly adopts the accepted revision.
    await second.getByRole("button", { name: "Library", exact: true }).click();
    await second
      .getByTestId(`recent-project-${id}`)
      .locator(".project-card-open")
      .click();
    await saved(second);
    await addPage(first);
    await saved(first);
    await conflicted(second);
    second.once("dialog", (dialog) => dialog.accept());
    await second
      .getByRole("button", { name: "Reload latest", exact: true })
      .click();
    await saved(second);
    assert.equal(await pageCount(second), count + 2);
    await addPage(second);
    await saved(second);
    await conflicted(first);
    assert.equal(
      JSON.parse((await readProject(second, id)).json).pages.length,
      count + 3,
    );

    // A stale tab cannot recreate a deleted project; its work can still be forked.
    await second.getByRole("button", { name: "Library", exact: true }).click();
    second.once("dialog", (dialog) => dialog.accept());
    await second
      .getByTestId(`recent-project-${id}`)
      .getByRole("button", { name: /Delete .* permanently/ })
      .click();
    await second
      .locator("button.file-name")
      .filter({ hasText: "Untitled" })
      .waitFor();
    await saved(second);
    assert.equal(await readProject(first, id), undefined);
    await addPage(first);
    first.once("dialog", (dialog) => dialog.accept());
    await first
      .getByRole("button", { name: "Reload latest", exact: true })
      .click();
    await first
      .getByText(
        "This project was deleted. Save your work as a copy to keep it.",
        { exact: true },
      )
      .waitFor();
    await first
      .getByRole("button", { name: "Save as a copy", exact: true })
      .click();
    await saved(first);
    assert.equal(await readProject(first, id), undefined);
    const recoveredId = await first.evaluate(() =>
      localStorage.getItem("open-libra-last-document-id"),
    );
    assert.notEqual(recoveredId, id);
    assert.equal(
      JSON.parse((await readProject(first, recoveredId)).json).pages.length,
      count + 3,
    );
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }

  // No BroadcastChannel: actual simultaneous writes must still be safe.
  const isolated = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await isolated.addInitScript(() => {
    window.BroadcastChannel = undefined;
  });
  try {
    const a = await isolated.newPage();
    await a.goto(url);
    await saved(a);
    const id = await a.evaluate(() =>
      localStorage.getItem("open-libra-last-document-id"),
    );
    // Exercise legacy records with no revision: first accepted write migrates to 1.
    await a.evaluate(async (id) => {
      const request = indexedDB.open("open-libra-documents", 2);
      const db = await new Promise((resolve) => {
        request.onsuccess = () => resolve(request.result);
      });
      const tx = db.transaction("recent-documents", "readwrite");
      const store = tx.objectStore("recent-documents");
      const get = store.get(id);
      get.onsuccess = () => {
        const value = get.result;
        delete value.revision;
        store.put(value);
      };
      await new Promise((resolve) => {
        tx.oncomplete = resolve;
      });
      db.close();
    }, id);
    await a.reload();
    await saved(a);
    const b = await isolated.newPage();
    await b.goto(url);
    await saved(b);
    const before = await readProject(a, id);
    await Promise.all([addPage(a), addPage(b)]);
    await addPage(b);
    await Promise.any([conflicted(a), conflicted(b)]);
    const aLost = await a
      .getByRole("button", { name: "Save as a copy", exact: true })
      .count();
    const winner = aLost ? b : a;
    const loser = aLost ? a : b;
    await saved(winner);
    const accepted = await readProject(winner, id);
    assert.equal(accepted.revision, 1);
    assert.equal(
      JSON.parse(accepted.json).pages.length,
      await pageCount(winner),
    );
    assert.notEqual(accepted.json, before.json);
    const loserCount = await pageCount(loser);
    await loser
      .getByRole("button", { name: "Save as a copy", exact: true })
      .click();
    await saved(loser);
    const forkId = await loser.evaluate(() =>
      localStorage.getItem("open-libra-last-document-id"),
    );
    assert.equal(
      JSON.parse((await readProject(loser, forkId)).json).pages.length,
      loserCount,
    );
    assert.equal((await readProject(winner, id)).json, accepted.json);
  } finally {
    await isolated.close();
  }
  console.log(
    "Cross-tab tests passed (notifications, simultaneous CAS without notifications, legacy revisions, cancel/reload, copy/reload, deletion).",
  );
}

async function readProject(page, id) {
  return page.evaluate(async (id) => {
    const request = indexedDB.open("open-libra-documents", 2);
    const db = await new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    try {
      return await new Promise((resolve, reject) => {
        const get = db
          .transaction("recent-documents")
          .objectStore("recent-documents")
          .get(id);
        get.onsuccess = () => resolve(get.result);
        get.onerror = () => reject(get.error);
      });
    } finally {
      db.close();
    }
  }, id);
}
