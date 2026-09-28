# Open Libra roadmap

The current MVP delivery checklist and priority order are in [mvp.md](mvp.md).

Updated: 2026-09-28.

Open Libra combines interface design, vector illustration and team collaboration
in one editable document. The goal is to draw an asset, reuse it in a responsive
interface, prototype the experience, review changes and hand off approved work
without losing geometry, component relationships or design intent.

This roadmap defines delivery order and release gates. [TODO.md](TODO.md) contains
the implementation audit and detailed tasks; references such as **E1–E3** map to
those task IDs. Milestones are outcome-based, with no calendar commitments yet.

## Starting point

The local editor already has pages, layers, transforms, undo/redo, basic auto layout,
text styles, numeric variables, components with named variants, images/icons,
vector primitives, `.libra` files, browser autosave, partial Figma import, frame PNG
export and single-vector SVG export.

Pen drawing and single-anchor editing now support native paths, undo, saved files,
SVG export and shared replay. The development collaboration service and editor
permissions are implemented. Complete responsive layout, shared libraries,
recoverable accounts, working comments and interactive prototypes remain unfinished
or absent. Existing foundations should be extended, with their limitations resolved
before marking a complete workflow delivered.

## Product rules

- UI design and illustration share nodes, components, tokens, assets and history.
- Local creation, native files and core export remain available without an account.
- Optional managed or self-hosted services add shared storage, live editing and review.
- Collaboration semantics are designed before new editing tools proliferate.
- Design, Developer and Review modes customize tools; permissions independently control access.
- Artwork remains editable when reused; flattening or converting it is an explicit action.
- Canvas, saved projects and exports must agree on supported visual features.

## Open-source community and business direction

The agreed Community edition includes complete UI/vector authoring, local files,
exports, prototypes, basic review and useful self-hosted collaboration. Commercial
use is allowed; the community product must build and run without paid modules or
vendor activation.

The revenue model is managed Cloud hosting and optional Business capabilities:
organization administration, enforced review/library policies, enterprise identity,
audit exports and supported deployments. Keep core security, private self-hosted
projects and ordinary collaboration available in Community.

The [community and business plan](community-and-business.md) defines the agreed
feature matrix, licensing choices, governance, ecosystem, pricing experiments and
billing boundaries. This is the accepted product direction; implementation, final
license selection and pricing remain separate work.

- [ ] **M0:** resolve license files/contributor rights; publish contribution, governance and security policies; publish the agreed Community/Business boundary.
- [ ] **M1:** run a public alpha, onboard contributors and validate business workflows with product teams/agencies.
- [ ] **M2:** ship deployable Community collaboration and test a small managed-cloud pilot with measured costs and backup/restore.
- [ ] **M3:** launch one validated paid offer, with safe billing/downgrade/export and selected organization features.
- [ ] **M4:** expand enterprise controls and the extension ecosystem based on demand and support capacity.

These tracks run alongside authoring and collaboration milestones. License clarity
and contributor onboarding belong at the beginning, not after the editor is finished.
Detailed tasks: **O1–O8**, **P1–P8**, **Q1–Q5** in [TODO.md](TODO.md).

## Delivery overview

| Milestone                   | User outcome                                     | Design focus                                             | Collaboration focus                                            |
| --------------------------- | ------------------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------- |
| M0 — dependable foundation  | Trust the editor with real work                  | Recovery, rendering fidelity, portable resources         | Serializable edits, stable identities, conflict rules          |
| M1 — hybrid design alpha    | Create responsive UI and original vector artwork | Pen tools, booleans, layout, tokens, reusable components | Early two-client validation; local review anchors              |
| M2 — collaborative alpha    | Design and review together safely                | Shared components and library updates                    | Permissions, live editing, reconnect, undo, comments           |
| M3 — product-team release   | Prototype, approve and deliver a design          | Prototypes, exports, inspection, quality checks          | Revision-based approvals, diffs, publishing and handoff        |
| M4 — professional expansion | Handle advanced artwork and larger teams         | Brushes, advanced vectors, print, scale                  | Branch review, controlled library releases, enterprise options |

