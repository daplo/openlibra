import type { DocumentEngine } from "../wasm/open_libra_scene_wasm";

const snapshots = new WeakMap<
  DocumentEngine,
  { key: string; json: string; pages: Map<string, string> }
>();

/** One committed snapshot per live engine. Replacing/freeing an engine does not
 * retain it here. During a gesture the engine exposes its committed baseline. */
export function serializeDocument(engine: DocumentEngine): string {
  const key = engine.document_snapshot_key();
  if (!key) return engine.document_json();
  const cached = snapshots.get(engine);
  if (cached?.key === key) return cached.json;
  const [documentId, revision, pageId] = key.split(":");
  const previous = cached?.key.split(":");
  // Navigation changes only the root active-page field; the committed content
  // and journal are identical. Do not serialize them again for a page click.
  const sameRevision =
    cached && previous?.[0] === documentId && previous[1] === revision;
  const pages = sameRevision ? cached.pages : new Map<string, string>();
  const json =
    pages.get(pageId) ??
    (cached && previous?.[0] === documentId && previous[1] === revision
      ? cached.json.replace(
          `"active_page_id":"${previous[2]}"`,
          `"active_page_id":"${pageId}"`,
        )
      : engine.document_json());
  pages.set(pageId, json);
  if (pages.size > 1) pages.delete(pages.keys().next().value!);
  snapshots.set(engine, { key, json, pages });
  return json;
}

/** Page navigation is view state, not a document edit. */
export function documentContentKey(engine: DocumentEngine): string {
  return engine.document_snapshot_key().split(":").slice(0, 2).join(":");
}
