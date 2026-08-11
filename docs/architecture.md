# Technical architecture

## Overview

The first implementation is a cloud-first browser application. A Rust engine compiled to WebAssembly owns editable document state and performance-sensitive editor behavior. A TypeScript/React shell owns browser UI and platform integration. A centralized backend persists data and orders collaborative edits.

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

React state may cache read models for presentation, but it must not become a second editable copy of the design document.

### Rendering

Start with WebGPU on current desktop Chrome and Edge. Keep a narrow renderer interface so another backend can be introduced without changing document semantics.

Use a retained scene, object-level dirty tracking, viewport culling, and GPU batching. HTML overlays are appropriate for text editing controls, comments, and accessibility surfaces, while designed content remains GPU-rendered.

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

Suggested prototype storage:

- PostgreSQL for users, workspaces, documents, revisions, comments, library metadata, and asset metadata
- Object storage for images, binary assets, and compressed snapshots
- An in-process real-time session manager for the first deployment
- Browser memory plus a lightweight local cache for fast reloads; offline editing is not promised

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
- WebGPU is the first rendering backend.
- The product is cloud-first, not offline-first.
- The collaboration server establishes operation order.
- Modes are projections over a shared model, not separate editors.
- Native file compatibility with Figma is deferred.

## Risks to prototype explicitly

- Text measurement and editing across DOM, WASM, and GPU boundaries
- WASM/JavaScript serialization and copying overhead
- Deterministic layout across clients
- Collaborative undo and concurrent tree edits
- GPU resource lifetime and device-loss recovery
- Schema migration for long-lived cloud documents
