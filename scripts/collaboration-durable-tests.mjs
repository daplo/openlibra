import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { createCollaborationServer } from "./collaboration-server.mjs";
import { openRoomStorage } from "./collaboration-storage.mjs";
const require = createRequire(import.meta.url);
const {
  DocumentEngine,
} = require("../target/collaboration-wasm/open_libra_scene_wasm.js");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "libra-rooms-"));
let service,
  endpoint,
  clock = Date.now(),
  failSave = false;
const streams = [];
async function start() {
  const storage = openRoomStorage(directory);
  service = createCollaborationServer({
    DocumentEngine,
    now: () => clock,
    storage: {
      load: () => storage.load(),
      save: (...args) => {
        if (failSave) throw new Error("disk full");
        storage.save(...args);
      },
      close: () => storage.close(),
    },
  });
  await new Promise((resolve) =>
    service.server.listen(0, "127.0.0.1", resolve),
  );
  endpoint = `http://127.0.0.1:${service.server.address().port}`;
}
async function request(route, token, body) {
  const response = await fetch(endpoint + route, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, data: await response.json() };
}
async function events(id, token) {
  const response = await fetch(`${endpoint}/rooms/${id}/events`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 200);
  const reader = response.body.getReader();
  const received = [];
  let buffer = "";
  const decoder = new TextDecoder();
  const loop = (async () => {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end;
        while ((end = buffer.indexOf("\n\n")) >= 0) {
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (line.startsWith("data: "))
            received.push(JSON.parse(line.slice(6)));
        }
      }
    } catch {}
  })();
  const stream = {
    received,
    stop: async () => {
      await reader.cancel();
      await loop;
    },
  };
  streams.push(stream);
  return stream;
}
async function waitFor(fn) {
  for (let i = 0; i < 100; i++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.ok(fn(), "Expected stream event was not received");
}
try {
  await start();
  assert.throws(() => openRoomStorage(directory), /already owned/);
  const created = await request("/rooms", null, { name: "Owner" });
  assert.equal(created.status, 201);
  const room = created.data;
  const root = `/rooms/${room.room_id}`;
  const editor = (
    await request(`${root}/join`, null, { invite: room.invite, name: "Editor" })
  ).data;
  const invitations = await request(`${root}/invitations`, room.token, {
    role: "viewer",
    ttl_seconds: 60,
  });
  assert.equal(invitations.status, 200);
  const viewerInvite = invitations.data.invitations.at(-1);
  const viewer = (
    await request(`${root}/join`, null, {
      invite: viewerInvite.secret,
      name: "Viewer",
    })
  ).data;
  assert.equal(
    (await request(`${root}/invitations`, viewer.token)).status,
    403,
  );
  assert.equal(
    (
      await request(`${root}/participants`, editor.token, {
        actor_id: viewer.actor_id,
        role: "editor",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`${root}/operations`, viewer.token, {
        actor_id: viewer.actor_id,
      })
    ).status,
    403,
  );
  assert.equal(
    (await request(`${root}/profile`, editor.token, { name: "Updated editor" }))
      .status,
    200,
  );
  const ownerStream = await events(room.room_id, room.token),
    editorStream = await events(room.room_id, editor.token);
  await waitFor(() => editorStream.received.some((e) => e.type === "snapshot"));
  const snapshot = editorStream.received.find((e) => e.type === "snapshot");
  assert.equal(snapshot.durable, true);
  const engine = DocumentEngine.load_json(snapshot.document);
  engine.enable_operations(editor.actor_id);
  const state = JSON.parse(engine.operation_state_json()),
    page = JSON.parse(snapshot.document).active_page_id;
  const temporary = DocumentEngine.new_blank(),
    id = temporary.add_rectangle(),
    node = JSON.parse(temporary.node_json(id));
  temporary.free();
  engine.free();
  const operation = {
    version: 1,
    document_id: state.document_id,
    operation_id: crypto.randomUUID(),
    actor_id: editor.actor_id,
    sequence: 1,
    base_revision: 0,
    transaction_id: crypto.randomUUID(),
    command: { type: "create_node", page_id: page, node },
  };
  failSave = true;
  assert.equal(
    (await request(`${root}/operations`, editor.token, operation)).status,
    503,
  );
  assert.equal(
    (await request(`${root}/backup`, room.token)).data.document
      .operation_history.entries.length,
    0,
  );
  assert.equal(
    (
      await request(`${root}/participants`, room.token, {
        actor_id: editor.actor_id,
        role: "viewer",
      })
    ).status,
    503,
  );
  assert.equal(
    (await request(`${root}/participants`, room.token)).data.participants.find(
      (p) => p.actor_id === editor.actor_id,
    ).role,
    "editor",
  );
  failSave = false;
  assert.equal(
    (await request(`${root}/operations`, editor.token, operation)).status,
    200,
  );
  clock += 100;
  assert.equal(
    (
      await request(`${root}/presence`, editor.token, {
        cursor: { x: 22, y: 35 },
        selection: [id],
      })
    ).status,
    200,
  );
  await waitFor(() =>
    ownerStream.received.some(
      (e) =>
        e.type === "presence" &&
        e.presence.some(
          (p) => p.actor_id === editor.actor_id && p.selection[0] === id,
        ),
    ),
  );
  assert.equal(
    (
      await request(`${root}/presence`, editor.token, {
        cursor: { x: 24, y: 35 },
        selection: [id],
      })
    ).status,
    429,
  );
  clock += 100;
  assert.equal(
    (
      await request(`${root}/presence`, editor.token, {
        cursor: { x: "bad", y: 35 },
        selection: [],
      })
    ).status,
    400,
  );
  const deletion = {
    ...operation,
    operation_id: crypto.randomUUID(),
    sequence: 2,
    base_revision: 1,
    command: { type: "delete_node", page_id: page, node_id: id },
  };
  assert.equal(
    (await request(`${root}/operations`, editor.token, deletion)).status,
    200,
  );
  await waitFor(() =>
    ownerStream.received.some(
      (e) =>
        e.type === "presence" &&
        e.presence.some(
          (p) => p.actor_id === editor.actor_id && p.selection.length === 0,
        ),
    ),
  );
  const undo = {
    ...operation,
    operation_id: crypto.randomUUID(),
    sequence: 3,
    base_revision: 2,
    command: { type: "undo", operation_id: deletion.operation_id },
  };
  assert.equal(
    (await request(`${root}/operations`, editor.token, undo)).status,
    200,
  );
  clock += 30001;
  service.sweep();
  await waitFor(() =>
    ownerStream.received.some(
      (e) => e.type === "presence" && e.presence.length === 0,
    ),
  );
  assert.equal(
    (
      await request(`${root}/participants`, room.token, {
        actor_id: editor.actor_id,
        role: "viewer",
      })
    ).status,
    200,
  );
  await waitFor(() =>
    editorStream.received.some(
      (e) => e.type === "access" && e.role === "viewer",
    ),
  );
  assert.equal(
    (await request(`${root}/operations`, editor.token, operation)).status,
    403,
  );
  assert.equal(
    (
      await request(`${root}/participants`, room.token, {
        actor_id: editor.actor_id,
        role: "editor",
      })
    ).status,
    200,
  );
  assert.equal(
    (await request(`${root}/operations`, editor.token, operation)).data.status,
    "duplicate",
  );
  assert.equal(
    (
      await request(`${root}/participants`, room.token, {
        actor_id: room.actor_id,
        role: "viewer",
      })
    ).status,
    403,
  );
  const beforeBackup = (await request(`${root}/backup`, viewer.token)).data;
  assert.equal(beforeBackup.document.pages[0].nodes.length, 1);
  assert.equal(JSON.stringify(beforeBackup).includes(room.token), false);
  const tampered = structuredClone(beforeBackup.document);
  tampered.pages[0].nodes[0].name = "Tampered";
  assert.equal(
    (await request("/rooms", null, { document: JSON.stringify(tampered) }))
      .status,
    400,
  );
  const restored = (
    await request("/rooms", null, {
      name: "Restored owner",
      document: JSON.stringify(beforeBackup.document),
    })
  ).data;
  const restoredBackup = (
    await request(`/rooms/${restored.room_id}/backup`, restored.token)
  ).data;
  assert.notEqual(
    restoredBackup.document.operation_history.document_id,
    state.document_id,
  );
  assert.equal(restoredBackup.document.operation_history.entries.length, 0);
  assert.equal(restoredBackup.document.pages[0].nodes[0].id, id);
  assert.equal(
    (await request(`/rooms/${restored.room_id}/backup`, room.token)).status,
    401,
  );
  clock += 60000;
  assert.equal(
    (await request(`${root}/join`, null, { invite: viewerInvite.secret }))
      .status,
    403,
  );
  assert.equal(
    (
      await request(`${root}/invitations`, room.token, {
        revoke: invitations.data.invitations[0].id,
      })
    ).status,
    200,
  );
  assert.equal(
    (await request(`${root}/join`, null, { invite: room.invite })).status,
    403,
  );
  assert.equal(
    (
      await request(`${root}/participants`, room.token, {
        actor_id: editor.actor_id,
        revoke: true,
      })
    ).status,
    200,
  );
  await waitFor(() =>
    editorStream.received.some((e) => e.type === "access" && e.revoked),
  );
  assert.equal((await request(`${root}/backup`, editor.token)).status, 401);
  assert.equal(
    (await request(`${root}/operations`, editor.token, operation)).status,
    401,
  );
  await Promise.all(streams.map((s) => s.stop()));
  streams.length = 0;
  await service.close();
  service = undefined;
  fs.writeFileSync(path.join(directory, "interrupted.tmp"), "{unfinished");
  await start();
  assert.deepEqual(
    (await request(`${root}/backup`, room.token)).data,
    beforeBackup,
  );
  assert.equal((await request(`${root}/backup`, editor.token)).status, 401);
  assert.equal(
    (await request(`${root}/join`, null, { invite: room.invite })).status,
    403,
  );
  const participants = (await request(`${root}/participants`, room.token)).data
    .participants;
  assert.ok(participants.every((p) => p.online === false));
  await service.close();
  service = undefined;
  const filename = path.join(directory, `${room.room_id}.json`),
    original = fs.readFileSync(filename, "utf8");
  fs.writeFileSync(filename, "broken");
  assert.throws(
    () => createCollaborationServer({ DocumentEngine, dataDir: directory }),
    /recovery failed/,
  );
  assert.equal(fs.readFileSync(filename, "utf8"), "broken");
  const damaged = JSON.parse(original);
  const damagedHead = JSON.parse(damaged.document);
  damagedHead.pages[0].nodes[0].name = "Tampered";
  damaged.document = JSON.stringify(damagedHead);
  fs.writeFileSync(filename, JSON.stringify(damaged));
  assert.throws(
    () => createCollaborationServer({ DocumentEngine, dataDir: directory }),
    /recovery failed/,
  );
  assert.equal(fs.readFileSync(filename, "utf8"), JSON.stringify(damaged));
  fs.writeFileSync(filename, original);
  await start();
  console.log(
    "Durable collaboration tests passed: atomic write failure, restart/replay, storage lock/corruption, roles, invitations/expiry, live downgrade/revocation, names, cursors/selections, throttling/expiry, isolated backup restore.",
  );
} finally {
  await Promise.all(streams.map((s) => s.stop()));
  if (service) await service.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
