# Technical architecture

## Overview

The current implementation is an account-free local browser editor. A Rust engine compiled to WebAssembly owns editable document state and performance-sensitive editor behavior; a TypeScript/React shell owns UI and browser integration. Documents are downloaded as `.libra` files and autosaved in IndexedDB.

The target architecture adds an optional centralized backend for shared persistence and ordered collaborative edits. That backend, authentication, comments and presence are not implemented. The diagram and service sections below describe the target, not deployed capabilities. See [TODO.md](TODO.md) for the source audit, dependencies and the expanded UI/vector direction.

```text
React + TypeScript application shell
  panels, menus, comments, auth, browser events
                    |
          batched commands and views
                    |
Rust editor engine compiled to WebAssembly
  document model, layout, constraints, selection,
  transforms, undo/redo, hit testing, spatial index
                    |
             render scene updates
                    |
           WebGPU renderer and canvas

Browser client <-- WebSocket --> collaboration service
       |                              |
       +---------- HTTP API ----------+
                                      |
                         snapshots, operations, metadata,
                         comments, users, assets, libraries
```

## Architectural boundaries

### Rust/WASM editor engine

The engine is the authoritative document model inside a client session. It should own:

- Nodes, pages, tokens, component definitions, and references
- Layout and constraint evaluation
- Selection and transformation logic
- Hit testing and spatial indexing
- Commands, inverse operations, undo, and redo
- Validation and deterministic serialization
- Construction of retained render-scene data

The engine API should accept coarse commands and return batched changes. Avoid property-by-property calls across the JavaScript/WASM boundary.

### TypeScript/React shell

The shell should own:

- Application chrome and mode-specific panels
- Authentication, routing, dialogs, and keyboard routing
- Pointer, clipboard, accessibility, and other browser APIs
- Comments and presence presentation
- Network connection lifecycle
- Translating UI intent into engine commands

Canvas pointer and wheel events plus global editor shortcuts enter through one
`EditorInputController`. It owns browser listener lifecycles, ignores shortcuts
while editable controls have focus, and routes normalized intent to the renderer
or engine-facing application callbacks. Component-local form and outside-click
handlers remain with their components.

React state may cache read models for presentation, but it must not become a second editable copy of the design document.

### Rendering

Start with WebGPU on current desktop Chrome and Edge. Keep a narrow renderer interface so another backend can be introduced without changing document semantics.

Ordinary documents and selected-frame PNG exports share `editor/scene-painter.ts`, a Canvas2D painter for mixed content in sibling/tree order, rounded frame clipping, isolated subtree opacity, per-node rotation/flips, text, media, vectors, strokes and shadows. Editor guides and selection remain separate overlays. Explicit synthetic benchmark pages containing only flat rectangles retain the WebGPU path; their timings do not establish mixed-document performance. Static canvas content is redrawn only when the scene, resources or viewport changes.

Bounds and orientation remain resolved in world space for file compatibility. Container rotation/flips apply the change of basis to every descendant once in Rust; rendering does not multiply ancestor transforms again. New children inherit the parent frame, auto-layout computes positions in that frame, and component sync maps source geometry into the instance frame. Reparenting preserves visual placement. PNG applies the inverse root-frame transform to the entire exported subtree.

Shadow masks use vector fill rules, glyphs, image alpha and open strokes. Euclidean distance transforms implement signed spread without inventing holes in nonzero path unions. Wrapped text justifies non-final paragraph lines. Fonts can fall back when unavailable; rich text shaping and font packaging remain separate work.

Prepared scene trees, paths, conservative bounds and effect tiles are reused between camera changes. Documents with at least 2,000 nodes use a raster-tile cache during interaction, with density at least that of the viewport. Edits, active-text changes and resource loads invalidate it. PNG always paints directly at the requested scale. Live in-place geometry edits carry an explicit revision to prevent stale frames. Diagnostics and Fit use all node kinds.

Retained caches are bounded to 32 MiB for scene tiles, 16 MiB for effects and 32 MiB for reusable opacity surfaces. Active opacity surfaces are cropped to visible subtree bounds and limited to 64 MiB; transparent single-child groups collapse without extra isolation. Shadow scratch tiles are limited to 16 megapixels. Excessive effect allocations produce a visible error rather than silently omitting the effect. These limits are separate from the PNG limit of 16,384 pixels per side and 64 megapixels. Missing/undecodable export media also produces an error.

The target is consistent document paint order, ancestor clipping, transforms and effects across every content type and export. Retained scene updates and ordered rendering passes should be measured before choosing a fully GPU-rendered implementation. HTML overlays remain appropriate for active editing, comments and accessibility.

