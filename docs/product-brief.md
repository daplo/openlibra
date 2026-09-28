# Product brief

## Vision

Open Libra combines interface design and vector illustration in one browser editor.
A designer should be able to draw an icon or logo, refine its paths, reuse it in a
responsive component, prototype a screen, and review the result with a team without
flattening the artwork or moving between incompatible documents.

Figma-like UI composition and collaboration and Illustrator-like vector authoring
are the product direction, not a claim of current feature parity. The
[implementation audit and TODO](TODO.md) is the active scope and completion record.

## Target users

- Product designers building responsive web/mobile interfaces and design systems
- Vector and brand designers creating icons, logos, diagrams and digital artwork
- Developers inspecting approved designs, tokens, components and export assets
- Product teams and clients discussing, comparing and approving revisions

## Product principles

1. One document model supports structured UI and freeform vector artwork.
2. Files belong to users: local editing and native project export require no account.
3. Collaboration is optional to use, but its operation semantics shape the engine.
4. Components, tokens, vector geometry and assets stay editable and traceable.
5. Canvas, saved files and exports should agree; limitations and substitutions are visible.
6. Permissions are enforced independently of the selected UI mode.
7. Ship complete workflows with demonstrable exit criteria before expanding tool breadth.

## Workspaces and workflows

### Design

Use frames, auto layout, constraints, layers, components, tokens and reusable assets
to compose screens. Vector tools belong in the same workspace: pen/direct selection,
curves, compound paths, boolean shapes, gradients and masks. A separate illustration
preset may customize panels and shortcuts without changing the document format.

### Developer

Inspect dimensions, layout, tokens and assets at a named revision. CSS-like output
must describe its limitations. Later, map stable component properties to repository
components; general code generation is not an initial release requirement.

### Review

Navigate designs and prototypes, leave anchored threads, compare revisions and
record approval or requested changes. Shared cursors and follow-user controls aid
live reviews. An approval belongs to a particular revision and becomes outdated
when that design changes.

## Current implementation

The repository contains a local editor with Rust/WASM document state, basic layout,
text and numeric variables, local components/named variants, vector primitives and
path data, image/icon assets, `.libra` downloads, browser autosave/recovery, partial
`.fig` import, frame PNG export and single-vector SVG export.

It does not yet provide a pen/anchor editor, a collaboration backend, working comment
threads, account permissions or interactive prototypes. Review mode is a placeholder.
See [TODO.md](TODO.md#what-is-implemented) for source evidence and precise boundaries.

## First useful hybrid release

- Trustworthy account-free project save, reopen, recovery and portable assets
- Responsive frame layout and constraints with linked design tokens
- Pen and direct-selection tools, editable booleans, gradients and supported SVG interchange
- Components that reuse both UI structure and vector artwork with explicit overrides
- Reliable fonts, text layout and mixed-content rendering/export
- Optional shared documents with authorized edits, presence, reconnect and per-user undo
- Anchored review threads and developer inspection of the same document

A subsequent product-team milestone adds shared library upgrades, revision-based
approval/diffs, interactive prototypes, broader export and static review publishing.
Advanced brushes, tracing and professional print production follow separately.

## Ownership and hosting

Local `.libra` files remain portable and downloadable. Optional managed or self-hosted
services provide private shared documents, real-time editing, history and review.
Ending hosted access must not disable local files or core export.

Public read-only bundles may run on any static host, including GitHub Pages. Static
hosting alone does not supply live editing, access-controlled private review or
persistent comments; those require a backend or an explicitly linked issue workflow.

Local editing is distinct from seamless offline collaborative synchronization. Until
reconciliation is implemented, disconnected shared work needs a recoverable local
copy and an explicit rejoin/fork workflow.

## Community and business model

The agreed Community edition is a complete open-source editor with useful
self-hosted collaboration, including commercial use. Core authoring, standard
exports, basic review and security remain Community capabilities.

Optional revenue comes from managed hosting, support and organization-level features
such as enforced approval/library policies, enterprise identity and audit reporting.
Private self-hosting remains available without buying managed Cloud access. See the
[community and business plan](community-and-business.md) for the agreed boundary
and outstanding licensing, governance and pricing decisions.

## Success criteria

1. Draw a curved icon, combine it with a boolean shape and use it inside a responsive,
   token-driven component without losing its editable paths.
2. Save and reopen the project with its resources and matching appearance; export
   supported artwork with clear handling of missing fonts or unsupported effects.
3. Two authorized browser sessions edit one shared document, survive reconnects,
   converge and undo their own work without removing unrelated remote edits.
4. A reviewer leaves feedback anchored to an object/revision; a developer inspects
   that same design and downloads its assets.
5. Pan, zoom and basic transforms meet the 1K-visible-object/60-FPS target on named
   hardware, with mixed text/image/vector fixtures in addition to simple rectangles.

## Deferred commitments and open decisions

- Full Figma/Illustrator native-file compatibility is not promised; prioritize `.libra`,
  editable SVG and explicit import conversion reports.
- Professional CMYK/spot-color/print-PDF workflows require a separate color-management milestone.
- Safari/Firefox/tablet and larger-document guarantees require measured support work.
- Decide component materialization and override semantics before library publishing.
- Decide vector sub-element identities and concurrent path-edit behavior before multiplayer vectors.
- Choose a shared rendering/export contract before expanding effects and typography.
- Validate whether illustration needs a dedicated panel preset; keep the underlying model shared.
