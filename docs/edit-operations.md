# Edit operations, version 1

The Rust engine provides a local operation journal and an ordered-replica API. The
editor enables it for loaded/new documents and stores its actor UUID in tab session
storage. Reloading that tab restores its undo/redo eligibility. Actor IDs identify
history ownership; they are not authenticated users or access-control credentials.

## Engine boundary

- `enable_operations(actor_id)` enables journaling or selects the local actor.
- `operation_state_json()` returns document ID, actor ID, current revision, next
  actor sequence and the latest local validation/undo error.
- `apply_operation_json(envelope)` validates and atomically applies a typed command;
  it returns `{status, revision, operation_id}` or throws an error. Finish a native
  transaction before applying an external operation.
- `document_json()` includes `operation_history`. While a native transaction is
  open, it serializes the last committed document, preventing inconsistent autosaves.
- `load_json()` accepts legacy documents without history; when history is present,
  it validates its baseline, replays every entry, checks resolved effects and
  revision numbers, and compares the result to the saved head before accepting it.

TypeScript command/envelope types and `createOperation` are in
`apps/web/src/editor/operations.ts`; Rust owns validation and execution.

## Envelope and supported intent

```json
{
  "version": 1,
  "document_id": "<document UUID>",
  "operation_id": "<unique operation UUID>",
  "actor_id": "<actor UUID>",
  "sequence": 1,
  "base_revision": 0,
  "transaction_id": "<transaction UUID>",
  "command": {
    "type": "move_nodes",
    "page_id": "<page UUID>",
    "node_ids": ["<node UUID>"],
    "dx": 10,
    "dy": 0
  }
}
```

Supported commands are `create_node`, `delete_node`, `move_nodes`, `set_bounds`,
`resize_node`, `set_transform`, `set_properties`, `reparent_node`, `reorder_node`,
`batch`, `document_changes`, `undo`, and `redo`. Create supplies the complete native node including its
identity. Reparent keeps world-space placement; it does not trigger auto-layout.
Reorder uses the editor's existing target-sibling/parent behavior. Shadow IDs must
be stable and distinct. Native geometry normalization (including integer bounds)
remains in effect; this batch does not introduce fractional geometry.

A batch has one envelope/revision and one undo step. Nested batches allow at most
eight levels, with 1–1000 children per batch. History commands cannot be nested.
Each command must leave a valid intermediate document; a later failure rolls back
the entire batch, including sequence and history metadata.

## Ordering and conflicts

The current revision must equal `base_revision`, and sequence must be exactly the
next sequence for that actor. Accepted operations advance revision once. An exact
retry of an already accepted operation returns `duplicate` with its original
revision and changes nothing. Reusing its ID with different content is rejected.
Unknown versions, wrong document IDs, nil identities, missing objects, cycles,
invalid references, non-finite geometry and invalid paint/typography are rejected.
Semantic node commands reject locked target edits; explicit lock/unlock remains
available. Locks are editor affordances, not access-control boundaries; server
roles authorize document changes.

This is a strict ordered stream, not automatic merging of concurrent offline
commands. A stale caller must receive accepted edits and deliberately rebuild its
intent against the new revision. Reordering the arrival of stale commands does not
silently produce an alternative document. An identical accepted stream applied to
two engines produces the same document. Newly synchronized component children use
stable instance/slot-derived UUIDs.

## Undo and replay

Each accepted entry stores identity-addressed resolved changes, including derived
layout/component effects. Array indices never identify nodes. Undo is a new
operation referring to the actor's latest eligible operation; redo refers to its
latest undo. Inverses compare touched entities/properties with their expected
values before changing them. Other properties and objects remain intact. Arrays
such as paints/shadows are atomic; collection ordering additionally preserves
unrelated inserted IDs. Changes to old order members conflict. Deleting an object
that acquired foreign children fails final hierarchy validation.

A conflicting inverse changes neither document nor history stacks. The editor
shows the error instead of overwriting intervening work. Conflict detection is
value-based, not a claim of full causal/CRDT semantics. Replay checks effects with
exact JSON number round-tripping; absent properties and explicit null values have
distinct encodings.

## Compatibility and remaining work

The editor's common node commands emit typed intent. Native gesture transactions
and commands not yet represented as intent use `recorded_edit`, containing resolved
changes. That form is accepted only by the local adapter and validated file replay;
the external operation API rejects it. The main shared-editor adapter uses
`document_changes_json(baseline)` to construct an external `document_changes`
command for every committed action/gesture, covering all existing document entities.
This is resolved entity/property intent, not a dedicated semantic command for every
tool. Changes carry expected and desired values, and collection ordering is explicitly
allowlisted. Schema, history/session state, and active-page navigation cannot be
changed through that command. Unknown fields, orphaned entities, invalid references,
and invalid resulting documents reject the entire edit. Up to 10,000 changes are
accepted per operation; document changes cannot be nested in `batch`.

Document schema 9 and `.libra` wrapper version 1 remain unchanged. The optional
journal has its own version. Documents without journals start a fresh history when
enabled. Current readers reject damaged journals rather than silently discarding
history. Older readers may ignore the extra journal and lose history on save.

The operation document ID tracks a journal lineage; it is separate from the
IndexedDB project ID/storage revision. Downloads, local copies and recovery copies
retain that lineage in the local editor. Shared publication and **Make local copy**
explicitly start new histories, preserving artwork IDs but excluding source actor
history. Shared actor identities are issued by the service. Tab session storage
can still be cloned by a browser's duplicate-tab action; copied credentials belong
to the same actor and conflict through sequence/revision checks. Existing cross-tab save
conflict protection still applies.

Journals currently retain the full baseline and all accepted entries. Serialization,
validation and diffing scan the document; native gesture snapshots also copy it.
Checkpointing, bounded replay, log compaction, incremental patches and fresh
large-document operation benchmarks remain required before production collaboration.
Saved history includes deleted text/assets and must not be treated as a redacted
export. This original foundation batch added no transport or service. A subsequent
[collaboration service](collaboration-prototype.md) adds durable rooms, capability
roles, presence, and main-editor sharing. Account identity, production deployment,
and automatic offline merging remain unimplemented.

## Verification

`operation_tests.rs` covers replay, duplicate/identity/sequence/revision rejection,
atomic rollback, scoped undo/redo, foreign insertions, invalid geometry/locks,
nullable properties, persisted transactions and tampered history. Browser tests
exercise two independent WASM engines, an ordered stream, stale requests, retries,
undo/reload/redo and transaction-safe snapshots. The normal editor UI, rendering,
recovery and cross-tab suites also run with operations enabled.

Original foundation validation: 94 Rust tests, TypeScript, Clippy/ESLint, formatting,
production WASM/web build and the complete browser suite. Earlier rendering timing
measurements predate journaling and are not operation-performance claims.
