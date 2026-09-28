import type { DocumentReadModel, NodeSummary, PageSummary } from "./types";

const DATABASE_NAME = "open-libra-documents";
const STORE_NAME = "recent-documents";
const SNAPSHOT_STORE_NAME = "recovery-snapshots";
const MAX_SNAPSHOTS_PER_DOCUMENT = 5;
const LAST_DOCUMENT_KEY = "open-libra-last-document-id";

export type ProjectPreviewNode = Pick<
  NodeSummary,
  "id" | "kind" | "x" | "y" | "width" | "height" | "fill" | "corner_radii"
> & { text?: string };

export type ProjectPreview = {
  bounds: { x: number; y: number; width: number; height: number };
  nodes: ProjectPreviewNode[];
};

export type RecentDocument = {
  /** Missing revisions on legacy records are read as zero. */
  revision?: number;
  id: string;
  name: string;
  json: string;
  updatedAt: number;
  pageCount: number;
  objectCount: number;
  preview: ProjectPreview;
  pages?: PageSummary[];
  coverPageId?: string;
  archivedAt?: number;
};

export type RecoverySnapshot = {
  id: string;
  documentId: string;
  name: string;
  json: string;
  createdAt: number;
};

export function createProjectPreview(model: DocumentReadModel): ProjectPreview {
  const visible = model.nodes
    .filter((node) => node.kind !== "group")
    .slice(0, 120);
  if (visible.length === 0)
    return {
      bounds: { x: 0, y: 0, width: 1, height: 1 },
      nodes: [],
    };
  const minX = Math.min(...visible.map((node) => node.x));
  const minY = Math.min(...visible.map((node) => node.y));
  const maxX = Math.max(...visible.map((node) => node.x + node.width));
  const maxY = Math.max(...visible.map((node) => node.y + node.height));
  return {
    bounds: {
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    },
    nodes: visible.map((node) => ({
      kind: node.kind,
      id: node.id,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      fill: node.fill,
      corner_radii: node.corner_radii,
      text: node.text?.content,
    })),
  };
}

export async function listStoredDocuments(): Promise<RecentDocument[]> {
  const database = await openDatabase();
  const records = await requestResult<RecentDocument[]>(
    database.transaction(STORE_NAME).objectStore(STORE_NAME).getAll(),
  );
  database.close();
  return records
    .filter((record) => !record.archivedAt)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listArchivedDocuments(): Promise<RecentDocument[]> {
  const database = await openDatabase();
  const records = await requestResult<RecentDocument[]>(
    database.transaction(STORE_NAME).objectStore(STORE_NAME).getAll(),
  );
  database.close();
  return records
    .filter((record) => record.archivedAt)
    .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));
}

export async function getRecentDocument(id: string) {
  const database = await openDatabase();
  const record = await requestResult<RecentDocument | undefined>(
    database.transaction(STORE_NAME).objectStore(STORE_NAME).get(id),
  );
  database.close();
  return record;
}

