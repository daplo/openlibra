import type { DocumentReadModel, NodeSummary, PageSummary } from "./types";

const DATABASE_NAME = "open-libra-documents";
const STORE_NAME = "recent-documents";
const SNAPSHOT_STORE_NAME = "recovery-snapshots";
const MAX_RECENT_DOCUMENTS = 12;
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

export async function listRecentDocuments(): Promise<RecentDocument[]> {
  const database = await openDatabase();
  const records = await requestResult<RecentDocument[]>(
    database.transaction(STORE_NAME).objectStore(STORE_NAME).getAll(),
  );
  database.close();
  return records
    .filter((record) => !record.archivedAt)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_RECENT_DOCUMENTS);
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
  return localStorage.getItem(LAST_DOCUMENT_KEY) ?? undefined;
}

export function setLastDocumentId(id?: string) {
  if (id) localStorage.setItem(LAST_DOCUMENT_KEY, id);
  else localStorage.removeItem(LAST_DOCUMENT_KEY);
}

export async function storeRecentDocument(document: RecentDocument) {
  const database = await openDatabase();
  const transaction = database.transaction(
    [STORE_NAME, SNAPSHOT_STORE_NAME],
    "readwrite",
  );
  transaction.objectStore(STORE_NAME).put(document);
  await transactionComplete(transaction);
  const records = await requestResult<RecentDocument[]>(
    database.transaction(STORE_NAME).objectStore(STORE_NAME).getAll(),
  );
  const stale = records
    .filter((record) => !record.archivedAt)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(MAX_RECENT_DOCUMENTS);
  database.close();
  await Promise.all(stale.map((record) => removeRecentDocument(record.id)));
}

export async function removeRecentDocument(id: string) {
  const database = await openDatabase();
  const transaction = database.transaction(
    [STORE_NAME, SNAPSHOT_STORE_NAME],
    "readwrite",
  );
  transaction.objectStore(STORE_NAME).delete(id);
  const snapshots = transaction
    .objectStore(SNAPSHOT_STORE_NAME)
    .index("documentId");
  for (const key of await requestResult<IDBValidKey[]>(
    snapshots.getAllKeys(id),
  ))
    transaction.objectStore(SNAPSHOT_STORE_NAME).delete(key);
  await transactionComplete(transaction);
  database.close();
}

export async function storeRecoverySnapshot(snapshot: RecoverySnapshot) {
  const database = await openDatabase();
  const transaction = database.transaction(SNAPSHOT_STORE_NAME, "readwrite");
  transaction.objectStore(SNAPSHOT_STORE_NAME).put(snapshot);
  await transactionComplete(transaction);
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
  database.close();
}

export async function listRecoverySnapshots(documentId: string) {
  const database = await openDatabase();
  const snapshots = await requestResult<RecoverySnapshot[]>(
    database
      .transaction(SNAPSHOT_STORE_NAME)
      .objectStore(SNAPSHOT_STORE_NAME)
      .index("documentId")
      .getAll(documentId),
  );
  database.close();
  return snapshots.sort((a, b) => b.createdAt - a.createdAt);
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
