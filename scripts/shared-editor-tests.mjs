import { testSharedBridge } from "./shared-bridge-tests.mjs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import { createCollaborationServer } from "./collaboration-server.mjs";
const require = createRequire(import.meta.url);
const {
  DocumentEngine,
} = require("../target/collaboration-wasm/open_libra_scene_wasm.js");
const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "libra-shared-editor-"),
);
const origin = "http://127.0.0.1:4179",
  url = `${origin}/openlibra/`;
let service = createCollaborationServer({
  DocumentEngine,
  dataDir: directory,
  origins: [origin],
});
await new Promise((resolve) => service.server.listen(0, "127.0.0.1", resolve));
const port = service.server.address().port,
  endpoint = `http://127.0.0.1:${port}`;
const preview = spawn(
  "npm",
  [
    "run",
    "preview",
    "--workspace",
    "@open-libra/web",
    "--",
    "--host",
    "127.0.0.1",
    "--port",
    "4179",
  ],
  { stdio: "ignore" },
);
let browser;
const errors = [];
async function until(fn, message) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(message);
}
async function request(route, body, token) {
  const response = await fetch(endpoint + route, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  assert.ok(response.ok, JSON.stringify(result));
  return result;
}
try {
  await until(async () => {
    try {
      return (await fetch(url)).ok;
    } catch {
      return false;
    }
  }, "preview unavailable");
  const fixture = DocumentEngine.new_blank();
  const firstPage = JSON.parse(fixture.document_json()).active_page_id;
  const frame = fixture.add_frame();
  fixture.rename_node(frame, "Shared frame");
  const text = fixture.add_text_to(frame);
  fixture.rename_node(text, "Shared text");
  const vector = fixture.add_vector_shape("star", frame);
  fixture.rename_node(vector, "Shared vector");
  fixture.convert_vector_to_path(vector);
  fixture.add_number_variable("Space", 16);
  fixture.add_document_color("Brand", "#4488cc");
  const image = fixture.add_media_asset_node(
    "image",
    "Embedded pixel",
    "image/png",
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNuoAAAAASUVORK5CYII=",
    1,
    1,
    frame,
  );
  const component = fixture.create_component(frame, "Card");
  const model = JSON.parse(fixture.read_model_json());
  fixture.create_component_instance(
    component,
    model.components[0].variants[0].id,
    "",
  );
  const secondPage = fixture.add_page("Artwork");
  fixture.add_vector_shape("ellipse", "");
  fixture.set_active_page(firstPage);
  const fixtureJson = fixture.document_json();
  fixture.free();
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--enable-unsafe-webgpu"],
  });
  const aContext = await browser.newContext(),
    bContext = await browser.newContext();
  const a = await aContext.newPage(),
    b = await bContext.newPage();
  for (const p of [a, b]) {
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("dialog", (d) => void d.accept());
  }
  await a.goto(url);
  await a
    .getByTestId(/^page-node-/)
    .first()
    .waitFor();
  await a.locator('input[type="file"][accept*=".libra"]').setInputFiles({
    name: "Mixed.libra",
    mimeType: "application/json",
    buffer: Buffer.from(fixtureJson),
  });
  await a.getByTestId(`layer-node-${frame}`).waitFor();
  await a.getByRole("button", { name: "Share document", exact: true }).click();
  await a.getByLabel("Collaboration server").fill(endpoint);
  await a.getByLabel("Your name", { exact: true }).fill("Alice");
  await a.getByRole("button", { name: "Publish shared copy" }).click();
  await a.waitForURL(/shared=1/);
  await a.getByTestId(`layer-node-${frame}`).waitFor();
  const sharedUrl = a.url(),
    room = new URL(sharedUrl).searchParams.get("room");
  const owner = await a.evaluate(
    ({ endpoint, room }) =>
      JSON.parse(
        sessionStorage.getItem(`open-libra-room-session:${endpoint}:${room}`),
      ),
    { endpoint, room },
  );
  const backup = () =>
    request(`/rooms/${room}/backup`, undefined, owner.token).then(
      (r) => r.document,
    );
  const revision = async () =>
    (await backup()).operation_history.entries.length;
  async function edit(page, action) {
    const before = await revision();
    await action();
    await until(
      async () => (await revision()) > before,
      "edit was not accepted",
    );
    await until(
      async () =>
        !(await page.getByLabel("Shared document status").innerText()).includes(
          "pending edit",
        ),
      "pending did not clear",
    );
  }
  await b.goto(sharedUrl);
  await b.getByLabel("Your name", { exact: true }).fill("Bob");
  await b.getByRole("button", { name: "Join shared document" }).click();
  await b.getByTestId(`layer-node-${frame}`).waitFor();
  assert.equal((await backup()).pages.length, 2);
  assert.equal((await backup()).media_assets.length, 1);
  assert.equal((await backup()).components.length, 1);
  assert.equal(await b.getByTestId(/^page-node-/).count(), 2);
  // Page navigation stays local and consumes no revision.
  await b.getByTestId(`page-node-${secondPage}`).locator(".page-main").click();
  assert.equal(await revision(), 0);
  await a.getByTestId(`layer-node-${frame}`).waitFor();
  await edit(a, () =>
    a.getByRole("button", { name: "Rectangle", exact: true }).click(),
  );
  assert.equal(
    await b.getByTestId(`page-node-${secondPage}`).getAttribute("data-active"),
    "true",
  );
  await edit(b, () =>
    b.getByRole("button", { name: "Text", exact: true }).click(),
  );
  await edit(b, async () => {
    await b.getByLabel("Edit text content", { exact: true }).fill("Bob's text");
    await b.getByLabel("Edit text content", { exact: true }).press("Tab");
  });
  // The author's new page stays active after acknowledgment; other users stay put.
  await edit(a, () => a.getByRole("button", { name: "+ Add page" }).click());
  await until(
    async () => (await b.getByTestId(/^page-node-/).count()) === 3,
    "new page missing",
  );
  assert.equal(
    await a
      .getByTestId(/^page-node-/)
      .last()
      .getAttribute("data-active"),
    "true",
  );
  assert.equal(
    await b.getByTestId(`page-node-${secondPage}`).getAttribute("data-active"),
    "true",
  );
  // Actor undo removes only Alice's new page, preserving Bob's text.
  await a.getByRole("button", { name: "Edit", exact: true }).click();
  await edit(a, () => a.getByRole("menuitem", { name: /^Undo/ }).click());
  await until(
    async () => (await b.getByTestId(/^page-node-/).count()) === 2,
    "undo missing",
  );
  assert.equal(
    (await backup()).pages
      .find((p) => p.id === secondPage)
      .nodes.filter((n) => n.kind === "text").length,
    1,
  );
  // Full model changes via the same protocol: assets, component propagation, layout, text, vector and variable edits.
  const baseline = JSON.stringify(await backup());
  const working = DocumentEngine.load_json(baseline);
  working.enable_operations(owner.actor_id);
  working.set_active_page(firstPage);
  working.begin_transaction();
  working.set_node_layout(frame, "column", "start", "start", 12, 8, 8, 8, 8);
  const style = JSON.parse(working.node_json(text)).text;
  style.content = "Shared typography";
  working.set_node_text(text, JSON.stringify(style));
  working.set_node_image_fit(image, "contain");
  working.set_vector_fill_rule(vector, "evenodd");
  working.update_number_variable(
    JSON.parse(working.read_model_json()).number_variables[0].id,
    "Space",
    24,
  );
  working.add_text_style("Body", JSON.stringify(style));
  working.end_transaction();
  const changes = JSON.parse(working.document_changes_json(baseline));
  const state = JSON.parse(
    DocumentEngine.load_json(baseline).operation_state_json(),
  );
  const sequence =
    (await backup()).operation_history.entries.filter(
      (e) => e.envelope.actor_id === owner.actor_id,
    ).length + 1;
  await request(
    `/rooms/${room}/operations`,
    {
      version: 1,
      document_id: state.document_id,
      operation_id: crypto.randomUUID(),
      transaction_id: crypto.randomUUID(),
      actor_id: owner.actor_id,
      base_revision: state.revision,
      sequence,
      command: { type: "document_changes", changes },
    },
    owner.token,
  );
  working.free();
  await b.getByTestId(`page-node-${firstPage}`).locator(".page-main").click();
  await b.getByTestId(`layer-node-${text}`).locator(".layer-main").click();
  await b.getByRole("button", { name: "Edit component", exact: true }).click();
  await b.getByTestId(`layer-node-${text}`).locator(".layer-main").click();
  await until(
    async () =>
      (await b.getByLabel("Text content", { exact: true }).inputValue()) ===
      "Shared typography",
    "text did not sync",
  );
  assert.equal(
    (await backup()).pages.flatMap((p) => p.nodes).find((n) => n.id === text)
      .text.content,
    "Shared typography",
  );
  const head = await backup();
  assert.equal(head.text_styles.length, 1);
  assert.equal(head.number_variables[0].value, 24);
  // Durable restart and same-tab session reload preserve the full mixed document.
  await service.close();
  service = createCollaborationServer({
    DocumentEngine,
    dataDir: directory,
    origins: [origin],
  });
  await new Promise((resolve) =>
    service.server.listen(port, "127.0.0.1", resolve),
  );
  await b.reload();
  await b.getByTestId(`layer-node-${frame}`).waitFor();
  await until(
    async () =>
      (await a.getByLabel("Shared document status").innerText()).includes(
        "connected",
      ),
    "owner did not reconnect",
  );
  const bob = await b.evaluate(
    ({ endpoint, room }) =>
      JSON.parse(
        sessionStorage.getItem(`open-libra-room-session:${endpoint}:${room}`),
      ),
    { endpoint, room },
  );
  await request(
    `/rooms/${room}/participants`,
    { actor_id: bob.actor_id, role: "viewer" },
    owner.token,
  );
  await until(
    async () =>
      (await b.getByLabel("Shared document status").innerText()).includes(
        "viewer",
      ),
    "viewer role missing",
  );
  const unchanged = await revision();
  assert.equal(
    await b
      .getByRole("button", { name: "Rectangle", exact: true })
      .isDisabled(),
    true,
  );
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(await revision(), unchanged);
  await b.getByRole("button", { name: "Make local copy" }).click();
  await b.waitForURL(url);
  await b.getByTestId(`layer-node-${frame}`).waitFor();
  const fork = await b.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const r = indexedDB.open("open-libra-documents");
      r.onsuccess = () => resolve(r.result);
    });
    const records = await new Promise((resolve) => {
      const r = db
        .transaction("recent-documents")
        .objectStore("recent-documents")
        .getAll();
      r.onsuccess = () => resolve(r.result);
    });
    db.close();
    return records;
  });
  const local = JSON.parse(
    fork.find((r) => r.name === "Shared document copy.libra").json,
  );
  assert.equal(local.media_assets[0].source, head.media_assets[0].source);
  assert.notEqual(
    local.operation_history?.document_id,
    head.operation_history.document_id,
  );
  await a.screenshot({ path: "/tmp/openlibra-shared-editor.png" });
  await testSharedBridge(browser, url, endpoint);
  assert.deepEqual(errors, []);
  console.log(
    "Shared editor tests passed: local publication, mixed content, independent pages, actor undo, resources/styles/components, durable restart, viewer enforcement and local fork.",
  );
} finally {
  await browser?.close();
  await service.close();
  preview.kill("SIGTERM");
  fs.rmSync(directory, { recursive: true, force: true });
}
