# Open Libra: implementation audit and feature TODO

Baseline audit: 2026-09-27. Collaboration status updated 2026-09-28; the scoped release checklist is [mvp.md](mvp.md).
This is the active implementation backlog. [roadmap.md](roadmap.md) defines the
design and collaboration milestones, delivery order and release gates. The audit
below records the implementation baseline; task checkboxes track remaining work.

## Product direction

Build one tool for interface design **and** vector illustration: responsive screens,
components, and prototypes alongside editable icons, logos, diagrams, and artwork.
The same artwork should remain editable when placed inside a UI component, shared
with collaborators, or exported. Avoid separate drawing and UI document formats.

Preserve account-free local projects and downloadable `.libra` files. Add optional
shared documents, review, and hosted/self-hosted services. UI mode is a workspace
preference; server permissions determine what a person may actually do.

Initial target: digital product and brand design. Professional print production and
advanced illustration follow the first useful collaborative release. This is a
proposed delivery sequence, not a claim of Figma or Illustrator feature parity.

## What is implemented

“Implemented” below means a source-backed local capability exists. “Partial” means
there is useful functionality but the broader workflow is unfinished. Passing
existing tests does not establish visual fidelity, production readiness, or support
for every document. Evidence paths are relative to the repository root.

| Area                 | Current implementation                                                                                                                                                                    | Remaining boundary                                                                                                                                                          | Evidence                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Engine and document  | Rust/WASM owns schema 9 documents, UUID identities, pages, node trees, validation, migrations, serialization                                                                              | Durable ordered operation journal; remaining tools use resolved entity/property changes rather than individual semantic commands                                            | `crates/scene-wasm/src/{lib,model,document}.rs`                                              |
| Editor shell         | Design/Developer/Review switching, panels, themes, rulers, grid, toolbar position, diagnostics, pan/zoom                                                                                  | Review is a placeholder; modes are not access control                                                                                                                       | `apps/web/src/App.tsx`, `editor/input.ts`, `components/EditorChrome.tsx`                     |
| Editing              | Single/multi/marquee selection, move/resize, rotation/flips, alignment, grouping/ungrouping, reordering, artboard reparenting, locking, duplication, snapping, local undo                 | Copy/paste stores node IDs and duplicates within the current document; general spatial index and geometry-accurate path selection are missing                               | `App.tsx`, `crates/scene-wasm/src/{edit,lib}.rs`                                             |
| Pages                | Create, rename, switch, delete; nested layer panel                                                                                                                                        | No page-reorder API found; no persistent node visibility field                                                                                                              | `components/EditorSidebar.tsx`, `lib.rs`, `model.rs`                                         |
| Appearance           | Solid fill/stroke, corner radii, opacity, inner/outer shadows, editable shape masks                                                                                                       | No gradient/multiple-paint model, raster alpha masks, or blend-mode workflow; renderer/export fidelity needs work                                                           | `model.rs`, `components/PropertiesPanel.tsx`                                                 |
| Layout               | Row/column layout, gap, per-side padding, start/center/end alignment and justification, fixed/fill width, auto height, spacing overlays                                                   | No wrapping, complete two-axis hug/fill, responsive constraints, absolute layout children, or general grid layout                                                           | `crates/scene-wasm/src/layout.rs`                                                            |
| Typography           | Editable text, font family/weight/size, line height, tracking controls, sizing, text styles, curated system/Google fonts                                                                  | No rich text ranges, deterministic shaping/embedding, or full loading/missing-font handling; justify currently draws as left aligned                                        | `editor/font-catalog.ts`, `components/CanvasOverlays.tsx`, `model.rs`                        |
| Tokens               | Numeric variables and reusable text styles with stable references, propagation and fallback; saved color swatches                                                                         | Colors are not bound semantic tokens; aliases, modes, radius/color bindings and usage inspection are missing                                                                | `edit.rs`, `model.rs`, `components/PropertiesPanel.tsx`                                      |
| Vectors              | Native ellipse, line, polygon, star and path data; Bezier handles in schema; pen and single-anchor editing, parameter controls, conversion to paths, fill rules, single-vector SVG export | Multi-point selection, boolean operations and advanced illustration tools remain                                                                                            | `model.rs`, `edit.rs`, `components/ShapeMenu.tsx`, `editor/export-vector.ts`                 |
| Components           | Local definitions, named variants, instances, source propagation, text/asset override flags, reset/detach/swap/go-to-main                                                                 | Instances copy subtrees; no full typed properties, variant axes, nested override contract, published versions or cross-document upgrades                                    | `edit.rs`, `model.rs`, `components/LibraryView.tsx`                                          |
| Media and Vault      | PNG/JPEG/WebP import, embedded sources, reusable images/icons, searchable built-in icon catalog, cover/contain/fill                                                                       | No content-addressed binary store, crop/focal-point editor, complete asset management or portable font package                                                              | `editor/media-source.ts`, `App.tsx`, `components/LibraryView.tsx`                            |
| Local projects       | `.libra` envelope, legacy reads, download/open, IndexedDB autosave/recovery, recent project previews, duplicate/archive                                                                   | Download is not writing back to the original file; browser storage is not backup or cloud sync; snapshot previews are simplified; browser data can still be cleared         | `editor/{project-format,recent-documents}.ts`, `App.tsx`                                     |
| Import/export        | Partial `.fig` import; selected-frame PNG with scales; selected-vector SVG                                                                                                                | Figma vectors may become SVG image assets and components may become groups/images; no native round-trip fidelity, general SVG import, full-document SVG, JPEG or PDF export | `editor/{figma-import,export-frame,export-vector}.ts`                                        |
| Developer handoff    | Bounds/layout/token inspection and copyable CSS-like snippets                                                                                                                             | Not production code generation; CSS values and unit fidelity need fixtures                                                                                                  | `components/EditorChrome.tsx`                                                                |
| Rendering            | Shared Canvas2D document/PNG painter; WebGPU synthetic rectangle benchmarks; DOM text editor                                                                                              | Cold-cache rebuilds remain more expensive than steady pan/zoom; SVG/PDF parity and arbitrary affine transforms remain open                                                  | `renderer.ts`, `components/CanvasOverlays.tsx`, `crates/scene-wasm/src/scene.rs`             |
| Collaboration/cloud  | Main-editor shared documents, durable local service, invitations/roles, presence, scoped undo and reconnect recovery                                                                      | No account identity/recovery, workspaces, comments, bounded replay or production deployment                                                                                 | `scripts/collaboration-server.mjs`, `editor/shared-editor.ts`, `components/SharedEditor.tsx` |
| Distribution/testing | Rust tests, TypeScript checks, browser UI script, performance script, app deployment workflow for GitHub Pages                                                                            | App deployment is not per-project static review publishing or a collaboration backend                                                                                       | `scripts/`, `.github/workflows/deploy-pages.yml`                                             |

