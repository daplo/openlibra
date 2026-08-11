# MVP roadmap

This roadmap is designed for one developer. Each level produces a demonstrable increment and depends on the levels before it. A level is complete only when its exit criterion can be demonstrated, not merely when its code exists.

## Level 1: prove the technical foundation

Goal: remove the largest technical unknowns before building the application.

### Todos

- [x] Create a minimal Rust crate compiled to WebAssembly
- [x] Create a minimal TypeScript/React application that loads the WASM module
- [x] Initialize WebGPU and draw rectangles from Rust-owned scene data
- [x] Render 1,000 simple objects and record frame time on the reference laptop
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
- [x] Add reproducible development, build, formatting, linting, and test commands
- [x] Build the editor shell with toolbar, left panel, canvas, and right panel
- [x] Add Design, Developer, and Review mode switching
- [x] Add a full-window WebGPU canvas with resize and device-loss reporting
- [x] Implement viewport coordinates, pan, zoom, reset, and zoom-to-fit
- [x] Route pointer and keyboard input through one input layer
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
- [x] Enforce acyclic trees and page-ownership invariants
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
- [x] Persist document-level numeric variables for width, height, gap, and per-side padding
- [x] Persist reusable text styles and node-to-style references
- [x] Add a curated system-font catalog and lazily loaded Google Fonts catalog
- [ ] Add searchable font discovery and recent/favorite font sections
- [ ] Add permission-based local font discovery as progressive enhancement
- [ ] Persist font source, fallback stack, requested faces, and availability status
- [ ] Cache or bundle permitted web fonts for offline documents and deterministic export
- [ ] Show loading, missing-font, substituted-font, and unsupported-weight states
- [x] Give tokens stable IDs independent of their names
- [x] Add create, edit, rename, and delete workflows for numeric variables and text styles
- [ ] Add create, edit, rename, group, and delete workflows
- [x] Allow width, height, gap, padding, and typography values to reference tokens
- [ ] Resolve aliases safely and detect reference cycles
- [ ] Show where each token is used
- [x] Preserve a fallback value when a reference becomes unavailable
- [ ] Add initial light and dark token modes if the base model remains simple
- [x] Serialize tokens and references in document fixtures
- [ ] Update the sample design to use tokens instead of copied values

Exit criterion: changing a token updates every consuming node, and a small interface can be built without duplicating its core visual values.

## Level 7: establish local-first ownership and optional cloud persistence

Goal: make the local project file the durable source of ownership while allowing users to opt into recoverable cloud persistence.

### Todos

- [ ] Define a versioned, documented `.libra` project container with structured document data and bundled or referenced assets
- [ ] Open, save, duplicate, and recover projects from the local filesystem without an account or network connection
- [ ] Make local editing and standard export continue to work when cloud access or a subscription is unavailable
- [ ] Define a storage-provider boundary so document persistence is independent of collaboration transport
- [ ] Create the Rust HTTP/WebSocket backend as a modular monolith
- [ ] Add development authentication with a clear path to a production provider
- [ ] Model users, workspaces, memberships, and documents in PostgreSQL
- [ ] Add opt-in publish, list, rename, open, download, and archive document APIs
- [ ] Store document snapshots and revision metadata
- [ ] Add autosave with visible saving, saved, and error states
- [ ] Prevent accidental overwrites with revision checks
- [ ] Add schema migration on document load
- [ ] Add recovery from the latest valid snapshot
- [ ] Create local development infrastructure and seed data

