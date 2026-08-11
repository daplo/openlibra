# MVP roadmap: 10 levels

This roadmap is designed for one developer. Each level produces a demonstrable increment and depends on the levels before it. A level is complete only when its exit criterion can be demonstrated, not merely when its code exists.

## Level 1: prove the technical foundation

Goal: remove the largest technical unknowns before building the application.

### Todos

- [x] Create a minimal Rust crate compiled to WebAssembly
- [x] Create a minimal TypeScript/React application that loads the WASM module
- [x] Initialize WebGPU and draw rectangles from Rust-owned scene data
- [ ] Render 1,000 simple objects and record frame time on the reference laptop
- [x] Implement pan and zoom in the spike
- [x] Measure batched scene creation and GPU upload traffic across the WASM boundary
- [x] Spike the DOM-overlay text-editing boundary
- [x] Simulate two clients applying concurrent property operations
- [x] Record chosen approaches and rejected alternatives as architecture decisions

Exit criterion: the browser renders and navigates 1,000 objects smoothly, and the WASM, text, rendering, and collaboration boundaries have documented approaches.

## Level 2: establish the product shell

Goal: create the application structure in which every later capability will live.

### Todos

- [x] Establish the Rust workspace and frontend package structure
- [ ] Add reproducible development, build, formatting, linting, and test commands
- [x] Build the editor shell with toolbar, left panel, canvas, and right panel
- [x] Add Design, Developer, and Review mode switching
- [x] Add a full-window WebGPU canvas with resize and device-loss reporting
- [x] Implement viewport coordinates, pan, zoom, reset, and zoom-to-fit
- [ ] Route pointer and keyboard input through one input layer
- [x] Add diagnostics for FPS, visible objects, scene creation, upload, and render time
- [x] Add renderer errors and an unsupported-browser message

Exit criterion: the application opens into a stable editor shell, switches modes, and supports reliable canvas navigation.

## Level 3: model documents, pages, and layers

Goal: make a versioned Rust document the single source of truth.

### Todos

- [x] Define stable IDs and a versioned document schema
- [x] Implement documents containing multiple named pages
- [x] Define node types for frames, groups, rectangles, and text placeholders
- [x] Store parent relationships in deterministic document order
- [ ] Enforce acyclic trees and page-ownership invariants
- [x] Build a retained render scene from the active page
- [ ] Add viewport culling and object-level dirty tracking
- [x] Build the Pages and Layers panels from engine read models
- [ ] Support create, rename, reorder, and delete for pages and layers
- [x] Add deterministic JSON serialization and round-trip tests

Exit criterion: a user can create a multi-page document, organize a visible layer hierarchy, reload a serialized fixture, and receive the same document.

## Level 4: implement core editing

Goal: make the canvas feel like a real direct-manipulation editor.

### Todos

- [ ] Implement spatial indexing and point/area hit testing
- [ ] Add single, multi, marquee, and layer-panel selection
- [ ] Draw selection bounds and resize handles
- [ ] Implement move and resize with canvas transforms
- [ ] Add grouping, ungrouping, reparenting, and layer reordering
- [ ] Add delete, duplicate, copy, paste, and keyboard nudging
- [ ] Add snapping to frame edges, centers, and nearby objects
- [ ] Express every mutation as a typed command
- [ ] Implement local command transactions and undo/redo
- [ ] Property-test tree invariants and command inversion

Exit criterion: a user can assemble and reorganize a small screen using familiar selection and transform interactions, then undo and redo the work reliably.

## Level 5: add frames, layout, and constraints

Goal: support structured web and mobile interface composition.

### Todos

- [ ] Define frame presets for common web and mobile viewport sizes
- [ ] Add horizontal and vertical stack/flex-style layout
- [ ] Add gap, padding, alignment, distribution, and wrapping controls
- [ ] Add fixed, content-sized, and fill-available sizing modes
- [ ] Add responsive constraints for non-layout children
- [ ] Support absolute positioning inside layout frames
- [ ] Recompute only affected layout subtrees after edits
- [ ] Surface layout and constraint controls in Design mode
- [ ] Show layout spacing and constraint overlays on the canvas
- [ ] Add deterministic layout fixtures and performance benchmarks

Exit criterion: resizing a frame produces predictable responsive behavior for a realistically structured application screen.

## Level 6: add design tokens

Goal: make reusable design-system values part of the document model.

### Todos