### Important corrections to the old documentation

- The README's Level 1-only description understated the current implementation.
- Cloud-first statements conflicted with the later ownership-first roadmap and the actual local-only persistence.
- “Figma import deferred” and “no vector workflows” no longer describe the code: partial import and vector foundations exist.
- Layout, component variants and SVG export must be split into implemented subsets and remaining work.
- Checked page/layer CRUD does not demonstrate page reordering; checked culling/dirty tracking does not prove a general incremental renderer.
- The old “ten levels” boundary followed twelve levels. The new milestones below replace that sequence.
- The recorded 1K rectangle benchmark is historical evidence, not a current mixed text/image/path performance guarantee.

## Release sequence

Priorities: **P0** protects work and establishes shared semantics; **P1** is required
for the first useful hybrid release; **P2** expands professional workflows; **P3**
is a later specialization. Every unchecked item below is remaining work, including
hardening of existing features. IDs are stable issue seeds; split them into smaller
implementation issues when starting an epic.

| Milestone                            | Scope                             | Demonstrable exit criterion                                                                                                                             |
| ------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 — trustworthy local foundation    | A, B; baseline from N             | More than 12 projects survive; save/reopen and recovery preserve mixed content; canvas and exports agree on supported visuals                           |
| M1 — useful UI and vector authoring  | C, D, E, F, local work in G and H | Draw a curved icon, combine shapes, use it in a token-driven responsive component, and export/reopen without losing editability                         |
| M2 — collaborative alpha             | I, J, shared work in G            | Two authorized users edit the same document, reconnect and converge; a commenter gives anchored feedback; one user's undo preserves the other's changes |
| M3 — product-team release            | K, L, M and release checks in N   | Prototype, review, approve and hand off a small product; publish a static review bundle or use private shared review; retain the downloadable project   |
| M4 — advanced illustration and scale | P2/P3 extensions                  | Advanced vector/print workflows and larger documents meet separately defined fidelity and performance gates                                             |