export function getLastDocumentId() {
  try {
    return localStorage.getItem(LAST_DOCUMENT_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function setLastDocumentId(id?: string) {
  try {
    if (id) localStorage.setItem(LAST_DOCUMENT_KEY, id);
    else localStorage.removeItem(LAST_DOCUMENT_KEY);
  } catch {
    // The last-opened shortcut is optional; IndexedDB owns saved projects.
  }
}

export class ProjectConflictError extends Error {
  constructor() {
    super(
      "This project changed or was deleted in another tab. Reload it or save your work as a copy.",
    );
    this.name = "ProjectConflictError";
  }
}

const projectChannel =
  typeof BroadcastChannel === "undefined"
    ? undefined
    : new BroadcastChannel("open-libra-project-changes");

export function subscribeToProjectChanges(listener: (id: string) => void) {
  const handler = (event: MessageEvent) => {
    if (typeof event.data?.id === "string") listener(event.data.id);
  };
  projectChannel?.addEventListener("message", handler);
  return () => projectChannel?.removeEventListener("message", handler);
}

function projectContent(document: RecentDocument) {
  return JSON.stringify([
    document.name,
    document.json,
    document.pageCount,
    document.objectCount,
    document.preview,
    document.pages,
    document.coverPageId,
    document.archivedAt,
  ]);
}

export async function storeRecentDocument(
  document: RecentDocument,
  expectedRevision: number | null = document.revision ?? 0,
): Promise<RecentDocument> {
  const database = await openDatabase();
  try {
    let changed = false;
    const saved = await new Promise<RecentDocument>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      let result: RecentDocument;
      let failure: unknown;
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(failure ?? transaction.error);
      transaction.onerror = () => {
        failure ??= transaction.error;
      };
      const request = store.get(document.id);
      request.onsuccess = () => {
        const previous = request.result as RecentDocument | undefined;
        // Compare and write in one transaction, serialized across browser tabs.
        if ((previous ? (previous.revision ?? 0) : null) !== expectedRevision) {
          failure = new ProjectConflictError();
          transaction.abort();
          return;
        }
        const unchanged =
          previous && projectContent(previous) === projectContent(document);
        // Opening a project updates recency without invalidating other editors.
        result = unchanged
          ? {
              ...previous,
              updatedAt: Math.max(previous.updatedAt, document.updatedAt),
            }
          : { ...document, revision: (previous?.revision ?? 0) + 1 };
        try {
          store.put(result);
          changed = !unchanged;
        } catch (cause) {
          failure = cause;
          transaction.abort();
        }
      };
    });
    if (changed) projectChannel?.postMessage({ id: document.id });
    return saved;
  } finally {
    database.close();
  }
}

export async function removeRecentDocument(
  id: string,
  expectedRevision: number,
) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        [STORE_NAME, SNAPSHOT_STORE_NAME],
        "readwrite",
      );
      let failure: unknown;
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(failure ?? transaction.error);
      transaction.onerror = () => {
        failure ??= transaction.error;
      };
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);
      request.onsuccess = () => {
        if (
          !request.result ||
          (request.result.revision ?? 0) !== expectedRevision
        ) {
          failure = new ProjectConflictError();
          transaction.abort();
          return;
        }
        store.delete(id);
        const snapshots = transaction.objectStore(SNAPSHOT_STORE_NAME);
        const keys = snapshots.index("documentId").getAllKeys(id);
        keys.onsuccess = () => {
          for (const key of keys.result) snapshots.delete(key);
        };
      };
    });
    projectChannel?.postMessage({ id });
  } finally {
    database.close();
  }
}

export async function storeRecoverySnapshot(snapshot: RecoverySnapshot) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(
      [STORE_NAME, SNAPSHOT_STORE_NAME],
      "readwrite",
    );
    const completed = transactionComplete(transaction);
    // Deletion and snapshot creation share a transaction scope: never recreate
    // recovery history for a project that has already been deliberately deleted.
    const project = transaction
      .objectStore(STORE_NAME)
      .get(snapshot.documentId);
    project.onsuccess = () => {
      try {
        if (project.result)
          transaction.objectStore(SNAPSHOT_STORE_NAME).put(snapshot);
      } catch {
        transaction.abort();
      }
    };
    await completed;
    const snapshots = await requestResult<RecoverySnapshot[]>(
      database
        .transaction(SNAPSHOT_STORE_NAME)
        .objectStore(SNAPSHOT_STORE_NAME)
        .index("documentId")
        .getAll(snapshot.documentId),
    );
    const stale = snapshots
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(MAX_SNAPSHOTS_PER_DOCUMENT);
    if (stale.length > 0) {
      const prune = database.transaction(SNAPSHOT_STORE_NAME, "readwrite");
      for (const item of stale)
        prune.objectStore(SNAPSHOT_STORE_NAME).delete(item.id);
      await transactionComplete(prune);
    }
  } finally {
    database.close();
  }
}

export async function listRecoverySnapshots(documentId: string) {
  const database = await openDatabase();
  try {
    const snapshots = await requestResult<RecoverySnapshot[]>(
      database
        .transaction(SNAPSHOT_STORE_NAME)
        .objectStore(SNAPSHOT_STORE_NAME)
        .index("documentId")
        .getAll(documentId),
    );
    return snapshots.sort((a, b) => b.createdAt - a.createdAt);
  } finally {
    database.close();
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME))
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      if (!request.result.objectStoreNames.contains(SNAPSHOT_STORE_NAME)) {
        const snapshots = request.result.createObjectStore(
          SNAPSHOT_STORE_NAME,
          { keyPath: "id" },
        );
        snapshots.createIndex("documentId", "documentId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