M0 establishes contracts used by both design and collaboration. During M1, validate
a narrow two-client editing slice while building local tools. M2 expands that slice
into a dependable shared product; collaboration must not wait until every advanced
drawing tool is complete.

## M0 — dependable foundation

**Outcome:** users can keep, recover and export their work without silent loss or
unexplained differences in appearance.

### Project safety

- [x] Prevent recent-project limits from deleting stored projects or recovery snapshots.
- [x] Distinguish browser autosave from file download requests; shared-server save states remain part of M2.
- [x] Show browser save failures with retry/download, guard unsaved close, recover into a separate project and confirm permanent deletion.
- [x] Protect local tabs with atomic revision checks, change notifications and explicit reload/save-as-copy conflict resolution.
- [x] Add visual recovery history with snapshot selection, preview and safe copy restoration.
- [ ] Test interrupted transactions across browser/process failure.
- [ ] Define portable asset packaging, migration and recoverable missing-resource states.

### Shared editing foundations

- [ ] Represent durable edits as versioned operations with identity, actor, revision and transaction boundaries.
- [ ] Give vector contours/anchors and component properties stable identities.
- [ ] Define concurrent property changes, delete/edit, reparent/reorder and undo behavior.
- [ ] Define local versus shared document identity and explicit publish/download/fork behavior.

### Visual correctness

- [ ] Establish consistent transforms, fractional coordinates, paint order, clipping and group effects across all node types.
- [ ] Create mixed text/image/vector fixtures shared by canvas and export verification.
- [ ] Measure selection, culling, scene updates and device-loss recovery on real documents.

**Release gate:** create more than 12 projects, restart, recover an earlier version,
and save/reopen a mixed-content project without losing assets or supported visual
properties. Operation fixtures must demonstrate deterministic results for the first
supported conflicts. Record a fresh mixed-document performance baseline.

**Backlog:** A, B, N1–N5. Complete contracts and baseline correctness here; extend
rendering/export coverage as new features arrive in later milestones.

## M1 — hybrid design alpha

**Outcome:** one person can create both the interface and the editable artwork used
inside it, using a coherent set of tools.

### Vector authoring

- [x] Draw open/closed Bezier paths with pen tools and edit individual anchors/handles directly.
- [ ] Add editable union, subtract, intersect and exclude operations plus compound paths.
- [ ] Add gradient editing, multiple paints, stroke controls and clipping masks.
- [ ] Import supported SVG as editable geometry and export it with explicit conversion limits.

### Interface design

- [ ] Complete two-axis fixed/hug/fill sizing, min/max sizes, wrapping and nested auto layout.
- [ ] Add responsive constraints, absolute children, clipping and size previews.
- [ ] Add persistent layer visibility, page organization, cross-document clipboard and precise transforms.
- [ ] Make font availability, text metrics and export substitutions visible and predictable.
- [ ] Extend variables into typed linked tokens with aliases, modes and usage inspection.

### Reuse and portability

- [ ] Formalize component overrides, typed properties, variant axes and nested instances.
- [ ] Reuse icons and illustrations through the same component model as UI elements.
- [ ] Add image crop/focal-point controls and dependency-complete asset insertion.
- [ ] Finish portable local resources, recovery and cold offline startup for supported content.

### Collaboration experiments

- [x] Validate a two-client operation stream for a small edit/reconnect/undo scenario using M0 contracts: the development-only rectangle collaboration prototype now exercises a real server, reconnect snapshots, actor-scoped undo and retained stale intent.
- [ ] Exercise concurrent path edits before committing to the complete vector operation model.
- [ ] Implement local anchored review threads with node-movement and deletion fallback behavior.

**Release gate:** draw a curved icon, combine shapes, place the result in a themed
responsive component and reuse it on multiple screens. Save/reopen the project and
export supported SVG/PNG without losing editable structure in the native file.
Demonstrate convergence for the experimental shared-edit slice; do not present it
as production collaboration.

**Dependencies:** M0 operation, resource and rendering contracts.
**Backlog:** C; D1–D5; E1–E6; F1–F5; G1–G3; H1–H2; A4–A5;
J1; narrow validation from I3–I7. Stage these as small complete workflows rather
than introducing every control at once.

## M2 — collaborative alpha

