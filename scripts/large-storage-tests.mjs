import assert from "node:assert/strict";
import { build } from "esbuild";
export async function testLargeStorage(browser, url) {
  const bundle = await build({
    entryPoints: ["apps/web/src/editor/recent-documents.ts"],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "storageTest",
  });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(url);
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const result = await page.evaluate(async () => {
      const json = JSON.stringify({ payload: "a".repeat(9 * 1024 * 1024) });
      const document = {
        id: crypto.randomUUID(),
        name: "Large.libra",
        json,
        updatedAt: 1,
        pageCount: 1,
        objectCount: 0,
        preview: { bounds: { x: 0, y: 0, width: 1, height: 1 }, nodes: [] },
      };
      const saved = await storageTest.storeRecentDocument(document, null);
      const read = await storageTest.getRecentDocument(document.id);
      const unchanged = await storageTest.storeRecentDocument(
        { ...saved, updatedAt: 2 },
        saved.revision,
      );
      let conflict = false;
      try {
        await storageTest.storeRecentDocument({ ...saved, name: "Stale" }, 0);
      } catch {
        conflict = true;
      }
      await storageTest.storeRecoverySnapshot({
        id: crypto.randomUUID(),
        documentId: document.id,
        name: document.name,
        json,
        createdAt: 1,
      });
      const recovered = await storageTest.listRecoverySnapshots(document.id);
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open("open-libra-documents", 2);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      const raw = await new Promise((resolve, reject) => {
        const r = db
          .transaction("recent-documents")
          .objectStore("recent-documents")
          .get(document.id);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      db.close();
      const listed = await storageTest.listStoredDocuments();
      const OriginalDecompressionStream = window.DecompressionStream;
      window.DecompressionStream = class {
        constructor() {
          throw new Error("Metadata must not decompress documents");
        }
      };
      const summaries = await storageTest.listProjectSummaries();
      const revision = await storageTest.getRecentDocumentRevision(document.id);
      window.DecompressionStream = OriginalDecompressionStream;
      return {
        metadataOnly:
          summaries.find((d) => d.id === document.id).json === "" &&
          revision === saved.revision,
        read: read.json === json,
        recovery: recovered[0].json === json,
        listed: listed.find((d) => d.id === document.id).json === json,
        unchanged: unchanged.revision === saved.revision,
        conflict,
        compressed:
          raw.json === "" &&
          raw.jsonGzip instanceof Blob &&
          raw.jsonGzip.size < 100000,
      };
    });
    assert.deepEqual(result, {
      metadataOnly: true,
      read: true,
      recovery: true,
      listed: true,
      unchanged: true,
      conflict: true,
      compressed: true,
    });
    console.log(
      "Large browser storage passed (compression, exact reads, recovery, lists, unchanged saves and conflict protection).",
    );
  } finally {
    await context.close();
  }
}