Exit criterion: a user can create, close, reopen, and export a local project without an account, then optionally publish it and recover the same project from the server without surrendering the downloadable source file.

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
- [ ] Preserve a page-position fallback when an anchored node is moved or deleted
- [ ] Add threads, replies, resolution, and reopening
- [ ] Add mentions, assignment, unread state, and participant notifications
- [ ] Allow reviewers to attach a viewport or selected-node snapshot
- [ ] Record author, timestamps, document revision, and edit history for each message
- [ ] Define offline creation, retry, conflict, and deleted-anchor behavior
- [ ] Show comment activity in real time
- [ ] Add a conversation panel with filters for open, resolved, mine, and current page
- [ ] Make Review mode navigation-focused and editing-safe
- [ ] Add share permissions for owner/editor/viewer-commenter
- [ ] Define a forge-integration boundary for GitHub, GitLab, and compatible issue trackers
- [ ] Allow an authorized user to promote a comment thread into a linked repository issue
- [ ] Include the stable page/node anchor, project revision, review URL, and optional screenshot in a promoted issue
- [ ] Reflect linked issue status on the comment without making the issue tracker the source of truth for document state
- [ ] Build Developer mode inspection for bounds, spacing, layout, and constraints
- [ ] Display resolved token names and values
- [ ] Produce copyable CSS-like values for the selected node
- [ ] Add asset metadata and an initial download action where applicable
- [ ] Verify that modes change tools without creating separate document state

Exit criterion: a reviewer can leave anchored feedback while another user edits, an authorized user can promote that feedback into a traceable repository issue, and a developer can inspect a selected screen without entering Design mode.

## Level 10: add images, asset management, and export

Goal: make imported visual assets durable, editable, and exportable without compromising local ownership.

### Todos

- [x] Add a document-level media asset collection and reusable image/icon references
- [x] Add an initial searchable built-in SVG icon library
- [x] Import PNG, JPEG, and WebP up to 10 MB into the local document Vault
- [x] Add cover, contain, and fill controls for image nodes
- [ ] Move embedded MVP media sources into a content-addressed binary asset store
- [ ] Render media through native WebGPU textures; the MVP uses a synchronized canvas overlay
- [ ] Add image nodes with stable asset references, intrinsic dimensions, alt text, and crop state
- [ ] Import PNG, JPEG, WebP, GIF, and SVG with explicit size and safety limits
- [ ] Store local assets by content hash and deduplicate identical files
- [ ] Generate thumbnails without replacing original assets
- [ ] Add fill, fit, crop, tile, focal-point, opacity, and corner controls
- [ ] Preserve original files and show recoverable missing-asset states
- [ ] Make image decode, upload, cancellation, and failure states visible
- [ ] Define portable asset entries for the `.libra` project container
- [ ] Define export recipes by format, scale, density, theme, platform, and state
- [ ] Export a selected node, frame, page, or explicit slice
- [ ] Implement PNG and JPEG export at 1x, 2x, and custom scale
- [ ] Add SVG export for supported vector/text content with documented raster fallbacks
- [ ] Add PDF export for frames/pages after font and image embedding is deterministic
- [ ] Preserve transparency, color profile decisions, filenames, and overwrite behavior
- [ ] Bundle or outline fonts according to the export recipe and font license
- [ ] Run deterministic pixel fixtures for crop, opacity, shadows, text, and scaling

Exit criterion: a user can import an image, crop and reuse it, save and reopen the project offline, then export a selected frame at 1x and 2x with stable visual output.

## Level 11: add components and Vault libraries

Goal: let teams build reusable UI systems while keeping instances traceable and safely upgradable.

### Todos

- [ ] Add component definitions and instances with separate stable IDs
- [ ] Store instance-to-definition references without copying the entire subtree
- [ ] Add typed overrides for text, visibility, asset, token, and nested instance properties
- [ ] Add reset, detach, swap, and go-to-main-component actions
- [ ] Add component properties and a minimal variant model
- [ ] Prevent component and library dependency cycles
- [ ] Create a local Vault for images, icons, components, and token collections
- [ ] Add Vault search, tags, previews, grouping, rename, duplicate, archive, and usage inspection
- [ ] Define document-local, workspace, and published-library scopes
- [ ] Publish immutable library versions with semantic metadata and release notes
- [ ] Show available updates and preview override conflicts before upgrading instances
- [ ] Preserve the last resolved component when a library is unavailable
- [ ] Add copy/import workflows that explicitly include required assets and tokens
- [ ] Test nested instances, deleted definitions, overrides, version upgrades, and offline fallback