**Outcome:** a small team can safely edit, reuse assets and discuss the same document.

### Shared documents and permissions

- [ ] Add authentication, workspaces, invitations and owner/editor/commenter/viewer capabilities.
- [ ] Persist snapshots, operations, assets and revisions with tested server backup/restore.
- [ ] Enforce access on HTTP, WebSocket and asset requests, including live permission revocation.
- [ ] Keep local downloads and explicit local-to-shared publishing available.

### Real-time editing

- [ ] Apply edits optimistically, order accepted operations and reconcile rejected or duplicate messages.
- [ ] Add reconnect/replay and snapshot fallback without overwriting unacknowledged local work.
- [ ] Show named cursors, selections, active pages, connection state and follow-user controls.
- [ ] Implement per-user undo that preserves unrelated remote changes.
- [ ] Preserve disconnected edits in a recoverable copy until safe reconciliation is available.

### Team review and libraries

- [ ] Sync anchored threads, replies, resolution, mentions, assignment and unread state.
- [ ] Link directly to a page, object or revision with access-appropriate review links.
- [ ] Add workspace asset discovery and immutable published component/token library versions.
- [ ] Preview update conflicts, preserve overrides, pin versions and retain unavailable library content locally.

**Release gate:** two editors modify the same mixed-content document, lose their
connections, reconnect and converge. Undo by one editor preserves the other's
unrelated work. A commenter can discuss an object but cannot mutate the design,
even through direct requests. A library update preserves consuming overrides.

**Dependencies:** M0 operations; M1 local authoring, component and resource semantics.
**Backlog:** I1–I8, J2–J3/J7, G4–G6, A6, relevant N1/N2 tests.

## M3 — product-team release

**Outcome:** teams can turn an editable design into a tested flow, a reviewed decision
and an implementation-ready handoff.

### Prototypes and design quality

- [ ] Add flow starting points, click/hover navigation, overlays, scrolling and presentation mode.
- [ ] Add basic interactive component states and transitions with predictable playback.
- [ ] Keep prototype destinations and review anchors stable across renames and revisions.
- [ ] Add contrast, small-text/target-size and missing-resource checks with accessibility annotations.

### Review and decisions

- [ ] Add ready-for-review, approved and changes-requested states tied to an exact revision.
- [ ] Mark approvals outdated when the reviewed content changes.
- [ ] Compare visual/property changes and attach feedback to a specific difference.
- [ ] Promote authorized feedback into linked repository issues with revision and object context.

### Delivery and hosting

- [ ] Correct and verify developer inspection, measurements, token values and CSS-like output.
- [ ] Add batch exports and recipes for objects, frames, pages, scales and variants.
- [ ] Ship JPEG, broader SVG and PDF only after relevant image/font/fidelity gates pass.
- [ ] Export static read-only review/prototype bundles and support per-project publishing.
- [ ] Package self-hosted shared services and optional managed private sharing with operational checks.
- [ ] Provide a complete onboarding sample and verify primary journeys with accessibility and browser tests.

**Release gate:** a team creates a small multi-screen product with original vector
assets, previews its interactions, reviews a named revision, records approval and
hands off inspected values and exports. It can publish a static bundle or use
private authenticated review while retaining its native project.

Static hosting supplies the prepared viewer. Live editing, private authorization
and durable shared comments require services or an explicitly linked issue workflow.

**Dependencies:** M1 authoring/export foundations and M2 shared revisions/permissions.
**Backlog:** H3–H5, J4–J6, K1–K2 and basic K3/K4, L1–L3, M1–M4, N.

## M4 — professional expansion

**Outcome:** expand the proven product toward deeper illustration, larger documents
and more complex team workflows. Each area below is a separate release candidate,
not a requirement for M3.