Dependencies are semantic, not a requirement to finish all authoring before working
on collaboration. Specify operations and vector point identities in M0; validate a
two-client edit/reconnect slice before expanding advanced tools. Reuse the existing
server-authoritative direction unless measured experiments justify replacing it.

## A. Project ownership, storage and recovery — P0 / M0

- [x] **A1** Keep all stored projects and recovery snapshots independently of recency. The Library lists all browser projects; only the quick switcher is capped. Browser tests cover saving beyond 12 projects and recovery after reload.
- [x] **A2** Add visual recovery history with dates, page counts, simplified thumbnails/page preview, cancel, loading/empty/error states and retry. Implemented: distinct browser-save/download-request states, unsaved-close protection, visible save failures with retry/download, recovery into a separate project, confirmed permanent deletion, serialized same-tab saves and atomic cross-tab revision checks with notifications/reload/save-as-copy. Browser tests cover simultaneous writes without notifications, legacy records, deletion and recovery across tabs.
- [ ] **A3** Define a storage-provider API for local records/files and optional remote snapshots. Add direct file save where supported, with download fallback and clear copy/overwrite behavior.
- [ ] **A4** Version a portable asset container: content hashes, deduplication, original binaries, manifest validation, missing-resource reporting and migrations from embedded schema-9 sources. Package fonts only when permitted.
- [ ] **A5** Provide a distributable/cached app for cold offline startup; test offline reload and missing remote fonts. An already-open local editor alone is not an offline installation guarantee.
- [ ] **A6** Define local document identity versus shared document identity, publish/download/fork behavior, and backup/restore. Restoring an old snapshot must not silently replace newer shared edits.

**Acceptance:** create 13 projects, restart, recover an earlier revision, reopen a
portable project without a network, and exercise storage failure without losing the
last good copy. Depends on H for asset completeness.

## B. Document operations and rendering correctness — P0 / M0

- [ ] **B1** Introduce typed, versioned operations for every durable edit: create/delete, properties, hierarchy/order, paths, tokens, components and assets. Include operation ID, actor, sequence, base revision and transaction ID.
- [ ] **B2** Define stable identities for contours, anchors, paints and component properties before point-level collaboration. Define concurrent delete/edit/reparent/order rules and migrate legacy geometry.
- [ ] **B3** Share validation between local commands, imports and future server operations. Reject cycles, invalid references and non-finite geometry; add generated invariant/inversion tests and malformed document fixtures.
- [ ] **B4** Rigid hierarchy transforms, clipping and paint order now have a documented world-space contract. Remaining: arbitrary affine/local-matrix representation, persistent visibility, and fractional dimensions with an explicit pixel-snap option.
- [x] **B5** Shared canvas/PNG document order, frame clipping, isolated subtree opacity and silhouette-based effects. Container rotation/flips propagate through nested descendants in the world-space model; layout, component sync, hit testing and PNG follow that contract. Prepared geometry, bounded caches, mixed-document benchmarks and pixel/interaction regressions cover the implementation.
- [ ] **B6** Canvas/PNG parity tests implemented (mixed media, text, vectors, clipping, opacity, nested transforms, shadows, stroke alignment, image alpha, fill rules and 1x/2x PNG); tile-boundary and live-edit regressions also pass. SVG/PDF parity remains open. Original scope: Share geometry, paint and text semantics with PNG/SVG/PDF export. Add mixed-node fixtures for overlap, nested transforms, strokes, shadows, clipping and transparency; report unsupported effects rather than silently dropping them.
- [ ] **B7** All-content culling, rounded ancestor clipping in hit tests and bounded raster caches are implemented. Remaining: general spatial indexing, exact stroke/fill-aware hit tests, incremental dirty-tile/scene updates and recoverable GPU device loss.