Exit criterion: a user can create a component, place and override instances, publish it to the Vault, consume it from another document, and safely preview and apply a later library update.

## Level 12: package, publish, and harden the MVP

Goal: make the complete vertical slice testable by other people and dependable outside the development environment.

### Todos

- [ ] Export a read-only static review bundle that can run on any static host
- [ ] Add an initial GitHub Pages publishing workflow for public Community projects
- [ ] Support a public review path that opens a prepared GitHub Issue without embedding repository credentials in the published site
- [ ] Add an onboarding sample document demonstrating all MVP workflows
- [ ] Run accessibility, error recovery, and unsupported-state passes
- [ ] Meet the 1,000-visible-object interaction target on the reference laptop
- [ ] Add end-to-end tests for the primary success scenario
- [ ] Deploy a private MVP environment with logging, backups, and basic monitoring

Exit criterion: an invited product team can create a responsive token-driven design, reuse a component and image, collaborate, comment, inspect implementation values, export an asset, recover the project locally or from the cloud, and publish a public static review build through GitHub Pages.

## Delivery order and dependencies

1. Finish core editing and layout invariants before introducing reusable definitions.
2. Complete typography, font fallback, and font embedding before promising deterministic PDF or SVG text export.
3. Build the content-addressed asset store before image nodes, Vault reuse, cloud upload, or portable export.
4. Ship local image placement and PNG export before generalized export recipes.
5. Stabilize tokens and assets before component definitions; stabilize component definitions before published libraries and upgrades.
6. Build local anchored threads before real-time delivery, notifications, or forge synchronization.
7. Keep every cloud feature optional: documents, referenced assets, fonts, and last-resolved library content must remain usable offline.

## Distribution, hosting, and ownership direction

Open Libra follows an ownership-first model: local creation is a complete Community workflow, and hosted services provide optional privacy, collaboration, reliability, and convenience.

### Community edition

- The downloadable application works locally without requiring an account
- Users retain ordinary project files in a documented, versioned format
- Public projects can be exported to any static host and published through GitHub Pages
- GitHub-connected reviewers can turn anchored feedback into repository issues
- The collaboration and storage services are designed to be self-hostable
- Storage adapters should prioritize local files, S3-compatible object storage, and WebDAV; traditional FTP is not a primary target

### Open Libra Cloud

- Users can explicitly publish a local project to a managed account
- Private, invitation-only review does not require clients to use GitHub
- Managed hosting provides real-time collaboration, version history, backups, storage, and issue synchronization
- A user can download the native project at any time
- Ending a subscription disables paid services, not access to local files or core export

### Enterprise and private deployment

- Organizations can self-host the Community services or purchase a managed private deployment
- Future enterprise work may include SSO, audit logs, retention controls, regional or customer-owned storage, support, and service guarantees
- Document storage remains separable from the collaboration service so an organization can retain files in infrastructure it controls

The intended product boundary is: public collaboration can remain free through static hosting and repository issues; private collaboration can be self-hosted or purchased from Open Libra Cloud.

## Definition of done for every level

- [ ] The exit criterion has a repeatable demo
- [ ] Relevant unit and integration tests pass
- [ ] Document fixtures remain backward compatible or have a tested migration
- [ ] New interactions have keyboard behavior and visible error states
- [ ] Performance-sensitive changes are measured against the benchmark document
- [ ] Architectural decisions and known limitations are documented

## MVP boundaries

The ten levels do not include full vector illustration, Figma import, interactive prototypes, seamless offline-to-online collaborative synchronization, production billing and organization administration, production-ready multi-provider self-hosting, enterprise compliance features, complete component-to-code mapping, or guaranteed Safari/Firefox/tablet support. These remain post-MVP work unless a technical spike shows they must influence the foundational model. Local file ownership and account-free editing are foundational MVP requirements rather than post-MVP features.
