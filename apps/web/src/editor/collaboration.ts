import { DocumentEngine } from "../wasm/open_libra_scene_wasm";
import {
  createOperation,
  type OperationCommand,
  type OperationEnvelope,
  type OperationState,
} from "./operations";

export type Role = "owner" | "editor" | "viewer";
export type Participant = {
  actor_id: string;
  name: string;
  role: Role;
  online: boolean;
  color: string;
};
export type Presence = {
  actor_id: string;
  page_id?: string;
  cursor: { x: number; y: number } | null;
  selection: string[];
};
export type Invitation = {
  id: string;
  secret: string;
  role: "editor" | "viewer";
  expires_at: number;
  revoked: boolean;
};

export type RoomSession = {
  server: string;
  room: string;
  token: string;
  actor: string;
};
type Draft = { envelope: OperationEnvelope; rejected: boolean };
export type SharedState = OperationState & {
  undo_operation_id?: string;
  redo_operation_id?: string;
};
export class CollaborationClient {
  engine?: DocumentEngine;
  status: "connecting" | "connected" | "offline" | "closed" | "revoked" =
    "connecting";
  error?: string;
  role: Role = "viewer";
  durable = false;
  participants: Participant[] = [];
  presence: Presence[] = [];
  private currentPresence = {
    page_id: undefined as string | undefined,
    cursor: null as Presence["cursor"],
    selection: [] as string[],
  };
  private presenceTimer?: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setInterval>;
  private presenceSending = false;
  pending?: Draft;
  private abort?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private sending = false;
  private stopped = false;
  private key: string;
  constructor(
    readonly session: RoomSession,
    private changed: () => void,
  ) {
    this.key = `open-libra-collaboration-draft:${session.room}:${session.actor}`;
    try {
      const saved = localStorage.getItem(this.key);
      if (saved) this.pending = JSON.parse(saved) as Draft;
    } catch {
      this.error = "Could not read the pending edit saved in this browser.";
    }
  }
  state(): SharedState | undefined {
    return this.engine
      ? (JSON.parse(this.engine.operation_state_json()) as SharedState)
      : undefined;
  }
  private persist() {
    if (this.pending)
      localStorage.setItem(this.key, JSON.stringify(this.pending));
    else localStorage.removeItem(this.key);
  }
  private headers() {
    return {
      Authorization: `Bearer ${this.session.token}`,
      "Content-Type": "application/json",
    };
  }
  submit(command: OperationCommand, base = this.state()!) {
    if (this.role === "viewer" || this.status === "revoked")
      throw new Error("You do not have editing access");
    if (!this.engine || this.pending)
      throw new Error("Resolve the pending edit before making another edit");
    this.retain(command, base);
  }
  // Preserve a gesture that finished after access changed; never send it as a viewer.
  retain(command: OperationCommand, base: SharedState) {
    if (this.pending) throw new Error("Resolve the pending edit first");
    this.pending = {
      envelope: createOperation(base, command),
      rejected: this.role === "viewer" || this.status === "revoked",
    };
    if (this.pending.rejected)
      this.error = "Editing access was removed. Your pending edit is retained.";
    // Never send before preserving the user's intent locally.
    try {
      this.persist();
    } catch {
      this.pending.rejected = true;
      this.error =
        "Could not save the pending edit in this browser. Download it before leaving.";
      this.changed();
      return;
    }
    this.changed();
    void this.send();
  }
  retry() {
    if (
      !this.pending ||
      !this.engine ||
      this.status !== "connected" ||
      this.role === "viewer"
    )
      return;
    this.pending = {
      envelope: createOperation(this.state()!, this.pending.envelope.command),
      rejected: false,
    };
    this.persist();
    this.error = undefined;
    this.changed();
    void this.send();
  }
  discard() {
    this.pending = undefined;
    this.persist();
    this.error = undefined;
    this.changed();
  }
  private async send() {
    if (
      !this.pending ||
      this.pending.rejected ||
      this.sending ||
      this.status !== "connected" ||
      this.role === "viewer"
    )
      return;
    this.sending = true;
    const envelope = this.pending.envelope;
    try {
      const response = await fetch(
        `${this.session.server}/rooms/${this.session.room}/operations`,
        {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify(envelope),
        },
      );
      if (!response.ok) {
        const result = (await response.json()) as { error: string };
        if (this.pending?.envelope.operation_id === envelope.operation_id) {
          this.pending.rejected = true;
          this.persist();
          this.error = result.error;
          this.changed();
        }
      }
      // The event stream (or a reconnect snapshot) confirms the accepted state.
    } catch {
      this.error = "Connection interrupted. Your pending edit is retained.";
      this.abort?.abort();
    } finally {
      this.sending = false;
      this.changed();
    }
  }
  async request(path: string, body?: unknown) {
    const response = await fetch(
      `${this.session.server}/rooms/${this.session.room}/${path}`,
      {
        method: body === undefined ? "GET" : "POST",
        headers: this.headers(),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result;
  }
  updatePresence(
    change: Partial<{
      page_id: string;
      cursor: Presence["cursor"];
      selection: string[];
    }>,
  ) {
    this.currentPresence = { ...this.currentPresence, ...change };
    if (!this.presenceTimer)
      this.presenceTimer = setTimeout(() => {
        this.presenceTimer = undefined;
        void this.publishPresence();
      }, 100);
  }
  private async publishPresence() {
    if (this.status !== "connected" || this.presenceSending) return;
    this.presenceSending = true;
    // Presence is disposable: an offline cursor never becomes a durable edit.
    try {
      if (this.engine) {
        const nodes = (
          JSON.parse(this.engine.document_json()) as {
            pages: { nodes: { id: string }[] }[];
          }
        ).pages.flatMap((page) => page.nodes);
        const ids = new Set(nodes.map((node) => node.id));
        this.currentPresence.selection = this.currentPresence.selection.filter(
          (id) => ids.has(id),
        );
      }
      await this.request("presence", this.currentPresence);
    } catch {
      /* Next heartbeat retries. */
    } finally {
      this.presenceSending = false;
    }
  }
  async connect() {
    if (this.stopped) return;
    this.status = "connecting";
    this.changed();
    const abort = new AbortController();
    this.abort = abort;
    try {
      const response = await fetch(
        `${this.session.server}/rooms/${this.session.room}/events`,
        { headers: this.headers(), signal: abort.signal },
      );
      if (!response.ok) {
        if (response.status === 401) {
          this.status = "revoked";
          this.stopped = true;
          clearInterval(this.heartbeat);
        }
        const message = ((await response.json()) as { error: string }).error;
        if (response.status === 401) this.error = message;
        throw new Error(message);
      }
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!this.stopped) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end;
        while ((end = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (!frame.startsWith("data: ")) continue;
          const event = JSON.parse(frame.slice(6)) as {
            type: string;
            document?: string;
            envelope?: OperationEnvelope;
            role?: Role;
            durable?: boolean;
            revoked?: boolean;
            participants?: Participant[];
            presence?: Presence[];
          };
          if (event.type === "snapshot") {
            const next = DocumentEngine.load_json(event.document!);
            next.enable_operations(this.session.actor);
            this.engine?.free();
            this.engine = next;
            this.status = "connected";
            this.role = event.role ?? "viewer";
            this.durable = event.durable ?? false;
            clearInterval(this.heartbeat);
            this.heartbeat = setInterval(
              () => void this.publishPresence(),
              10000,
            );
            const journal = JSON.parse(event.document!).operation_history as {
              entries: { envelope: OperationEnvelope }[];
            };
            if (
              this.pending &&
              journal.entries.some(
                (entry) =>
                  entry.envelope.operation_id ===
                  this.pending!.envelope.operation_id,
              )
            ) {
              this.pending = undefined;
              this.persist();
            }
            if (this.pending && this.role === "viewer") {
              this.pending.rejected = true;
              this.persist();
              this.error =
                "Editing access was removed. Your pending edit is retained.";
            }
            if (!this.pending?.rejected) this.error = undefined;
            this.changed();
            void this.send();
          } else if (event.type === "participants") {
            this.participants = event.participants ?? [];
            this.changed();
          } else if (event.type === "presence") {
            this.presence = event.presence ?? [];
            this.changed();
          } else if (event.type === "access") {
            this.role = event.role ?? "viewer";
            if (event.revoked) {
              this.status = "revoked";
              this.stopped = true;
              this.error =
                "Your room access was revoked. Previously received content and pending intent remain available for download.";
              clearInterval(this.heartbeat);
              abort.abort();
            } else if (this.pending && this.role === "viewer") {
              this.pending.rejected = true;
              this.persist();
              this.error =
                "Editing access was removed. Your pending edit is retained.";
            }
            this.changed();
          } else if (event.type === "operation" && this.engine) {
            this.engine.apply_operation_json(JSON.stringify(event.envelope));
            if (
              this.pending?.envelope.operation_id ===
              event.envelope!.operation_id
            ) {
              this.pending = undefined;
              this.persist();
              this.error = undefined;
            }
            this.changed();
          }
        }
      }
    } catch (error) {
      if (!this.stopped || this.status === "revoked") {
        if (!this.error)
          this.error = error instanceof Error ? error.message : String(error);
        this.changed();
      }
    } finally {
      abort.abort();
      clearInterval(this.heartbeat);
      if (!this.stopped) {
        this.status = "offline";
        this.changed();
        this.timer = setTimeout(() => void this.connect(), 2000);
      }
    }
  }
  close() {
    this.stopped = true;
    this.status = "closed";
    clearTimeout(this.timer);
    clearTimeout(this.presenceTimer);
    clearInterval(this.heartbeat);
    this.abort?.abort();
    this.engine?.free();
    this.engine = undefined;
  }
}
