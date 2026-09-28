# Domain model

This document describes target entities and invariants. The current Rust schema is version 9; workspaces, durable comments, presence and network operation envelopes remain planned. The [audit and TODO](TODO.md) distinguishes implemented fields from target behavior.

## Ownership hierarchy

```text
User
└── Workspace
    ├── Documents
    │   ├── Pages
    │   │   └── Node trees
    │   ├── Local component definitions
    │   └── Asset references
    ├── Workspace asset vault
    └── Published libraries
        ├── Components and variants
        ├── Tokens
        └── Versions
```

## Core entities

### Workspace

Owns membership, documents, shared assets, and libraries.

### Document

A collaborative, revisioned product-design artifact. It owns pages, local resources, settings, and references to external libraries and vault assets.

### Page

A named canvas and root node list. Only active-page geometry needs to be materialized into the render scene.

### Node

All visible and structural objects derive from a common node identity. Current node kinds are frame, group, rectangle, text, image, icon and vector. Vector geometry includes ellipses, lines, polygons, stars and paths with Bezier handles. Path editing tools and stable sub-element identities remain planned.

A node has a client-generated UUIDv7 ID, parent/order information, transform,
visibility, lock state, style references, and kind-specific properties. Pages and
document-owned resources use the same ID format, allowing concurrent clients to
create entities without coordinating an integer sequence.

### Frame

A node that establishes bounds, clipping, layout behavior, and responsive constraints for descendants. Frames represent screens, regions, and component roots.

### Token collection

A typed collection of named values such as color, spacing, radius, typography, and size. Nodes refer to token IDs instead of copying names. Aliases and modes such as light/dark can be added without changing node identity.

### Component definition and instance

A definition owns a stable identity and structured properties/variants. An instance refers to a definition and stores overrides. Initially, definitions may be local; later, published library versions provide external definitions.

Stable identity is required now even though mapping a definition to a React or other code component is deferred.

### Asset

Metadata plus an immutable content-addressed binary object. Documents refer to an asset ID. Asset variants and export recipes should be separate records so one source can produce multiple formats, scales, densities, themes, platforms, or states.

### Comment thread

A durable discussion anchored to a document and page, optionally to a node and normalized canvas position. Threads have participants, messages, resolution state, and revision timestamps.

### Presence

Ephemeral per-session state: user identity, active page, cursor, viewport, selection summary, and mode. Presence is broadcast but not stored in document history.

## Operation model

Every durable mutation is represented as a typed operation with:

- Operation ID
- Document ID
- Actor/session ID
- Client sequence
- Base server revision
- Operation payload
- Assigned server revision after acceptance

Initial payload families include creating/deleting nodes, setting node properties, reparenting/reordering nodes, setting tokens, and adding/removing pages. Composite user commands may emit multiple atomic operations while preserving a transaction identity for history and undo.

## Invariants

- IDs are globally unique and never reused.
- IDs serialize as lowercase UUID strings; new IDs use UUIDv7.
- The page/node ownership graph is acyclic.
- A node belongs to exactly one page and at most one parent.
- A parent belongs to the same page and must be a frame or group.
- Deleting a container deletes its complete descendant subtree.
- Child ordering is deterministic.
- Token and asset references are by stable ID.
- Missing external resources degrade predictably instead of corrupting a document.
- Unknown schema fields survive a read/write cycle when feasible.
- Serialized documents carry an explicit schema version.
- Loading schema 1 deterministically migrates numeric IDs and their references
  to UUIDs; UUID strings were introduced in schema 2. Current writes use schema 9,
  with later migrations adding typography, resources, components and vector data.
- Invalid ownership graphs are rejected when a document is loaded.

## Resolved hierarchy transforms

Node bounds, rotation and flips are stored in world space. Rotating or flipping a frame/group applies its old-to-new frame transform to every descendant center and orientation, including nested containers. The command is atomic and undoable. Renderers consume the resolved values without applying ancestor rotation a second time. This preserves existing files and visual placement when reparenting or ungrouping. Auto-layout temporarily resolves descendants into the container's axes before placement and maps them back afterward; new children inherit those axes. This supports translation, rotation and reflection, not arbitrary shear matrices.

## Prototype room access and presence

The local collaboration prototype now persists a room-scoped owner plus editor/viewer
capability sessions. Session actor IDs own operation history; display names are
mutable metadata, not authenticated account identities. Invitations grant editor or
viewer roles until expiry/revocation for new joins. Changing/revoking a session is
a separate owner action enforced immediately by the server. Cursors, selections
and online state are ephemeral, expire independently, and never enter the document
journal. These prototype entities do not complete workspace/account authorization.