| Area                    | Feature direction                                                                                                           | Gate before commitment                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Advanced vectors        | Pencil smoothing, pressure/variable-width brushes, shape builder, patterns, offset/simplify refinements, tracing and meshes | Precision, reversibility, geometry performance and export fixtures              |
| Advanced typography     | Rich paragraph workflows, text on paths, area text, text-to-outlines and advanced font controls                             | Shared shaping/metrics, font permissions and predictable export                 |
| Responsive systems      | Grid layout, breakpoints and larger reusable responsive patterns                                                            | Deterministic nested layout and inspectable CSS correspondence                  |
| Advanced prototypes     | Variables, conditions and richer stateful interactions                                                                      | Reproducible playback and revision-specific review                              |
| Print production        | Physical units, bleed, profiles, CMYK/spot colors and print-PDF preflight                                                   | Explicit color pipeline and verified output; no premature print-fidelity claims |
| Team change management  | Branch/fork comparison, reviewable change sets, controlled merging and library release approvals                            | Semantic diffs and conflict handling for hierarchy, paths, tokens and overrides |
| Code relationships      | Map component properties to repository components and detect drift                                                          | Stable identities, published versions and explicit mapping ownership            |
| Scale and access        | Larger documents, more simultaneous editors, additional browsers, tablet/pen input and fallback rendering                   | Measured latency, memory, convergence and accessibility on named devices        |
| Organization deployment | SSO, audit logs, retention, customer-owned storage and additional storage adapters                                          | Tested access boundaries, backups and deployment lifecycle                      |

**Backlog:** remaining P2/P3 work in D–N. Branching/change-set review is an additional
proposal; scope it into detailed TODO tasks after M2 conflict semantics and M3 diffs
are demonstrated.

## Immediate implementation order

1. Local safety delivered: retention, save failures, visual recovery history, recovery copies and cross-tab conflict protection.
2. Establish mixed-content rendering/export fixtures and resolve stacking/clipping inconsistencies.
3. Define serializable operations, vector identities and conflict/undo semantics.
4. Build pen/direct selection and a narrow two-client edit/reconnect experiment against those contracts.
5. Complete responsive layout, tokens/fonts and reusable vector/UI components.
6. Deliver shared editing, permissions, anchored review and safe library updates.
7. Add prototypes, approval/diffs, broader exports and production handoff/publishing.

## Release requirements

Every milestone needs a repeatable user demo, relevant automated tests, compatible
project migrations, undo/recovery behavior, keyboard access and visible error states.
Shared features additionally need multi-session convergence and permission tests.
Visual features need saved-document and export comparisons.

Maintain the initial 1K-visible-object/60-FPS interaction target on named hardware,
using mixed content and recording path complexity, image sizes, memory and latency.
Do not infer production performance from the existing rectangle benchmark alone.

A schema field, inactive button or isolated prototype does not complete a feature.
Update this roadmap's release status only when its gate passes; track individual
implementation tasks and evidence in [TODO.md](TODO.md).

### Rendering consistency increment

- Implemented shared document/PNG painting with ordered mixed content, frame clipping, subtree opacity, and per-node transforms.
- Added browser pixel assertions and 1x/2x PNG checks; retained the synthetic rectangle WebGPU benchmark.
- Completed container rotation/flip propagation, rotated auto-layout, transform-safe component sync and inverse-frame PNG export without changing the world-space file format.
- Completed path/glyph/image-alpha shadow masks, signed spread, justified paragraphs, clipped hit testing and live-drag repaint regression coverage.
- Added bounded caches and a repeatable 1K/10K mixed-document benchmark; see `performance.md` for warm/cold results and hardware.
- SVG/PDF parity, richer typography and arbitrary affine/skew transforms remain separate roadmap work.

## Completed batch: edit-operation foundation (2026-09-27)

- [x] 1. Versioned, serializable command envelopes and strict protocol decoding.
- [x] 2. Document/operation/actor/transaction identities, actor sequences and revisions.
- [x] 3. Explicit-ID node creation and validated deletion.
- [x] 4. Move, resize, bounds and hierarchy transform commands.
- [x] 5. Name, lock, paint, opacity, text and shadow commands.
- [x] 6. Reparent and reorder commands with hierarchy/reference validation.
- [x] 7. Atomic command batches and native gesture transaction boundaries.
- [x] 8. Deterministic journal replay, exact duplicate detection and stale revision rejection.
- [x] 9. Actor-scoped undo/redo that preserves unrelated edits and reports conflicts.
- [x] 10. Editor integration, persisted/revalidated journals and Rust/browser regressions.

