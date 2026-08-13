import type { DocumentReadModel, NodeSummary } from "./types";

const DATABASE_NAME = "open-libra-documents";
const STORE_NAME = "recent-documents";
const MAX_RECENT_DOCUMENTS = 12;

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
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_RECENT_DOCUMENTS);
}

export async function storeRecentDocument(document: RecentDocument) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).put(document);
  await transactionComplete(transaction);
  const records = await requestResult<RecentDocument[]>(
    database.transaction(STORE_NAME).objectStore(STORE_NAME).getAll(),
  );
  const stale = records
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(MAX_RECENT_DOCUMENTS);
  if (stale.length > 0) {
    const prune = database.transaction(STORE_NAME, "readwrite");
    for (const record of stale) prune.objectStore(STORE_NAME).delete(record.id);
    await transactionComplete(prune);
  }
  database.close();
}

export async function removeRecentDocument(id: string) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).delete(id);
  await transactionComplete(transaction);
  database.close();
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME))
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
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
