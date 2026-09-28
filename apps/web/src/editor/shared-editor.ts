import { DocumentEngine } from "../wasm/open_libra_scene_wasm";
import type { CollaborationClient, SharedState } from "./collaboration";
import type { DocumentChange } from "./operations";

const reads = new Set([
  "document_json",
  "read_model_json",
  "operation_state_json",
  "node_json",
  "scene_data",
  "scene_data_for_view",
  "hit_test",
  "rect_count",
  "document_changes_json",
]);

/** Adapts the native editor to a confirmed shared head and one recoverable intent.
 * A working engine preserves synchronous native APIs and live drag previews.
 * Only committed, identity-addressed changes cross the network. */
export class SharedEditorBridge {
  readonly engine: DocumentEngine;
  private working: DocumentEngine;
  private baseline?: string;
  private base?: SharedState;
  private transaction = false;
  private scheduled = false;
  private disposed = false;
  private revision = -1;
  private preferredPage: string;
  private listeners = new Set<() => void>();
  constructor(readonly client: CollaborationClient) {
    this.working = DocumentEngine.load_json(client.engine!.document_json());
    this.working.enable_operations(client.session.actor);
    this.revision = client.state()!.revision;
    this.preferredPage = JSON.parse(
      this.working.read_model_json(),
    ).active_page_id;
    this.engine = new Proxy(this.working, {
      get: (_target, property) => {
        if (property === "free" || property === "enable_operations")
          return () => {};
        if (typeof property !== "string") return undefined;
        return (...args: unknown[]) => this.call(property, args);
      },
    });
  }
  get blocked() {
    return (
      this.client.role === "viewer" ||
      this.client.status !== "connected" ||
      !!this.client.pending
    );
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private notify() {
    for (const listener of this.listeners) listener();
  }
  sync() {
    if (this.disposed) return;
    if (
      !this.baseline &&
      !this.transaction &&
      this.client.engine &&
      this.revision !== this.client.state()!.revision
    )
      this.reset();
    this.notify();
  }
  private reset() {
    const next = DocumentEngine.load_json(this.client.engine!.document_json());
    next.enable_operations(this.client.session.actor);
    if (!next.set_active_page(this.preferredPage) && !this.client.pending)
      this.preferredPage = JSON.parse(next.read_model_json()).active_page_id;
    this.working.free();
    this.working = next;
    this.revision = this.client.state()!.revision;
  }
  private call(method: string, args: unknown[]): unknown {
    if (this.disposed) return false;
    const invoke = () => {
      const fn = Reflect.get(this.working, method) as (
        ...values: unknown[]
      ) => unknown;
      return fn.apply(this.working, args);
    };
    if (reads.has(method)) return invoke();
    if (method === "set_active_page") {
      const result = invoke();
      if (result) this.preferredPage = args[0] as string;
      return result;
    }
    if (method === "can_undo" || method === "can_redo")
      return (
        !this.blocked &&
        !!this.client.state()?.[
          method === "can_undo" ? "undo_operation_id" : "redo_operation_id"
        ]
      );
    if (method === "end_transaction") {
      if (this.transaction) {
        invoke();
        this.transaction = false;
        this.schedule();
      }
      return;
    }
    if (this.blocked && !this.transaction) {
      return /^(add_|create_|duplicate_|group_|import_|reset_component|swap_component|set_instance_variant)/.test(
        method,
      )
        ? ""
        : false;
    }
    if (method === "undo" || method === "redo") {
      if (this.baseline || this.transaction) return false;
      const id =
        this.client.state()?.[
          method === "undo" ? "undo_operation_id" : "redo_operation_id"
        ];
      if (!id) return false;
      this.client.submit({ type: method, operation_id: id });
      return true;
    }
    if (!this.baseline) {
      this.baseline = this.working.document_json();
      this.base = this.client.state();
    }
    if (
      method === "begin_transaction" ||
      method === "begin_geometry_transaction"
    ) {
      this.transaction = true;
      return invoke();
    }
    try {
      return invoke();
    } finally {
      this.schedule();
    }
  }
  private schedule() {
    if (this.scheduled || this.transaction) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      if (this.disposed || this.transaction || !this.baseline) return;
      try {
        const changes = JSON.parse(
          this.working.document_changes_json(this.baseline),
        ) as DocumentChange[];
        if (changes.length) {
          // A role change during a gesture must retain intent too. submit retains
          // the draft before send; the server remains the authority on access.
          this.client.retain({ type: "document_changes", changes }, this.base!);
        }
        this.preferredPage = JSON.parse(
          this.working.read_model_json(),
        ).active_page_id;
        this.baseline = undefined;
        this.base = undefined;
        this.reset();
      } catch (error) {
        this.client.error = `Could not prepare shared edit: ${String(error)}. Download the working copy before leaving.`;
      }
      this.notify();
    });
  }
  get hasDraft() {
    return !!this.baseline;
  }
  dispose() {
    this.disposed = true;
    this.listeners.clear();
    this.working.free();
  }
}
