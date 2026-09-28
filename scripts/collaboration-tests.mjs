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
const url = "http://127.0.0.1:4178/openlibra/?collaboration=1";
const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "libra-browser-rooms-"),
);
let service = createCollaborationServer({
  dataDir: directory,
  DocumentEngine,
  origins: ["http://127.0.0.1:4178"],
});
await new Promise((resolve) => service.server.listen(0, "127.0.0.1", resolve));
const endpoint = `http://127.0.0.1:${service.server.address().port}`;
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
    "4178",
  ],
  { stdio: "ignore" },
);
let browser;
const post = (path, body, token, origin) =>
  fetch(endpoint + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(origin ? { Origin: origin } : {}),
    },
    body: JSON.stringify(body),
  });
try {
  // Real HTTP authorization and server-side validation, independent of browser UI.
  assert.equal(
    (await post("/rooms", {}, undefined, "https://untrusted.example")).status,
    403,
  );
  const room = await (await post("/rooms", {})).json();
  assert.equal(
    (await post(`/rooms/${room.room_id}/join`, { invite: "wrong" })).status,
    403,
  );
  const actor = await (
    await post(`/rooms/${room.room_id}/join`, { invite: room.invite })
  ).json();
  assert.equal(
    (await post(`/rooms/${room.room_id}/operations`, {})).status,
    401,
  );
  assert.equal(
    (
      await post(
        `/rooms/${room.room_id}/operations`,
        { actor_id: crypto.randomUUID() },
        actor.token,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await post(
        `/rooms/${room.room_id}/operations`,
        {
          actor_id: actor.actor_id,
          command: { type: "recorded_edit", changes: [] },
        },
        actor.token,
      )
    ).status,
    409,
  );
  const snapshotResponse = await fetch(
    `${endpoint}/rooms/${room.room_id}/events`,
    { headers: { Authorization: `Bearer ${actor.token}` } },
  );
  const reader = snapshotResponse.body.getReader();
  let snapshotText = "";
  while (!snapshotText.includes("\n\n")) {
    const chunk = await reader.read();
    snapshotText += new TextDecoder().decode(chunk.value);
  }
  await reader.cancel();
  const snapshot = JSON.parse(snapshotText.split("\n\n")[0].slice(6));
  const engine = DocumentEngine.load_json(snapshot.document);
  engine.enable_operations(actor.actor_id);
  const state = JSON.parse(engine.operation_state_json());
  const template = DocumentEngine.new_blank();
  const nodeId = template.add_rectangle();
  const node = JSON.parse(template.node_json(nodeId));
  template.free();
  const envelope = {
    version: 1,
    document_id: state.document_id,
    operation_id: crypto.randomUUID(),
    actor_id: actor.actor_id,
    sequence: 1,
    base_revision: 0,
    transaction_id: crypto.randomUUID(),
    command: {
      type: "create_node",
      page_id: JSON.parse(snapshot.document).active_page_id,
      node,
    },
  };
  const accepted = await post(
    `/rooms/${room.room_id}/operations`,
    envelope,
    actor.token,
  );
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).revision, 1);
  const retry = await post(
    `/rooms/${room.room_id}/operations`,
    envelope,
    actor.token,
  );
  assert.equal((await retry.json()).status, "duplicate");
  const invalid = {
    ...envelope,
    operation_id: crypto.randomUUID(),
    sequence: 2,
  };
  assert.equal(
    (await post(`/rooms/${room.room_id}/operations`, invalid, actor.token))
      .status,
    409,
  );
  engine.free();
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
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
  a.on("dialog", (dialog) => {
    if (dialog.type() === "beforeunload") void dialog.accept();
    else void dialog.accept();
  });
  const errors = [];
  a.on("pageerror", (error) => errors.push(error.message));
  b.on("pageerror", (error) => errors.push(error.message));
  await a.goto(url);
  await a.getByLabel("Prototype server").fill(endpoint);
  await a.getByLabel("Display name", { exact: true }).fill("Alice");
  await a.getByRole("button", { name: "Create room" }).click();
  await a
    .getByRole("status")
    .filter({ hasText: /^connected/ })
    .waitFor();
  await b.goto(a.url());
  await b.getByLabel("Display name", { exact: true }).fill("Bob");
  await b.getByRole("button", { name: "Join room" }).click();
  await b
    .getByRole("status")
    .filter({ hasText: /^connected/ })
    .waitFor();
  await a.getByRole("button", { name: "Add rectangle", exact: true }).click();
  await b.getByRole("button", { name: "Rectangle 1", exact: true }).waitFor();
  await a.getByText("All edits acknowledged", { exact: true }).waitFor();
  await a.getByRole("button", { name: "Rectangle 1", exact: true }).click();
  await a.getByRole("button", { name: "Move right 20", exact: true }).click();
  await b.waitForFunction(
    () => document.querySelector("svg rect")?.getAttribute("x") === "60",
  );
  await b.getByRole("button", { name: "Rectangle 1", exact: true }).click();
  await b.getByRole("button", { name: "Toggle opacity", exact: true }).click();
  await a.waitForFunction(
    () => document.querySelector("svg rect")?.getAttribute("opacity") === "0.5",
  );
  await a.getByRole("button", { name: "Undo my edit", exact: true }).click();
  await b.waitForFunction(
    () => document.querySelector("svg rect")?.getAttribute("x") === "40",
  );
  assert.equal(
    await b.locator("svg g[role=button] > rect").getAttribute("opacity"),
    "0.5",
  );
  // Offline intent survives while another actor changes the shared revision.
  await aContext.setOffline(true);
  await a.getByRole("button", { name: "Move right 20", exact: true }).click();
  await a
    .getByText("Pending edit retained in this browser", { exact: true })
    .waitFor();
  await b.getByRole("button", { name: "Toggle opacity", exact: true }).click();
  await b.getByText("All edits acknowledged", { exact: true }).waitFor();
  await aContext.setOffline(false);
  await a
    .getByRole("alert")
    .filter({ hasText: /Revision conflict/ })
    .waitFor();
  // Reload retains both server-issued actor and rejected local intent.
  await a.reload();
  await a.getByRole("button", { name: "Join room", exact: true }).click();
  await a
    .getByText("Pending edit retained in this browser", { exact: true })
    .waitFor();
  await a
    .getByRole("button", { name: "Retry against latest revision", exact: true })
    .click();
  await b.waitForFunction(
    () => document.querySelector("svg rect")?.getAttribute("x") === "60",
  );
  assert.equal(
    await b.locator("svg g[role=button] > rect").getAttribute("opacity"),
    "1",
  );
  await a.getByText("All edits acknowledged", { exact: true }).waitFor();
  // Participant identity and presence are independent of document revisions.
  await a.getByLabel("Your display name").fill("Alicia");
  await a.getByRole("button", { name: "Update name", exact: true }).click();
  await b.getByText("Alicia", { exact: true }).first().waitFor();
  await a.getByRole("button", { name: "Rectangle 1", exact: true }).click();
  await b.getByTestId("remote-selection").waitFor();
  const canvas = a.getByLabel("Shared rectangle canvas");
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  await a.mouse.move(bounds.x + 100, bounds.y + 100);
  await b.getByTestId("remote-cursor").waitFor();
  await a.getByLabel("Role for Bob").selectOption("viewer");
  await b.waitForFunction(
    () =>
      [...document.querySelectorAll("button")].find(
        (b) => b.textContent === "Add rectangle",
      )?.disabled,
  );
  await a.getByLabel("Role for Bob").selectOption("editor");
  await b.waitForFunction(
    () =>
      ![...document.querySelectorAll("button")].find(
        (b) => b.textContent === "Add rectangle",
      )?.disabled,
  );
  await a.getByText("Room invitations", { exact: true }).click();
  await a.getByLabel("Invitation role").selectOption("viewer");
  await a
    .getByRole("button", { name: "Create invitation", exact: true })
    .click();
  const viewerLink = a.getByLabel("viewer invitation link").last();
  await viewerLink.waitFor();
  const cContext = await browser.newContext();
  const c = await cContext.newPage();
  await c.goto(await viewerLink.inputValue());
  await c.getByLabel("Display name", { exact: true }).fill("Cora");
  await c.getByRole("button", { name: "Join room", exact: true }).click();
  await c
    .getByRole("status")
    .filter({ hasText: /connected.*viewer/ })
    .waitFor();
  assert.equal(
    await c
      .getByRole("button", { name: "Add rectangle", exact: true })
      .isDisabled(),
    true,
  );
  // Role state, document history and bearer credentials survive a cold service restart.
  const port = service.server.address().port;
  await service.close();
  service = createCollaborationServer({
    DocumentEngine,
    dataDir: directory,
    origins: ["http://127.0.0.1:4178"],
  });
  await new Promise((resolve) =>
    service.server.listen(port, "127.0.0.1", resolve),
  );
  await c
    .getByRole("status")
    .filter({ hasText: /connected.*viewer/ })
    .waitFor();
  await a
    .getByRole("status")
    .filter({ hasText: /connected.*owner/ })
    .waitFor();
  await a.getByRole("button", { name: "Revoke Bob", exact: true }).click();
  await b
    .getByRole("status")
    .filter({ hasText: /^revoked/ })
    .waitFor();
  await a.getByRole("button", { name: "Add rectangle", exact: true }).click();
  await c.getByRole("button", { name: "Rectangle 2", exact: true }).waitFor();
  assert.equal(
    await b.getByRole("button", { name: "Rectangle 2", exact: true }).count(),
    0,
  );
  const downloadPromise = a.waitForEvent("download");
  await a
    .getByRole("button", { name: "Download document", exact: true })
    .click();
  const backupDownload = await downloadPromise;
  assert.equal(backupDownload.suggestedFilename(), "Shared prototype.libra");
  const oldRoom = a.url();
  await a.getByRole("button", { name: "Leave room", exact: true }).click();
  await a
    .getByLabel("Restore backup as new room")
    .setInputFiles(await backupDownload.path());
  await a
    .getByRole("status")
    .filter({ hasText: /connected.*revision 0.*owner/ })
    .waitFor();
  await a.getByRole("button", { name: "Rectangle 2", exact: true }).waitFor();
  assert.notEqual(a.url(), oldRoom);
  await a.getByRole("button", { name: "Add rectangle", exact: true }).click();
  await a.getByText("All edits acknowledged", { exact: true }).waitFor();
  assert.equal(
    await c.getByRole("button", { name: "Rectangle 3", exact: true }).count(),
    0,
  );
  await a.screenshot({ path: "/tmp/openlibra-collaboration.png" });
  await a.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await a.screenshot({ path: "/tmp/openlibra-collaboration-mobile.png" });
  assert.deepEqual(errors, []);
  console.log(
    "Collaboration browser tests passed: three sessions, named presence/cursors/selections, live roles/revocation, durable restart, scoped undo, retained stale intent, backup restore and narrow viewport.",
  );
} finally {
  await browser?.close();
  preview.kill("SIGTERM");
  await service.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
