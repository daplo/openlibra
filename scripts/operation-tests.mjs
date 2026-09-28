import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export async function testOperations(browser, url) {
  const page = await browser.newPage();
  const moduleUrl = new URL("__operation_test.js", url).href;
  const wasmUrl = new URL("open_libra_scene_wasm_bg.wasm", moduleUrl).href;
  await page.route(moduleUrl, (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: readFileSync("apps/web/src/wasm/open_libra_scene_wasm.js"),
    }),
  );
  await page.route(wasmUrl, (route) =>
    route.fulfill({
      contentType: "application/wasm",
      body: readFileSync("apps/web/src/wasm/open_libra_scene_wasm_bg.wasm"),
    }),
  );
  await page.goto(url);
  const result = await page.evaluate(async (moduleUrl) => {
    const { default: init, DocumentEngine } = await import(moduleUrl);
    await init();
    const actorA = crypto.randomUUID(),
      actorB = crypto.randomUUID();
    const a = DocumentEngine.new_blank();
    const id = a.add_rectangle();
    a.enable_operations(actorA);
    const baseline = a.document_json();
    const b = DocumentEngine.load_json(baseline);
    b.enable_operations(actorB);
    const pageId = JSON.parse(baseline).active_page_id;
    const op = (engine, command) => {
      const s = JSON.parse(engine.operation_state_json());
      return {
        version: 1,
        document_id: s.document_id,
        operation_id: crypto.randomUUID(),
        actor_id: s.actor_id,
        sequence: s.next_sequence,
        base_revision: s.revision,
        transaction_id: crypto.randomUUID(),
        command,
      };
    };
    const apply = (engine, operation) =>
      JSON.parse(engine.apply_operation_json(JSON.stringify(operation)));
    const first = op(a, {
      type: "move_nodes",
      page_id: pageId,
      node_ids: [id],
      dx: 13,
      dy: 8,
    });
    apply(a, first);
    apply(b, first);
    const stale = op(a, {
      type: "set_properties",
      page_id: pageId,
      node_id: id,
      properties: { name: "Stale" },
    });
    const second = op(b, {
      type: "set_properties",
      page_id: pageId,
      node_id: id,
      properties: { opacity: 0.4 },
    });
    apply(b, second);
    apply(a, second);
    let staleRejected = false;
    try {
      apply(a, stale);
    } catch {
      staleRejected = true;
    }
    const duplicate = apply(b, first);
    const undo = op(a, { type: "undo", operation_id: first.operation_id });
    apply(a, undo);
    apply(b, undo);
    const converged = a.document_json() === b.document_json();
    const node = JSON.parse(a.node_json(id));
    const reload = DocumentEngine.load_json(a.document_json());
    reload.enable_operations(actorA);
    const redo = reload.redo();
    const malformed = JSON.parse(a.document_json());
    malformed.operation_history.entries[0].changes = [];
    let tamperRejected = false;
    try {
      DocumentEngine.load_json(JSON.stringify(malformed));
    } catch {
      tamperRejected = true;
    }
    const before = reload.document_json();
    reload.begin_transaction();
    reload.rename_node(id, "Drag");
    const during = reload.document_json() === before;
    reload.set_node_bounds(id, 10, 20, 30, 40);
    reload.end_transaction();
    const nativeReload = DocumentEngine.load_json(reload.document_json());
    nativeReload.enable_operations(actorA);
    const transactionUndo = nativeReload.undo();
    const names = [
      JSON.parse(reload.node_json(id)).name,
      JSON.parse(nativeReload.node_json(id)).name,
    ];
    const output = {
      staleRejected,
      duplicate: duplicate.status,
      converged,
      node,
      redo,
      tamperRejected,
      during,
      transactionUndo,
      names,
    };
    a.free();
    b.free();
    reload.free();
    nativeReload.free();
    return output;
  }, moduleUrl);
  assert.equal(result.staleRejected, true);
  assert.equal(result.duplicate, "duplicate");
  assert.equal(result.converged, true);
  assert.equal(result.node.x, 160);
  assert.ok(Math.abs(result.node.opacity - 0.4) < 0.001);
  assert.equal(result.redo, true);
  assert.equal(result.tamperRejected, true);
  assert.equal(result.during, true);
  assert.equal(result.transactionUndo, true);
  assert.deepEqual(result.names, ["Drag", "Rectangle"]);
  // Exercise actual editor autosave + tab actor restoration, not just the API.
  await page.locator('[data-testid^="page-node-"]').first().waitFor();
  const initialPages = await page
    .locator('[data-testid^="page-node-"]')
    .count();
  await page.getByRole("button", { name: "+ Add page" }).click();
  await page
    .locator(".save-status > span")
    .filter({ hasText: /^Saved in this browser/ })
    .waitFor();
  await page.reload();
  await page.waitForFunction(
    (count) =>
      document.querySelectorAll('[data-testid^="page-node-"]').length === count,
    initialPages + 1,
  );
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Undo/ }).click();
  await page.waitForFunction(
    (count) =>
      document.querySelectorAll('[data-testid^="page-node-"]').length === count,
    initialPages,
  );
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Redo/ }).click();
  await page.waitForFunction(
    (count) =>
      document.querySelectorAll('[data-testid^="page-node-"]').length === count,
    initialPages + 1,
  );
  await page.close();
  console.log(
    "Operation browser tests passed (two engines, ordered replay, retries, stale revisions, actor undo, persisted redo, transaction snapshots, tamper rejection).",
  );
}
