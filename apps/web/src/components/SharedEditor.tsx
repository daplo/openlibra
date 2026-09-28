import { useEffect, useState } from "react";
import init, { DocumentEngine } from "../wasm/open_libra_scene_wasm";
import { App } from "../App";
import { CollaborationClient } from "../editor/collaboration";
import { SharedEditorBridge } from "../editor/shared-editor";
import { CollaborationAccess } from "./CollaborationAccess";
import {
  createProjectPreview,
  setLastDocumentId,
  storeRecentDocument,
} from "../editor/recent-documents";
import type { DocumentReadModel } from "../editor/types";

export function SharedEditor() {
  const [bridge, setBridge] = useState<SharedEditorBridge>();
  const [error, setError] = useState<string>();
  const [name, setName] = useState("Designer");
  const [joining, setJoining] = useState(false);
  const [access, setAccess] = useState(false);
  const [, update] = useState(0);
  const params = new URLSearchParams(location.search);
  const server = params.get("server") ?? "http://127.0.0.1:8787";
  const room = params.get("room") ?? "";
  const invite = new URLSearchParams(location.hash.slice(1)).get("invite");
  const key = `open-libra-room-session:${server}:${room}`;
  const [identity, setIdentity] = useState<
    { token: string; actor_id: string } | undefined
  >(() => {
    try {
      return JSON.parse(sessionStorage.getItem(key) ?? "null") ?? undefined;
    } catch {
      return undefined;
    }
  });
  useEffect(() => {
    if (!identity) return;
    let live = true;
    let client: CollaborationClient | undefined;
    let editor: SharedEditorBridge | undefined;
    void init()
      .then(() => {
        if (!live) return;
        client = new CollaborationClient(
          { server, room, token: identity.token, actor: identity.actor_id },
          () => {
            if (!live) return;
            if (client?.error && !editor) setError(client.error);
            if (client?.engine && !editor) {
              editor = new SharedEditorBridge(client);
              setBridge(editor);
            } else editor?.sync();
            update((n) => n + 1);
          },
        );
        void client.connect();
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
      editor?.dispose();
      client?.close();
    };
  }, [identity, server, room]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (bridge?.client.pending || bridge?.hasDraft) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [bridge]);
  async function join() {
    setJoining(true);
    try {
      const response = await fetch(`${server}/rooms/${room}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite, name }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      sessionStorage.setItem(key, JSON.stringify(result));
      setIdentity(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setJoining(false);
    }
  }
  async function fork() {
    if (!bridge) return;
    try {
      const document = JSON.parse(bridge.engine.document_json());
      delete document.operation_history;
      const engine = DocumentEngine.load_json(JSON.stringify(document));
      try {
        const model = JSON.parse(engine.read_model_json()) as DocumentReadModel;
        const id = crypto.randomUUID();
        await storeRecentDocument(
          {
            id,
            name: "Shared document copy.libra",
            json: engine.document_json(),
            updatedAt: Date.now(),
            pageCount: model.pages.length,
            objectCount: model.nodes.length,
            preview: createProjectPreview(model),
            pages: model.pages,
          },
          null,
        );
        setLastDocumentId(id);
        location.assign(import.meta.env.BASE_URL);
      } finally {
        engine.free();
      }
    } catch (e) {
      setError(String(e));
    }
  }
  function downloadPending() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(bridge?.client.pending, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "pending-shared-edit.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (!bridge)
    return (
      <main className="shared-join">
        <h1>Shared document</h1>
        {identity ? (
          <p>Connecting…</p>
        ) : (
          <>
            <label>
              Your name
              <input
                aria-label="Your name"
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button
              disabled={joining || !name.trim() || !invite}
              onClick={() => void join()}
            >
              Join shared document
            </button>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <a href={import.meta.env.BASE_URL}>Open local editor</a>
      </main>
    );
  const client = bridge.client;
  return (
    <div className="shared-editor-shell">
      <div className="shared-status" aria-label="Shared document status">
        <strong>Shared document</strong>
        <span role="status">
          {client.status} · {client.role} · revision {client.state()?.revision}
          {client.pending ? " · pending edit" : ""}
        </span>
        <span>
          {client.durable
            ? "Confirmed edits saved on server"
            : "Server memory only"}
        </span>
        <button onClick={() => setAccess(!access)}>People and access</button>
        <button
          disabled={!!client.pending || bridge.hasDraft}
          onClick={() => void fork()}
        >
          Make local copy
        </button>
        {client.pending && (
          <>
            <button
              disabled={
                client.status !== "connected" ||
                client.role === "viewer" ||
                !client.pending.rejected
              }
              onClick={() => client.retry()}
            >
              Retry pending edit
            </button>
            <button onClick={downloadPending}>Download pending edit</button>
            <button
              onClick={() => {
                if (
                  confirm(
                    "Discard the pending edit? Download it first if you want to keep it.",
                  )
                )
                  client.discard();
              }}
            >
              Discard pending edit
            </button>
          </>
        )}
        {(client.error || error) && (
          <span role="alert">{client.error || error}</span>
        )}
      </div>
      {access && (
        <div className="shared-access">
          <CollaborationAccess client={client} />
        </div>
      )}
      <App shared={bridge} />
    </div>
  );
}
