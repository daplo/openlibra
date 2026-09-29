import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
const require = createRequire(import.meta.url);
const {
  DocumentEngine,
} = require("../target/collaboration-wasm/open_libra_scene_wasm.js");
const bundle = await build({
  entryPoints: ["apps/web/src/editor/document-snapshot.ts"],
  bundle: true,
  write: false,
  format: "esm",
});
const { serializeDocument } = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
const engine = DocumentEngine.new_blank();
try {
  const first = JSON.parse(engine.read_model_json()).active_page_id;
  const node = engine.add_rectangle();
  const second = engine.add_page("Second");
  engine.enable_operations(randomUUID());
  let serializations = 0;
  const tracked = {
    document_snapshot_key: () => engine.document_snapshot_key(),
    document_json: () => {
      serializations++;
      return engine.document_json();
    },
  };
  const verify = () =>
    assert.deepEqual(
      JSON.parse(serializeDocument(tracked)),
      JSON.parse(engine.document_json()),
    );
  verify();
  for (const id of [first, second, first, second]) {
    engine.set_active_page(id);
    verify();
  }
  assert.equal(
    serializations,
    1,
    "Navigation must reuse the committed document and journal",
  );
  engine.set_active_page(first);
  engine.begin_transaction();
  engine.set_node_bounds(node, 30, 40, 100, 100);
  verify();
  assert.equal(
    serializations,
    1,
    "During a gesture saves must expose the committed baseline",
  );
  engine.end_transaction();
  verify();
  assert.equal(serializations, 2);
  engine.undo();
  verify();
  engine.redo();
  verify();
  const loaded = DocumentEngine.load_json(serializeDocument(tracked));
  loaded.free();
  const untracked = DocumentEngine.new_blank();
  try {
    const before = serializeDocument(untracked);
    untracked.add_rectangle();
    assert.notEqual(serializeDocument(untracked), before);
  } finally {
    untracked.free();
  }
  console.log(
    "Document snapshot tests passed: navigation caching, transaction baseline, edits, undo/redo, reload, untracked engines.",
  );
} finally {
  engine.free();
}
