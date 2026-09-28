import { useEffect, useRef, useState } from "react";
import init, { DocumentEngine } from "../wasm/open_libra_scene_wasm";
import { CollaborationClient, type RoomSession } from "../editor/collaboration";
import type { DocumentReadModel, NodeSummary } from "../editor/types";
import type { OperationCommand } from "../editor/operations";
import { CollaborationAccess } from "./CollaborationAccess";
import { parseProject, serializeProject } from "../editor/project-format";

function download(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function CollaborationPrototype() {
  const [server, setServer] = useState(
    new URLSearchParams(location.search).get("server") ??
      "http://127.0.0.1:8787",
  );
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const [session, setSession] = useState<RoomSession>();
  const [, refresh] = useState(0);
  const [selection, setSelection] = useState<string>();
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("Designer");
  const clientRef = useRef<CollaborationClient | undefined>(undefined);
  const room = new URLSearchParams(location.search).get("room");
  const invite = new URLSearchParams(location.hash.slice(1)).get("invite");
  useEffect(() => {
    let live = true;
    void init()
      .then(() => {
        if (live) setReady(true);
      })
      .catch((e) => setError(String(e)));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    const client = new CollaborationClient(session, () =>
      refresh((n) => n + 1),
    );
    clientRef.current = client;
    void client.connect();
    return () => {
      client.close();
      clientRef.current = undefined;
    };
  }, [session]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (clientRef.current?.pending) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);
  const client = clientRef.current;
  const state = client?.state();
  const model = client?.engine
    ? (JSON.parse(client.engine.read_model_json()) as DocumentReadModel)
    : undefined;
  const nodes = model?.nodes ?? [];
  const selected = nodes.find((n) => n.id === selection);
  const blocked =
    !model ||
    !!client?.pending ||
    client?.role === "viewer" ||
    client?.status === "revoked";
  async function request(path: string, body: unknown) {
    const response = await fetch(`${server.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result;
  }
  async function join(create: boolean, document?: string) {
    setError(undefined);
    try {
      let id = room,
        secret = invite;
      let createdIdentity;
      if (create) {
        const result = await request("/rooms", { name: displayName, document });
        createdIdentity = result;
        id = result.room_id;
        secret = result.invite;
        const url = new URL(location.href);
        url.searchParams.set("room", id!);
        url.searchParams.set("server", server);
        url.hash = new URLSearchParams({ invite: secret! }).toString();
        history.replaceState(null, "", url);
      }
      if (!id || !secret)
        throw new Error("Open an invitation link or create a room");
      const key = `open-libra-room-session:${server}:${id}`;
      const saved = sessionStorage.getItem(key);
      const identity =
        createdIdentity ??
        (saved
          ? JSON.parse(saved)
          : await request(`/rooms/${id}/join`, {
              invite: secret,
              name: displayName,
            }));
      sessionStorage.setItem(key, JSON.stringify(identity));
      setSession({
        server: server.replace(/\/$/, ""),
        room: id,
        token: identity.token,
        actor: identity.actor_id,
      });
    } catch (e) {
      setError(String(e));
    }
  }
  function submit(command: OperationCommand) {
    try {
      client?.submit(command);
      setError(undefined);
    } catch (e) {
      setError(String(e));
    }
  }
  function addRectangle() {
    if (!model) return;
    const temporary = DocumentEngine.new_blank();
    const id = temporary.add_rectangle();
    const node = JSON.parse(temporary.node_json(id)) as NodeSummary;
    temporary.free();
    node.x = 40 + nodes.length * 24;
    node.y = 40 + nodes.length * 24;
    node.name = `Rectangle ${nodes.length + 1}`;
    submit({ type: "create_node", page_id: model.active_page_id, node });
    setSelection(id);
    setName(node.name);
  }
  function change(properties: { name?: string; opacity?: number }) {
    if (selected && model)
      submit({
        type: "set_properties",
        page_id: model.active_page_id,
        node_id: selected.id,
        properties,
      });
  }
  return (
    <main className="collaboration-prototype">
      <header>
        <a href={import.meta.env.BASE_URL}>← Local editor</a>
        <h1>Collaboration prototype</h1>
        <p>
          Shared rectangle editing with room roles, live presence and
          recoverable local-server storage.
        </p>
      </header>
      {!session ? (
        <section className="collab-controls">
          <label>
            Prototype server{" "}
            <input
              aria-label="Prototype server"
              value={server}
              onChange={(e) => setServer(e.target.value)}
            />
          </label>
          <label>
            Display name{" "}
            <input
              aria-label="Display name"
              value={displayName}
              maxLength={60}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
          <button disabled={!ready} onClick={() => void join(true)}>
            Create room
          </button>
          <button
            disabled={!ready || !room || !invite}
            onClick={() => void join(false)}
          >
            Join room
          </button>
          <label>
            Restore backup as new room{" "}
            <input
              aria-label="Restore backup as new room"
              type="file"
              accept=".libra,.json,application/json"
              disabled={!ready}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) {
                  if (file.size > 2 * 1024 * 1024) {
                    setError("Backup exceeds 2 MiB");
                    return;
                  }
                  void file
                    .text()
                    .then((text) => join(true, parseProject(text)))
                    .catch((error) => setError(String(error)));
                }
              }}
            />
          </label>
          <small>
            Run <code>npm run dev:collaboration</code> alongside the web app.
          </small>
        </section>
      ) : (
        <>
          <section className="collab-controls">
            <strong role="status">
              {client?.status ?? "connecting"} · revision {state?.revision ?? 0}{" "}
              · {client?.role ?? "viewer"} ·{" "}
              {client?.durable ? "saved on server disk" : "memory-only server"}
            </strong>
            <button
              onClick={() =>
                void navigator.clipboard
                  .writeText(location.href)
                  .catch((e) => setError(String(e)))
              }
            >
              Copy invitation link
            </button>
            <button
              disabled={!client?.engine}
              onClick={() =>
                download(
                  "Shared prototype.libra",
                  serializeProject(client!.engine!.document_json()),
                )
              }
            >
              Download document
            </button>
            <button
              onClick={() => {
                setSession(undefined);
              }}
            >
              Leave room
            </button>
          </section>
          <section className="collab-controls">
            <button disabled={blocked} onClick={addRectangle}>
              Add rectangle
            </button>
            <button
              disabled={blocked || !state?.undo_operation_id}
              onClick={() =>
                submit({
                  type: "undo",
                  operation_id: state!.undo_operation_id!,
                })
              }
            >
              Undo my edit
            </button>
            <button
              disabled={blocked || !state?.redo_operation_id}
              onClick={() =>
                submit({
                  type: "redo",
                  operation_id: state!.redo_operation_id!,
                })
              }
            >
              Redo my edit
            </button>
            <span>
              {client?.pending
                ? "Pending edit retained in this browser"
                : "All edits acknowledged"}
            </span>
          </section>
          {client?.pending && (
            <section className="collab-controls">
              <button
                onClick={() =>
                  download(
                    "pending-edit.json",
                    JSON.stringify(client.pending, null, 2),
                  )
                }
              >
                Download pending edit
              </button>
              <button
                disabled={
                  client.status !== "connected" ||
                  !client.pending.rejected ||
                  client.role === "viewer"
                }
                onClick={() => {
                  try {
                    client.retry();
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              >
                Retry against latest revision
              </button>
              <button
                onClick={() => {
                  if (
                    confirm(
                      "Discard this unacknowledged edit? Download it first if you need a copy.",
                    )
                  )
                    client.discard();
                }}
              >
                Discard pending edit
              </button>
            </section>
          )}
          {client && <CollaborationAccess client={client} />}
          <div className="collab-workspace">
            <svg
              aria-label="Shared rectangle canvas"
              viewBox="0 0 1000 650"
              onPointerMove={(event) => {
                const point = new DOMPoint(event.clientX, event.clientY);
                const matrix = event.currentTarget.getScreenCTM();
                if (matrix) {
                  const world = point.matrixTransform(matrix.inverse());
                  client?.updatePresence({
                    cursor: { x: world.x, y: world.y },
                  });
                }
              }}
              onPointerLeave={() => client?.updatePresence({ cursor: null })}
            >
              {nodes.map((node) => (
                <g
                  key={node.id}
                  tabIndex={0}
                  role="button"
                  aria-label={node.name}
                  onClick={() => {
                    setSelection(node.id);
                    client?.updatePresence({ selection: [node.id] });
                    setName(node.name);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelection(node.id);
                      client?.updatePresence({ selection: [node.id] });
                      setName(node.name);
                    }
                  }}
                >
                  <rect
                    x={node.x}
                    y={node.y}
                    width={node.width}
                    height={node.height}
                    fill={`rgb(${node.fill
                      .slice(0, 3)
                      .map((v) => Math.round(v * 255))
                      .join(",")})`}
                    opacity={node.opacity}
                    stroke={selection === node.id ? "#1262da" : "#444"}
                    strokeWidth={selection === node.id ? 3 : 1}
                  />
                  <text x={node.x + 8} y={node.y + 22}>
                    {node.name}
                  </text>
                </g>
              ))}
              {client?.presence
                .filter((p) => p.actor_id !== session.actor)
                .map((p) => {
                  const person = client.participants.find(
                    (person) => person.actor_id === p.actor_id,
                  );
                  if (!person) return null;
                  return (
                    <g
                      key={p.actor_id}
                      pointerEvents="none"
                      aria-label={`${person.name} presence`}
                    >
                      {p.selection.map((id) => {
                        const node = nodes.find((n) => n.id === id);
                        return node ? (
                          <rect
                            key={id}
                            x={node.x - 4}
                            y={node.y - 4}
                            width={node.width + 8}
                            height={node.height + 8}
                            fill="none"
                            stroke={person.color}
                            strokeWidth={2}
                            strokeDasharray="5 3"
                            data-testid="remote-selection"
                          />
                        ) : null;
                      })}
                      {p.cursor && (
                        <g
                          transform={`translate(${p.cursor.x} ${p.cursor.y})`}
                          data-testid="remote-cursor"
                        >
                          <path
                            d="M0 0 L0 18 L5 13 L11 20 L14 18 L8 11 L16 10 Z"
                            fill={person.color}
                            stroke="white"
                          />
                          <text x={18} y={14} style={{ fill: person.color }}>
                            {person.name}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
            </svg>
            <aside>
              <h2>Selection</h2>
              {selected && model ? (
                <>
                  <p>{selected.name}</p>
                  <label>
                    Name{" "}
                    <input
                      aria-label="Shared object name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <button disabled={blocked} onClick={() => change({ name })}>
                    Rename
                  </button>
                  <button
                    disabled={blocked}
                    onClick={() =>
                      submit({
                        type: "move_nodes",
                        page_id: model.active_page_id,
                        node_ids: [selected.id],
                        dx: 20,
                        dy: 0,
                      })
                    }
                  >
                    Move right 20
                  </button>
                  <button
                    disabled={blocked}
                    onClick={() =>
                      change({ opacity: selected.opacity === 1 ? 0.5 : 1 })
                    }
                  >
                    Toggle opacity
                  </button>
                  <button
                    disabled={blocked}
                    onClick={() =>
                      submit({
                        type: "delete_node",
                        page_id: model.active_page_id,
                        node_id: selected.id,
                      })
                    }
                  >
                    Delete rectangle
                  </button>
                </>
              ) : (
                <p>Select a rectangle.</p>
              )}
            </aside>
          </div>
        </>
      )}
      {(error || client?.error) && <p role="alert">{error || client?.error}</p>}
    </main>
  );
}