See [the operation contract](edit-operations.md). This completes the selected ten-task
foundation batch. B1–B3 remain open for full intent coverage, vector sub-element
identities and broader validation. Transport, authentication, server ordering,
optimistic reconciliation and log compaction remain separate collaboration work.

## Completed increment: two-client networking prototype (2026-09-27)

- Server-validated, strictly ordered operations over POST and authenticated SSE.
- Invitation rooms, server-issued session actors and cross-session rectangle editing.
- Snapshot reconnect, exact retry/deduplication and visible stale-revision recovery.
- Actor-scoped undo/redo, retained pending intent and accepted-document download.
- Real HTTP and two-browser regressions, including offline/reload/retry.

See [setup and boundaries](collaboration-prototype.md). This completes the narrow M1
networking experiment. M2 remains open: durable storage, accounts/permissions,
full-editor intent coverage, presence, comments and production service packaging.

## Completed batch: room durability, access and presence (2026-09-27)

- [x] 1. Persist room documents and access metadata with atomic file replacement before acknowledgement.
- [x] 2. Validate saved journals/metadata on restart; reject corruption and competing writers.
- [x] 3. Enforce owner/editor/viewer capabilities on server requests.
- [x] 4. Create role-based invitations with expiry and revocation.
- [x] 5. Change participant access and revoke active streams without discarding pending local intent.
- [x] 6. Persist editable participant names and show role/online state.
- [x] 7. Broadcast throttled named cursors in canvas coordinates.
- [x] 8. Broadcast validated selections and clear deleted-object references.
- [x] 9. Remove disconnected/stale presence and reset it on service restart.
- [x] 10. Validate and restore rectangle backups into independent new shared rooms.

Verified through server failure/restart/access tests and three-browser interactions.
See [the service contract](collaboration-prototype.md). This extends the rectangle
prototype; I1–I8 and M2 remain open for accounts/workspaces, PostgreSQL/object storage,
full-editor operations, review, bounded replay, owner recovery and production scale.

## Completed MVP priority 1: main-editor collaboration (2026-09-28)

- [x] Publish a mixed local document as a separate shared copy; keep the original.
- [x] Use the main canvas, layers, inspector, components, and asset tools in shared mode.
- [x] Share all current document entities through validated atomic entity/property changes.
- [x] Keep page navigation local and broadcast page-scoped cursor/selection presence.
- [x] Preserve actor undo, durable acknowledgment, reconnect snapshots, and recoverable conflicts.
- [x] Enforce live roles and preserve gestures completed after a downgrade.
- [x] Fork a shared document into a local project with fresh history and embedded resources.
- [x] Test publication, mixed content, independent pages, undo, restart, access and conflicting gestures.

See [the MVP checklist](mvp.md) for the remaining six priorities. Dedicated semantic
commands for every authoring tool, accounts/ownership recovery, review, bounded
history and production deployment remain separate work. Existing capabilities are
shared; this batch does not add the missing pen/anchor/boolean tools.

## Editable boolean shapes — implemented 2026-09-28

- [x] Union, subtract, intersect, and exclude with editable original operands.
- [x] Inspector operation switching, release, and Layers access to source shapes.
- [x] Derived result hit testing and visible selection outlines.
- [x] Native persistence, undo/redo, shared replay, and derived SVG/PNG rendering.
- [x] Nested results and curve flattening with bounded geometry work.

See [MVP vector authoring](mvp.md#2-essential-vector-authoring) and [boolean document representation](project-format.md#boolean-groups). Gradients and supported SVG import remain next vector-authoring work.

## Local automation foundation — implemented

- [x] Shared Rust/WASM-backed file automation API.
- [x] CLI create, inspect, validate, node reads, templates, and transactional edits.
- [x] Stdio MCP tools with workspace-scoped file access.
- [x] Content-hash preconditions, cooperative writer locks, atomic saves, and batch rollback.
- [x] CLI and real MCP client integration tests.
- [ ] Automation PNG previews and SVG export.
- [ ] Higher-level layout, component, path, mask, and boolean tools.
- [ ] Live collaboration connection with agent identity and existing permissions.

See [automation setup and command reference](automation.md). This operates on local disk files; browser autosaves and shared rooms remain separate.