- [ ] Define typed color, spacing, size, radius, and typography tokens
- [ ] Give tokens stable IDs independent of their names
- [ ] Add create, edit, rename, group, and delete workflows
- [ ] Allow node properties and layout values to reference tokens
- [ ] Resolve aliases safely and detect reference cycles
- [ ] Show where each token is used
- [ ] Preserve a fallback value when a reference becomes unavailable
- [ ] Add initial light and dark token modes if the base model remains simple
- [ ] Serialize tokens and references in document fixtures
- [ ] Update the sample design to use tokens instead of copied values

Exit criterion: changing a token updates every consuming node, and a small interface can be built without duplicating its core visual values.

## Level 7: persist documents in the cloud

Goal: move from a local editor prototype to a recoverable cloud product.

### Todos

- [ ] Create the Rust HTTP/WebSocket backend as a modular monolith
- [ ] Add development authentication with a clear path to a production provider
- [ ] Model users, workspaces, memberships, and documents in PostgreSQL
- [ ] Add create, list, rename, open, and archive document APIs
- [ ] Store document snapshots and revision metadata
- [ ] Add autosave with visible saving, saved, and error states
- [ ] Prevent accidental overwrites with revision checks
- [ ] Add schema migration on document load
- [ ] Add recovery from the latest valid snapshot
- [ ] Create local development infrastructure and seed data

Exit criterion: an authenticated user can create a document, edit it, close the browser, and later recover the same document from the server.

## Level 8: add real-time multiplayer

Goal: make two people safely edit the same document.

### Todos

- [ ] Define a versioned operation protocol shared by client and server
- [ ] Add a server-authoritative WebSocket operation stream per document
- [ ] Apply local commands optimistically and reconcile acknowledgements
- [ ] Assign server revisions and reject invalid operations
- [ ] Broadcast accepted operations in deterministic order
- [ ] Add reconnect, missed-operation replay, and snapshot fallback
- [ ] Add ephemeral presence, active page, cursor, and selection summaries
- [ ] Render named multiplayer cursors without persisting them
- [ ] Implement collaborative undo as compensating operations
- [ ] Test concurrent property edits, reorder, reparent, delete, and reconnect

Exit criterion: two browser sessions can edit one document, see each other's cursors, survive reconnects, and converge on the same serialized state.

## Level 9: complete review and developer workflows

Goal: close the feedback loop around the shared design artifact.

### Todos

- [ ] Add comment pins anchored to a page position or stable node ID
- [ ] Add threads, replies, resolution, and reopening
- [ ] Show comment activity in real time
- [ ] Make Review mode navigation-focused and editing-safe
- [ ] Add share permissions for owner/editor/viewer-commenter
- [ ] Build Developer mode inspection for bounds, spacing, layout, and constraints
- [ ] Display resolved token names and values
- [ ] Produce copyable CSS-like values for the selected node
- [ ] Add asset metadata and an initial download action where applicable
- [ ] Verify that modes change tools without creating separate document state

Exit criterion: a reviewer can leave anchored feedback while another user edits, and a developer can inspect a selected screen without entering Design mode.

## Level 10: add reusable assets and harden the MVP

Goal: demonstrate the component-library direction and make the complete vertical slice testable by other people.

### Todos

- [ ] Add local component definitions and instances with stable IDs
- [ ] Add a minimal variant-property model and instance overrides
- [ ] Add a workspace vault for image and reusable asset metadata
- [ ] Store uploaded binaries by content hash in object storage
- [ ] Place and render images referenced from the vault
- [ ] Define export recipes by format, scale, density, theme, platform, and state
- [ ] Implement one end-to-end export path, such as PNG at 1x and 2x
- [ ] Prototype publishing a component/token set as a versioned library
- [ ] Add an onboarding sample document demonstrating all MVP workflows
- [ ] Run accessibility, error recovery, and unsupported-state passes
- [ ] Meet the 1,000-visible-object interaction target on the reference laptop
- [ ] Add end-to-end tests for the primary success scenario
- [ ] Deploy a private MVP environment with logging, backups, and basic monitoring

Exit criterion: an invited product team can create a responsive token-driven design, reuse a component and image, collaborate, comment, inspect implementation values, export an asset, and recover the cloud document in a later session.

## Definition of done for every level

- [ ] The exit criterion has a repeatable demo
- [ ] Relevant unit and integration tests pass
- [ ] Document fixtures remain backward compatible or have a tested migration
- [ ] New interactions have keyboard behavior and visible error states
- [ ] Performance-sensitive changes are measured against the benchmark document
- [ ] Architectural decisions and known limitations are documented

## MVP boundaries

The ten levels do not include full vector illustration, Figma import, interactive prototypes, offline-first editing, production billing and organization administration, complete component-to-code mapping, or guaranteed Safari/Firefox/tablet support. These remain post-MVP work unless a technical spike shows they must influence the foundational model.