**Acceptance:** a layered text/image/vector fixture looks and selects consistently
before/after reload and export; transactions undo correctly; reordered concurrent
operations have documented deterministic outcomes.

**Implemented foundation:** the [ten-task operation batch](roadmap.md#completed-batch-edit-operation-foundation-2026-09-27) adds node intent, strict ordered revisions, persisted replay and actor-scoped inverse operations. B1–B3 stay open: vector/asset/token/component intent, sub-element identities, comprehensive invariants and server integration are unfinished. See [the protocol contract](edit-operations.md).

## C. Core canvas productivity — P1 / M1

- [ ] **C1** Add persistent layer visibility, page reorder/duplicate, layer search/filter, isolation/drill-in, select-through and breadcrumb navigation.
- [ ] **C2** Implement a real selection clipboard payload containing nodes plus dependencies; support cross-page, cross-document and cross-tab paste, paste-in-place and plain SVG/image clipboard input.
- [ ] **C3** Complete multi-object resize/rotation, transform origin, aspect/angle constraints, scale-strokes/effects choice, distribute and equal-spacing actions.
- [ ] **C4** Add draggable guides, configurable snapping, distances, pixel preview, zoom-to-selection and an outline view for inspecting paths and hidden overlaps.
- [ ] **C5** Add a command search, discoverable shortcuts, consistent Escape/cancel and keyboard equivalents for layer/canvas operations.

**Acceptance:** assemble and reorganize a multi-artboard design using keyboard and
pointer, copy a component with its resources into a second project, and undo each
user action as one transaction. Depends on B and A4 for portable resources.

## D. Responsive interface layout — P1 / M1

- [ ] **D1** Complete fixed/hug/fill on both axes, min/max sizes, aspect ratios and nested layout propagation.
- [ ] **D2** Add wrapping, space-between/around distribution, baseline alignment and per-child alignment overrides.
- [ ] **D3** Add left/right/top/bottom/center/scale constraints and absolute children inside auto layout; expose frame clipping and overflow behavior.
- [ ] **D4** Add responsive width previews and fixtures for nested cards, navigation, forms and mixed text/image content. Define a documented CSS correspondence for handoff.
- [ ] **D5** Measure affected-subtree reflow; add deterministic nested layout and performance fixtures rather than relying only on simple row/column tests.
- [ ] **D6 — P2** Add true layout grids, breakpoint-specific overrides and reusable responsive presets after base layout semantics stabilize.

**Acceptance:** one token-driven screen adapts to phone, tablet and desktop widths
without manual repositioning or divergent results on another client. Depends on B.

## E. Vector illustration — P1 / M1, advanced tools in M4

- [x] **E1** Add pen tooling: click/drag anchors, cubic curves, open/closed paths, live preview, close/continue path and cancel behavior.
- [ ] **E2** Finish direct selection: multi-point selection remains. Single-point/handle dragging, add/delete points, corner/smooth/symmetric conversion and handle constraints are implemented and tested.
- [ ] **E3** Add compound paths and editable union/subtract/intersect/exclude operations; preserve operands, fill rules and undo. Add flatten/expand as explicit actions.
- [ ] **E4** Add join/split/cut paths, reverse direction, simplification and outline-stroke/offset-path operations with precision controls and degenerate-geometry tests.
- [ ] **E5** Add linear/radial gradients with editable stops, multiple fills/strokes, caps/joins/dashes, clipping masks and basic blend modes. Keep an ordered appearance stack in the document model. Geometric clipping masks are implemented with release, undo, native persistence, shared replay, and canvas/PNG parity.
- [ ] **E6** Import supported SVG shapes/paths as native editable geometry with a conversion report; round-trip curves, transforms, gradients and compound paths through supported SVG export.
- [ ] **E7 — P2** Add pencil smoothing, pressure-aware brushes, variable-width strokes, shape builder, boolean previews and reusable patterns/brush presets.
- [ ] **E8 — P3** Explore live image tracing, meshes, blends, perspective and repeat tools as separate measured projects.

**Acceptance:** draw and refine a curved logo, cut a hole with a boolean operation,
apply a gradient, place it in a reusable UI component and export editable SVG. Depends
on B2/B4/B5; do not equate the existing path schema with a pen editor.

## F. Typography and design tokens — P1 / M1

- [ ] **F1** Make text layout consistent across canvas, active editor, saved document and export: shaping, tracking, real justification, fallback and resolved metrics. Test multiline, RTL, Unicode and IME composition.
- [ ] **F2** Add rich text runs, paragraph styles, decorations, lists, OpenType features and variable-font axes in staged increments; preserve plain text migration.
- [ ] **F3** Add font search/recent/favorites, optional local-font discovery, requested-face metadata and loading/missing/substitution states; require resolved fonts or an explicit fallback for export.
- [ ] **F4** Extend numeric variables and text styles into typed color/spacing/size/radius/typography tokens with property bindings, groups, aliases, cycle detection, modes and usage inspection.
- [ ] **F5** Add controlled token deletion/remapping, cross-document import/export and light/dark previews; distinguish linked tokens from copied swatches.
- [ ] **F6 — P2** Add text on a path, area text, text-to-outlines and font packaging/embedding controls appropriate to font permissions.

**Acceptance:** changing one theme token updates UI and illustration consumers;
font substitution is visible; text metrics and wrapping agree with export. Depends
on B and A4. F3 gates reliable PDF/font-dependent export.

## G. Components, symbols and shared libraries — P1 / M1–M2

- [ ] **G1** Formalize definitions, materialized instances and overrides so an instance does not rely on untracked subtree copies. Include nested instances and cycle prevention.
- [ ] **G2** Extend named variants into typed axes/properties: text, boolean visibility, asset, token and instance swap; expose inherited versus overridden values and reset per property.
- [ ] **G3** Make vector artwork reusable through the same component/symbol model; allow a brand illustration or icon to appear in both freeform artwork and auto-layout UI.
- [ ] **G4** Add Vault search/tags/previews/rename/archive/usage, document/workspace/library scopes and dependency-complete cross-document insertion.
- [ ] **G5** Publish immutable library versions; preview diffs and override conflicts, pin versions, approve updates, roll back and preserve last-resolved content when unavailable.
- [ ] **G6** Test deleted sources, nested overrides, token/font dependencies, variant switching, concurrent source edits and upgrades without losing local overrides.

**Acceptance:** update a shared icon/button library and safely upgrade a consuming
document while preserving overrides. Local G1–G3 depend on B/E/F; shared G4–G6 also
need I's storage and permissions.

## H. Images, assets and export — P1 / M1–M3

- [ ] **H1** Add crop/focal-point/tile controls, intrinsic dimensions, alt text, replace/relink and visible decode/upload/cancel/error states; preserve original image bytes.
- [ ] **H2** Add safe SVG ingestion and explicit GIF/animated-media behavior, size/dimension limits, content deduplication and thumbnails. Keep flattened and editable imports distinct.
- [ ] **H3** Extend export to selected objects, multiple artboards/pages and slices; add JPEG, general SVG and PDF in that order after fidelity gates pass.
- [ ] **H4** Add reusable export recipes: format, scale/density, filename suffix, transparency/background, theme and component variant; include batch export and progress/cancel.
- [ ] **H5** Make exports account-independent; package required images/fonts/library content and report every unsupported feature or substitution.
- [ ] **H6 — P2/M4** Add physical units, bleed/safe areas, color profiles, CMYK/spot-color strategy, overprint/separation preview and print-PDF preflight as a dedicated print milestone.

**Acceptance:** crop/reuse an image, save/reopen offline, then export mixed artwork at
1x/2x with matching clipping, strokes, text and effects. Depends on A4/B6/F3; current
PNG downloads and single-vector SVG do not establish that fidelity.

## I. Shared storage and real-time editing — P0 protocol, P1 / M2

- [ ] **I1** Build the Rust HTTP/WebSocket modular backend, authentication, PostgreSQL document/revision metadata, object storage, development infrastructure and backup/restore.
- [ ] **I2** Add workspaces, invites and explicit owner/editor/commenter/viewer capabilities; validate every HTTP/WS mutation server-side, including asset reads and permission revocation during a session.

Prototype evidence: the [collaboration service](collaboration-prototype.md) now has atomic local-file persistence and validated restart, capability roles/invitation expiry/live revocation, participant names/cursors/selections, presence expiry and restore-as-new-room. The [ten-task batch](roadmap.md#completed-batch-room-durability-access-and-presence-2026-09-27) is complete. I1–I8 remain open for the broader account/workspace, storage architecture, review and production requirements. Main-editor mixed-document sharing is now implemented; see [MVP priority 1](mvp.md#1-full-editor-collaboration--implemented-2026-09-28).

- [ ] **I3** Implement snapshot + revision loading and ordered accepted operations, optimistic application, deduplication, acknowledgements, rejection/rollback and bounded log replay.
- [ ] **I4** Add reconnect/resume and snapshot fallback. Preserve disconnected work in a recoverable local fork until safe reconciliation exists; do not silently overwrite shared state or promise seamless offline merging.
- [ ] **I5** Add ephemeral identity, cursor, active page, selection, viewport, follow-user and presentation controls; throttle updates and expire disconnected sessions.
- [ ] **I6** Implement per-user collaborative undo as compensating operations. Specify same-property conflicts and make skipped/conflicting undo visible.
- [ ] **I7** Exercise concurrent property/path edits, reorder/reparent, delete-versus-edit, duplicate/retried messages, stale clients, schema mismatch, restart and revoked permissions in two or more browser sessions.
- [ ] **I8** Add connection/save status, named version checkpoints, revision attribution and safe restore-as-new-revision; distinguish presence from durable history.

**Acceptance:** two editors converge after reconnect and server restart; a viewer
cannot mutate through direct requests; undo preserves unrelated remote work.
Depends on A/B; cloud convenience must preserve native file ownership.

## J. Review, decisions and team coordination — P1 / M2–M3

- [ ] **J1** Implement persisted local threads with page/node anchors and canvas fallback, replies, resolve/reopen, author/time metadata and revision snapshots; define delete/move behavior.
- [ ] **J2** Add synced comments, mentions, assignment, unread state, filters and notification preferences with access checks and retries.
- [ ] **J3** Add review links to an exact node/page/revision, optional expiring access, viewport capture and visible distinction between viewing an old revision and the current design.
- [ ] **J4** Add draft/ready-for-review/approved/changes-requested state for a frame or component, named reviewers and an approval tied to a revision. Later edits must mark approval as outdated.
- [ ] **J5** Add before/after visual and property diffs for review checkpoints; let reviewers discuss a specific change rather than only the whole canvas.
- [ ] **J6** Add explicit authorized promotion of a thread to GitHub/GitLab issues, anchor/revision/screenshot context, linked status and retry handling. Store integration credentials only in trusted services.
- [ ] **J7** Make Review mode editing-safe and keyboard-accessible while keeping role enforcement independent from mode switching.

**Acceptance:** a reviewer comments on a moved/deleted object, an editor resolves the
thread, and an approval remains traceable to the reviewed revision. J1 can precede
the backend; shared J2–J6 depend on I. Static review uses M's separate limitations.

## K. Interactive prototypes — P2 / M3

- [ ] **K1** Add screen starting points, click/tap/hover triggers, navigation/back, overlays and scroll regions; keep prototype connections separate from layout geometry.
- [ ] **K2** Add preview/presentation with device frames, keyboard navigation, reduced motion and review anchors inside the flow.
- [ ] **K3** Add interactive component states and transitions, then variables/conditions after deterministic state playback exists.
- [ ] **K4** Save and share prototype flows by revision; retain stable links when frames are renamed and warn when destinations are deleted.

**Acceptance:** share a three-screen flow with a reusable interactive button and
collect feedback at the exact screen/state. Depends on D/G/J.

## L. Developer handoff and design quality — P1 basics, P2 / M3

- [ ] **L1** Correct and test CSS inspection units and semantics, including unitless line-height, transforms, resolved tokens, text, constraints and unsupported-value notices.
- [ ] **L2** Add measurements across selected nodes, downloadable asset recipes, token export and a ready-for-development marker tied to a revision.
- [ ] **L3** Add contrast checks, small-text/target-size warnings, missing-font/asset checks and annotations for reading order and intended accessible names.
- [ ] **L4 — P2** Map stable component properties to repository components/typed props; show drift and referenced library versions before attempting general code generation.

**Acceptance:** a developer can inspect an approved revision, download its assets
and resolve token/component references without editing the design. Depends on D/F/G/H/J.

## M. Publishing and deployment — P1 / M3

- [ ] **M1** Export an immutable read-only review/prototype bundle with embedded or packaged dependencies for any static host; include revision metadata and sanitized content.
- [ ] **M2** Add per-project GitHub Pages publishing and an optional prepared-issue review action. The existing workflow deploys the editor app only.
- [ ] **M3** Provide self-hosted backend deployment, migrations, configuration, health checks, logs, backup verification and compatible client/server version checks.
- [ ] **M4** Add managed private sharing/storage as an optional service while keeping local save/export available when a subscription or connection ends.
- [ ] **M5 — P3** Add SSO, audit logs, retention controls and customer-owned storage adapters after the base sharing/security model is tested.

**Acceptance:** a public static bundle works without credentials; a private review
requires backend authorization. Static hosting alone supplies neither live editing
nor private durable comment storage. Depends on H/J/K and I for private services.

## N. Quality, accessibility and performance — all milestones

- [ ] **N1** Turn primary journeys into focused browser tests: local recovery, vector authoring, responsive components, export fidelity, review and two-client convergence.
- [ ] **N2** Add deterministic visual fixtures for mixed content and import/export, plus migration and untrusted-file validation fixtures; retain original import samples.
- [ ] **N3** Establish named-hardware mixed-document benchmarks, including path segment counts, text, images, effects, memory and input latency. Keep the 1K-object/60-FPS target; measure before setting a higher object limit.
- [ ] **N4** Audit keyboard/focus behavior, screen-reader layer/property access, contrast, reduced motion, zoom and error recovery; provide meaningful unsupported-browser states.
- [ ] **N5** Run CI formatting/lint/unit/type/browser checks and a documented manual WebGPU pass; distinguish hardware-dependent performance failures from deterministic correctness failures.
- [ ] **N6** Break up the large application orchestration and drawing modules around commands, persistence, rendering and collaboration as those boundaries land; preserve behavior with focused tests.
- [ ] **N7** Define supported browsers/devices and test them explicitly; investigate fallback rendering and pen/tablet input after desktop workflows stabilize.
- [ ] **N8** Provide an onboarding project combining responsive UI, editable vector artwork, tokens, components, comments and export recipes as each capability ships.

**Definition of done:** working UI and engine behavior, persistence/migration, undo,
keyboard/error behavior, appropriate tests, documented limitations and measured
performance where relevant. A model field or inactive button is not a completed feature.

## O. Open-source community and governance — M0–M3

The [community and business plan](community-and-business.md) defines the agreed
boundary. These additions cover project sustainability alongside editor development.

- [ ] **O1 — M0** Audit copyright, dependency/artwork/font licenses and existing contributor rights; resolve the MIT manifest declaration and missing root license text. Record any proposed license change explicitly.
- [ ] **O2 — M0** Publish contribution/setup/review guidance, architecture entry points, issue/PR templates and a deliberate DCO/CLA policy.
- [ ] **O3 — M0** Publish maintainer/governance/RFC rules, code of conduct, funding transparency and the Community feature promise.
- [ ] **O4 — M0–M2** Establish private security reporting, supported versions, vulnerability response, release ownership and dependency/license checks.
- [ ] **O5 — M1** Run a public alpha with starter issues for code, design, docs, accessibility and translations; track contributor onboarding and review bottlenecks.
- [ ] **O6 — M1–M3** Extract UI strings and establish translation/accessibility review with non-English workflow checks.
- [ ] **O7 — M2** Release reproducible Community builds and self-host packages with tested install/upgrade/backup/restore; verify no private module or vendor activation dependency.
- [ ] **O8 — M3** Establish release notes, maintainer handover, triage expectations, sponsorship and ongoing public usability feedback.

**Acceptance:** an outside contributor can build, propose a change and receive a
review; an operator can run secure Community collaboration independently of the vendor.

## P. Paid services and business workflows — discovery M0, delivery M2–M4

- [x] **P0 — product decision, 2026-09-27** Agree on a complete open-source Community edition, paid managed hosting and optional business administration; target small teams/agencies first. This records direction, not implemented features.
- [ ] **P1 — M0–M1** Publish the agreed Community/paid feature matrix, resolve the licensing boundary and validate demand for managed private collaboration/client review with product teams and agencies.
- [ ] **P2 — M2** Pilot managed private workspaces with tenant isolation, usage measurement, cost budgets, tested restores and explicit support expectations.
- [ ] **P3 — M3** Implement optional subscriptions, invoices, tax handling, signed/idempotent billing webhooks, server entitlements and visible resource quotas after pricing validation.
- [ ] **P4 — M3** Test trials, payment failure, cancellation, plan changes and self-host entitlement expiry; preserve Community operation and documented hosted export/retention periods.
- [ ] **P5 — M3–M4** Add validated agency/team administration: client review spaces, guest access reviews/expiry, ownership transfer and organization-wide project status. Preserve basic guest roles and manual review in Community.
- [ ] **P6 — M3–M4** Add governed library channels, organization policy checks and required approval stages with revision evidence. Preserve ordinary tokens, versioned libraries and manual approval in Community.
- [ ] **P7 — M4** Add enterprise identity/provisioning, policy enforcement, audit export and dedicated deployment options when demand and support capacity justify them. Basic authentication/security remains Community.
- [ ] **P8 — before paid hosting** Publish accurate privacy/service/data-handling terms, deletion/export and incident/restore procedures; define measurable support commitments without unsupported certification claims.

**Acceptance:** a pilot customer pays for a demonstrated organizational or operational
benefit; tenant isolation and downgrade/export tests pass; the free Community build
still completes the core design/collaboration journey. Depends on I/J/M and O1.

## Q. Community resources and extension ecosystem — M1–M4

- [ ] **Q1 — M1** Publish example projects/templates/component packs with explicit licenses, attribution and editable source.
- [ ] **Q2 — M3** Document stable file/token formats and versioned public API/webhook contracts, available to Community developers.
- [ ] **Q3 — M3–M4** Add community resource discovery with previews, provenance, reporting/moderation and compatible-version information.
- [ ] **Q4 — M4** Design an extension API and free SDK with sandboxing, explicit permissions, install/update/revoke behavior and compatibility tests.
- [ ] **Q5 — M4** Validate marketplace demand and distribution/moderation capacity before adding paid assets/extensions or revenue sharing.

**Acceptance:** a community author can publish a reusable resource with clear rights;
extensions cannot gain undocumented document/network access. Depends on stable G/H
resources, O governance and the public API boundary.

## First implementation queue

1. A1–A2 complete: retention, save/recovery safety, visual recovery history and cross-tab conflict protection are implemented.
2. B4–B6: establish mixed-content paint order, clipping, transforms and export parity fixtures.
3. B1–B3: define serializable operations and stable vector sub-element identities; prototype two-client conflict/reconnect semantics.
4. E1–E3: ship pen, direct selection and editable boolean geometry using those operations.
5. D1–D3 and F3–F5: finish responsive sizing and dependable fonts/tokens.
6. G1–G3 and A4/H1: close the local reusable-artwork and portable-asset journey.
7. I1–I7 and J1–J3: deliver actual shared editing and anchored review.
8. H3–H5, J4–J6, K, L and M: turn the editor into a complete design-to-review-to-handoff product.

## Audit validation

- `npm test`: 74 Rust tests passed; TypeScript typecheck passed on 2026-09-27.
- `npm run test:ui`: production build and browser UI smoke tests passed on 2026-09-27 (including vectors, SVG download, typography, variables, images, local projects and the 1K scene).
- Existing tests cover many local editing paths; no live collaboration/backend tests exist.
- The historical performance measurements were read, not remeasured for this audit.