### Cloud backend

For the prototype, prefer a modular monolith over independently deployed services. Logical modules can later separate without imposing operational overhead now:

- Authentication and workspaces
- Document snapshots and operation log
- Real-time document sessions
- Presence and cursors
- Comments
- Assets and libraries

A Rust backend is a good default because it can share domain types and validation logic with the editor, although shared crates must not tightly couple browser and server concerns.

## Collaboration model

Use a centralized, server-authoritative operation stream rather than beginning with a fully decentralized CRDT.

1. A client downloads a document snapshot and its revision.
2. Local commands are applied optimistically by the WASM engine.
3. Serializable operations are sent over a WebSocket.
4. The server validates and assigns a monotonically ordered revision.
5. All connected clients apply the ordered operation.
6. Periodic snapshots bound replay time.

Property updates can use last-writer-wins semantics at an explicit property boundary. Structural operations need stable node IDs, ordered child positions, cycle prevention, and deterministic handling of concurrent reparenting. Presence and cursors are ephemeral and should not enter the durable document history.

Comments should use conventional durable storage and reference stable document, page, node, and optional canvas-position identifiers. They do not need to share the high-frequency document operation path.

## Undo and redo

Undo is local-user intent expressed as new collaborative operations; it is not a global rewind. Each accepted command records sufficient prior values to produce a compensating command. Remote edits must not be removed from another user's history.

This behavior must be tested early because undo, structural editing, and collaboration affect one another.

## Persistence

Current local storage uses `.libra` downloads and IndexedDB project/recovery records. Local ownership remains foundational; browser storage is not a backup, and offline cold startup/font availability still need work.

Suggested optional service storage:

- PostgreSQL for users, workspaces, documents, revisions, comments, library metadata, and asset metadata
- Object storage for images, binary assets, and compressed snapshots
- An in-process real-time session manager for the first deployment
- Browser persistence for local ownership and recovery; disconnected shared edits require explicit reconciliation or a recoverable fork, not silent snapshot overwrites

## Suggested repository shape

```text
apps/
  web/                 React application
  server/              Rust HTTP and WebSocket backend
crates/
  document/            domain types and invariants
  editor-engine/       commands, selection, transforms, history
  layout/              layout and constraints
  renderer/            retained scene and WebGPU abstraction
  protocol/            network operations and versioning
docs/
```

## Early architectural decisions

- Rust/WASM owns client-side document truth.
- React/TypeScript owns the application UI.
- One TypeScript input controller owns canvas gestures and editor shortcuts.
- WebGPU is the first rendering backend.
- The product preserves local file ownership and account-free editing; shared storage and collaboration are optional. Seamless offline collaborative merging is not yet promised.
- The collaboration server establishes operation order.
- Modes are projections over a shared model, not separate editors.
- Partial `.fig` import exists; full fidelity and native round-trip compatibility are not promised.

## Risks to prototype explicitly

- Text measurement and editing across DOM, WASM, and GPU boundaries
- WASM/JavaScript serialization and copying overhead
- Deterministic layout across clients
- Collaborative undo and concurrent tree edits
- GPU resource lifetime and device-loss recovery
- Schema migration for long-lived local and shared documents
- Stable vector anchor/contour identities and concurrent path editing
- Shared paint, transform, clipping and font semantics across canvas and export

## Implemented operation boundary

`operations.rs` owns versioned commands, atomic application, actor sequence/revision
checks and replay. `operation_patch.rs` stores identity-addressed resolved effects
and applies compare-and-swap inverses. `DocumentEngine` adapts the editor's native
commands/transactions and persists the optional journal. Common node edits use
typed commands; remaining native edits use local/replay-only resolved patches.
This is the shared editing foundation, with no collaboration transport or service.
The complete contract and remaining limitations are in [edit operations](edit-operations.md).

## Development collaboration service

The [two-client prototype](collaboration-prototype.md) hosts a Node-target build of
the same Rust/WASM engine in `scripts/collaboration-server.mjs`. HTTP POST orders
commands synchronously; authenticated fetch/SSE streams distribute accepted envelopes
and initial snapshots. `editor/collaboration.ts` maintains the confirmed replica and
one separately retained unacknowledged intent. The dedicated rectangle screen uses
this adapter; the full local editor remains independent. The prototype server binds to loopback. Its CLI persists validated room snapshots
and access metadata through `collaboration-storage.mjs`; the test harness can still
run without storage. Accepted edits and permission changes commit to private files
before publication. SSE also carries live role changes and ephemeral presence, with
server-side permission checks on every request. Full account/workspace architecture
and PostgreSQL/object storage remain planned.
