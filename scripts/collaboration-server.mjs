import http from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { openRoomStorage } from "./collaboration-storage.mjs";

const uuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const roles = ["owner", "editor", "viewer"];
const nameOf = (value) =>
  typeof value === "string" &&
  value.trim().length >= 1 &&
  value.trim().length <= 60
    ? value.trim()
    : null;
const equal = (a, b) =>
  typeof a === "string" &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function createCollaborationServer({
  DocumentEngine,
  origins = ["http://localhost:5173", "http://127.0.0.1:5173"],
  maxRooms = 32,
  dataDir,
  storage = dataDir ? openRoomStorage(dataDir) : undefined,
  now = Date.now,
  presenceTtl = 30000,
} = {}) {
  const rooms = new Map(),
    clients = new Set();
  const encode = (room) => ({
    version: 1,
    id: room.id,
    document: room.engine.document_json(),
    sessions: [...room.sessions],
    invitations: room.invitations,
  });
  const persist = (room) => {
    try {
      storage?.save(room.id, encode(room));
    } catch {
      throw Object.assign(
        new Error("Room could not be saved; no changes were accepted"),
        { status: 503 },
      );
    }
  };
  try {
    for (const saved of storage?.load() ?? []) {
      if (
        saved.version !== 1 ||
        !uuid(saved.id) ||
        rooms.has(saved.id) ||
        !Array.isArray(saved.sessions) ||
        !Array.isArray(saved.invitations)
      )
        throw new Error("Invalid saved room metadata");
      const sessions = new Map(saved.sessions);
      const actorIds = new Set();
      if (sessions.size !== saved.sessions.length || sessions.size > 64)
        throw new Error("Invalid saved sessions");
      for (const [token, identity] of sessions) {
        if (
          !uuid(token) ||
          !uuid(identity.actor_id) ||
          actorIds.has(identity.actor_id) ||
          !roles.includes(identity.role) ||
          !nameOf(identity.name) ||
          typeof identity.revoked !== "boolean"
        )
          throw new Error("Invalid saved participant");
        actorIds.add(identity.actor_id);
      }
      if (
        [...sessions.values()].filter((s) => s.role === "owner" && !s.revoked)
          .length !== 1
      )
        throw new Error("Room needs exactly one active owner");
      const inviteIds = new Set();
      for (const invitation of saved.invitations) {
        if (
          !uuid(invitation.id) ||
          inviteIds.has(invitation.id) ||
          !uuid(invitation.secret) ||
          !["editor", "viewer"].includes(invitation.role) ||
          !Number.isSafeInteger(invitation.expires_at) ||
          typeof invitation.revoked !== "boolean"
        )
          throw new Error("Invalid saved invitation");
        inviteIds.add(invitation.id);
      }
      const engine = DocumentEngine.load_json(saved.document);
      if (!JSON.parse(engine.operation_state_json())) {
        engine.free();
        throw new Error("Saved room has no operation journal");
      }
      rooms.set(saved.id, {
        id: saved.id,
        engine,
        sessions,
        invitations: saved.invitations,
        streams: new Map(),
        presence: new Map(),
      });
    }
    if (rooms.size > maxRooms)
      throw new Error("Stored room count exceeds configured limit");
  } catch (error) {
    for (const room of rooms.values()) room.engine.free();
    storage?.close();
    throw new Error(
      `Room recovery failed: ${String(error)}. Stored files were preserved.`,
    );
  }
  const json = (response, status, data) => {
    response.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify(data));
  };
  const send = (response, event) => {
    if (response.destroyed || response.writableEnded) return;
    if (response.writableLength > 2 * 1024 * 1024) {
      response.destroy();
      return;
    }
    response.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  const broadcast = (room, event) => {
    for (const stream of room.streams.keys()) send(stream, event);
  };
  const participants = (room) =>
    [...room.sessions.values()]
      .filter((s) => !s.revoked)
      .map((s) => ({
        actor_id: s.actor_id,
        name: s.name,
        role: s.role,
        online: room.presence.has(s.actor_id),
        color: `hsl(${parseInt(s.actor_id.slice(0, 8), 16) % 360} 65% 45%)`,
      }));
  const roster = (room) =>
    broadcast(room, { type: "participants", participants: participants(room) });
  const presence = (room) =>
    broadcast(room, {
      type: "presence",
      presence: [...room.presence].map(([actor_id, p]) => ({
        actor_id,
        page_id: p.page_id,
        cursor: p.cursor,
        selection: p.selection,
      })),
    });
  const removePresence = (room, actor) => {
    if (room.presence.delete(actor)) {
      presence(room);
      roster(room);
    }
  };
  const sweep = () => {
    for (const room of rooms.values())
      for (const [actor, p] of room.presence)
        if (now() - p.updated_at > presenceTtl) removePresence(room, actor);
  };
  const expiryTimer = setInterval(sweep, Math.min(presenceTtl, 5000));
  expiryTimer.unref();
  const newInvite = (role = "editor", ttl = 86400) => ({
    id: randomUUID(),
    secret: randomUUID(),
    role,
    expires_at: now() + ttl * 1000,
    revoked: false,
  });
  const server = http.createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (origin && !origins.includes(origin))
      return json(response, 403, { error: "Origin is not allowed" });
    if (origin) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Vary", "Origin");
    }
    response.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type",
    );
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }
    try {
      let body = {};
      if (request.method === "POST") {
        const chunks = [];
        let bytes = 0;
        for await (const chunk of request) {
          bytes += chunk.length;
          if (bytes > 32 * 1024 * 1024) {
            json(response, 413, { error: "Request exceeds 32 MiB" });
            return;
          }
          chunks.push(chunk);
        }
        body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        if (!body || typeof body !== "object" || Array.isArray(body))
          return json(response, 400, { error: "Request must be an object" });
      }
      const url = new URL(request.url, "http://localhost");
      if (request.method === "POST" && url.pathname === "/rooms") {
        if (rooms.size >= maxRooms)
          return json(response, 503, { error: "Room limit reached" });
        const ownerName = nameOf(body.name ?? "Owner");
        if (!ownerName)
          return json(response, 400, {
            error: "Name must contain 1 to 60 characters",
          });
        let engine;
        if (body.document !== undefined) {
          if (typeof body.document !== "string")
            return json(response, 400, {
              error: "Backup document must be JSON text",
            });
          const source = DocumentEngine.load_json(body.document);
          const document = JSON.parse(source.document_json());
          source.free();
          // Validate the source journal before starting a separate lineage.
          delete document.operation_history;
          engine = DocumentEngine.load_json(JSON.stringify(document));
        } else engine = DocumentEngine.new_blank();
        engine.enable_operations(randomUUID());
        const id = randomUUID(),
          token = randomUUID(),
          actor_id = randomUUID();
        const invitation = newInvite();
        const room = {
          id,
          engine,
          sessions: new Map([
            [
              token,
              { actor_id, name: ownerName, role: "owner", revoked: false },
            ],
          ]),
          invitations: [invitation],
          streams: new Map(),
          presence: new Map(),
        };
        try {
          persist(room);
        } catch (error) {
          engine.free();
          throw error;
        }
        rooms.set(id, room);
        return json(response, 201, {
          room_id: id,
          invite: invitation.secret,
          token,
          actor_id,
          role: "owner",
        });
      }
      const match =
        /^\/rooms\/([\w-]+)\/(join|events|operations|invitations|participants|profile|presence|backup)$/.exec(
          url.pathname,
        );
      const room = match && rooms.get(match[1]);
      if (!room) return json(response, 404, { error: "Room is unavailable" });
      const action = match[2];
      if (request.method === "POST" && action === "join") {
        const invitation = room.invitations.find(
          (i) =>
            equal(body.invite, i.secret) && !i.revoked && i.expires_at > now(),
        );
        if (!invitation)
          return json(response, 403, {
            error: "Invitation is invalid, expired or revoked",
          });
        const name = nameOf(body.name ?? "Guest");
        if (!name)
          return json(response, 400, {
            error: "Name must contain 1 to 60 characters",
          });
        if (room.sessions.size >= 64)
          return json(response, 503, { error: "Room session limit reached" });
        const token = randomUUID(),
          identity = {
            actor_id: randomUUID(),
            name,
            role: invitation.role,
            revoked: false,
          };
        const sessions = new Map(room.sessions);
        sessions.set(token, identity);
        persist({ ...room, sessions });
        room.sessions = sessions;
        roster(room);
        return json(response, 201, {
          token,
          actor_id: identity.actor_id,
          role: identity.role,
        });
      }
      const token = request.headers.authorization?.replace(/^Bearer /, "");
      const actor = room.sessions.get(token);
      if (!actor || actor.revoked)
        return json(response, 401, {
          error: "Session is unavailable or access was revoked",
        });
      if (request.method === "GET" && action === "events") {
        if (room.streams.size >= 64)
          return json(response, 503, { error: "Connection limit reached" });
        response.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store",
          Connection: "keep-alive",
        });
        send(response, {
          type: "snapshot",
          document: room.engine.document_json(),
          role: actor.role,
          durable: !!storage,
        });
        room.streams.set(response, actor.actor_id);
        clients.add(response);
        room.presence.set(actor.actor_id, {
          cursor: null,
          selection: [],
          updated_at: now(),
        });
        roster(room);
        presence(room);
        const heartbeat = setInterval(
          () => response.write(": heartbeat\n\n"),
          15000,
        );
        response.on("close", () => {
          clearInterval(heartbeat);
          room.streams.delete(response);
          clients.delete(response);
          if (![...room.streams.values()].includes(actor.actor_id))
            removePresence(room, actor.actor_id);
        });
        return;
      }
      if (request.method === "GET" && action === "participants")
        return json(response, 200, { participants: participants(room) });
      if (request.method === "GET" && action === "backup")
        return json(response, 200, {
          format: "open-libra-project",
          format_version: 1,
          document: JSON.parse(room.engine.document_json()),
        });
      if (request.method === "GET" && action === "invitations") {
        if (actor.role !== "owner")
          return json(response, 403, {
            error: "Only the owner manages invitations",
          });
        return json(response, 200, { invitations: room.invitations });
      }
      if (request.method === "POST" && action === "invitations") {
        if (actor.role !== "owner")
          return json(response, 403, {
            error: "Only the owner manages invitations",
          });
        let invitations;
        if (body.revoke) {
          if (!room.invitations.some((i) => i.id === body.revoke))
            return json(response, 404, { error: "Invitation does not exist" });
          invitations = room.invitations.map((i) =>
            i.id === body.revoke ? { ...i, revoked: true } : i,
          );
        } else {
          if (
            !["editor", "viewer"].includes(body.role) ||
            !Number.isInteger(body.ttl_seconds) ||
            body.ttl_seconds < 60 ||
            body.ttl_seconds > 604800
          )
            return json(response, 400, {
              error:
                "Choose editor/viewer and an expiry between 1 minute and 7 days",
            });
          if (room.invitations.length >= 100)
            return json(response, 409, { error: "Invitation limit reached" });
          invitations = [
            ...room.invitations,
            newInvite(body.role, body.ttl_seconds),
          ];
        }
        persist({ ...room, invitations });
        room.invitations = invitations;
        return json(response, 200, { invitations });
      }
      if (request.method === "POST" && action === "participants") {
        if (actor.role !== "owner")
          return json(response, 403, {
            error: "Only the owner manages access",
          });
        const found = [...room.sessions].find(
          ([, s]) => s.actor_id === body.actor_id,
        );
        if (!found)
          return json(response, 404, { error: "Participant does not exist" });
        const [targetToken, target] = found;
        if (target.role === "owner")
          return json(response, 403, {
            error: "Owner access cannot be changed",
          });
        if (body.revoke !== true && !["editor", "viewer"].includes(body.role))
          return json(response, 400, { error: "Choose editor or viewer" });
        const next = {
          ...target,
          ...(body.revoke === true ? { revoked: true } : { role: body.role }),
        };
        const sessions = new Map(room.sessions);
        sessions.set(targetToken, next);
        persist({ ...room, sessions });
        room.sessions = sessions;
        for (const [stream, id] of room.streams)
          if (id === target.actor_id) {
            send(stream, {
              type: "access",
              role: next.role,
              revoked: next.revoked,
            });
            if (next.revoked) {
              room.streams.delete(stream);
              clients.delete(stream);
              stream.end();
            }
          }
        if (next.revoked) removePresence(room, target.actor_id);
        roster(room);
        return json(response, 200, { participants: participants(room) });
      }
      if (request.method === "POST" && action === "profile") {
        const name = nameOf(body.name);
        if (!name)
          return json(response, 400, {
            error: "Name must contain 1 to 60 characters",
          });
        const sessions = new Map(room.sessions);
        sessions.set(token, { ...actor, name });
        persist({ ...room, sessions });
        room.sessions = sessions;
        roster(room);
        return json(response, 200, { name });
      }
      if (request.method === "POST" && action === "presence") {
        const cursor = body.cursor ?? null,
          selection = body.selection ?? [];
        const document = JSON.parse(room.engine.document_json());
        const pageId = body.page_id ?? document.active_page_id;
        const page = document.pages.find((p) => p.id === pageId);
        if (!page)
          return json(response, 400, { error: "Presence page does not exist" });
        const ids = new Set(
          JSON.parse(room.engine.document_json()).pages.flatMap((p) =>
            p.nodes.map((n) => n.id),
          ),
        );
        if (
          (cursor !== null &&
            (!Number.isFinite(cursor.x) ||
              !Number.isFinite(cursor.y) ||
              Math.abs(cursor.x) > 1e6 ||
              Math.abs(cursor.y) > 1e6)) ||
          !Array.isArray(selection) ||
          selection.length > 100 ||
          selection.some((id) => !ids.has(id))
        )
          return json(response, 400, { error: "Invalid cursor or selection" });
        const previous = room.presence.get(actor.actor_id);
        if (previous && now() - previous.updated_at < 50)
          return json(response, 429, {
            error: "Presence is limited to 20 updates per second",
          });
        if (![...room.streams.values()].includes(actor.actor_id))
          return json(response, 409, {
            error: "Connect before publishing presence",
          });
        room.presence.set(actor.actor_id, {
          page_id: pageId,
          cursor: cursor === null ? null : { x: cursor.x, y: cursor.y },
          selection: [...new Set(selection)],
          updated_at: now(),
        });
        presence(room);
        if (!previous) roster(room);
        return json(response, 200, { ok: true });
      }
      if (request.method === "POST" && action === "operations") {
        if (actor.role === "viewer")
          return json(response, 403, {
            error: "Viewers cannot edit the document",
          });
        if (body.actor_id !== actor.actor_id)
          return json(response, 403, {
            error: "Operation actor does not match this session",
          });
        const journal = JSON.parse(
          room.engine.document_json(),
        ).operation_history;
        if (
          journal.entries.length >= 2000 &&
          !journal.entries.some(
            (e) => e.envelope.operation_id === body.operation_id,
          )
        )
          return json(response, 409, {
            error: "History limit reached; download a copy",
          });
        const candidate = DocumentEngine.load_json(room.engine.document_json());
        let receipt;
        try {
          receipt = JSON.parse(
            candidate.apply_operation_json(JSON.stringify(body)),
          );
        } catch (error) {
          candidate.free();
          return json(response, 409, { error: String(error) });
        }
        if (receipt.status === "duplicate") {
          candidate.free();
          return json(response, 200, receipt);
        }
        try {
          persist({ ...room, engine: candidate });
        } catch (error) {
          candidate.free();
          throw error;
        }
        const old = room.engine;
        room.engine = candidate;
        old.free();
        broadcast(room, { type: "operation", envelope: body });
        const ids = new Set(
          JSON.parse(room.engine.document_json()).pages.flatMap((p) =>
            p.nodes.map((node) => node.id),
          ),
        );
        let selectionChanged = false;
        for (const value of room.presence.values()) {
          const filtered = value.selection.filter((id) => ids.has(id));
          if (filtered.length !== value.selection.length) {
            value.selection = filtered;
            selectionChanged = true;
          }
        }
        if (selectionChanged) presence(room);
        return json(response, 200, receipt);
      }
      json(response, 405, { error: "Method is not allowed" });
    } catch (error) {
      if (!response.headersSent)
        json(response, error.status ?? 400, {
          error: String(error.message ?? error),
        });
      else response.destroy();
    }
  });
  server.on("close", () => {
    clearInterval(expiryTimer);
    for (const room of rooms.values()) room.engine.free();
    rooms.clear();
    storage?.close();
  });
  return {
    server,
    sweep,
    close: () => {
      for (const client of clients) client.end();
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const require = createRequire(import.meta.url);
  const {
    DocumentEngine,
  } = require("../target/collaboration-wasm/open_libra_scene_wasm.js");
  const port = Number(process.env.COLLAB_PORT || 8787);
  const service = createCollaborationServer({
    DocumentEngine,
    origins: (
      process.env.COLLAB_ORIGINS ||
      "http://localhost:5173,http://127.0.0.1:5173"
    ).split(","),
    dataDir: process.env.COLLAB_DATA_DIR || ".openlibra-collaboration",
  });
  service.server.listen(port, "127.0.0.1", () =>
    console.log(
      `Collaboration prototype: http://127.0.0.1:${port} (durable local rooms)`,
    ),
  );
  process.on("SIGINT", () => void service.close());
  process.on("SIGTERM", () => void service.close());
}
