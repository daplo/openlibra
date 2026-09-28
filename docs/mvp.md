# MVP delivery checklist

The MVP combines UI layout and vector artwork in one portable document, with optional collaboration. Local editing remains account-free. Core authoring, file portability, and basic collaboration belong in the open-source community edition; business administration and hosted services can be paid additions. See [product brief](product-brief.md), [roadmap](roadmap.md), and [community and business](community-and-business.md).

## Acceptance scenario

- [ ] Create a responsive multi-screen design with a custom curved icon and a reusable component.
- [ ] Save, reopen, and recover the design with its embedded resources intact.
- [ ] Two authorized people edit the mixed-content document, reconnect, and undo their own work without overwriting unrelated edits.
- [ ] A reviewer leaves anchored feedback; a developer inspects and exports the supported artwork.
- [ ] Validate rendering, export, accessibility, and interaction performance on named hardware.

## 1. Full-editor collaboration — implemented 2026-09-28

- [x] Open shared documents in the main editor, with the normal canvas, layers, inspector, and library.
- [x] Publish an explicit shared copy of a local document without overwriting the local original.
- [x] Synchronize page creation, rename, and deletion; keep active-page navigation local to each participant.
- [x] Synchronize frames, nested nodes, text, vector shapes/paths, layout, and styling.
- [x] Synchronize component definitions, variants, instances, and their resolved updates atomically.
- [x] Synchronize document colors, numeric variables, text styles, and embedded image/icon resources.
- [x] Send committed gestures as atomic entity/property edits with server-side validation and revision checks.
- [x] Keep actor-scoped undo/redo, duplicate retry detection, and durable save-before-acknowledgment.
- [x] Retain pending edits on disconnect/reload/conflict; provide explicit retry, download, and discard.
- [x] Enforce viewer access and live revocation through the main editor and server.
- [x] Provide invitations and a named participant roster in the main editor.
- [x] Make an independent local fork with a fresh operation history; download portable `.libra` backups.
- [x] Verify mixed-document editing, reconnect, permissions, resources, and undo across real browser sessions.

Verified with Rust operation tests, the main-editor two-browser suite, and shared-adapter conflict tests. Run `npm run test:shared-editor` or the complete `npm run check`.

Implementation uses resolved entity/property compare-and-set edits for editor actions that do not yet have semantic commands. This covers the current document model; it does not add pen tools, comments, or missing authoring features. Same-property conflicts require explicit resolution rather than automatic last-writer-wins.

## 2. Essential vector authoring

- [x] Pen tool: start, extend, close, cancel, and continue paths.
- [x] Direct selection: select/move anchors and Bezier handles; add/delete anchors.
- [x] Corner/smooth point conversion and handle constraints.
- [ ] Editable union, subtract, intersect, and exclude operations with undo.
- [x] Editable shape masks with release, undo, native-file persistence, shared replay, and PNG export.
- [ ] Linear/radial gradients with editable stops and handles.
- [ ] Supported SVG import/export with explicit unsupported-feature reporting.
- [ ] Test vector editing and export after save/reopen and shared replay.

Pen and single-anchor editing are implemented. Select **Pen tool** to draw, or select a path and choose **Edit path**. Existing primitives can be converted to paths in the inspector. Anchor insertion preserves the curve; Shift constrains movement, Alt breaks handle coupling. Each completed edit supports undo and shared replay. Path creation/anchor edits are covered by native-file reload, browser autosave, SVG export, and two-client tests; the full vector gate still includes upcoming booleans, gradients, and SVG import. Shared edits currently compare-and-set whole path geometry, so concurrent edits to the same path require conflict resolution; point-level merging is not implemented.

## 3. Responsive UI design and reuse

- [ ] Fixed/hug/fill sizing in both axes, including nested containers.
- [ ] Parent resizing constraints and predictable minimum/maximum sizing.
- [ ] Linked color and spacing tokens with propagated updates.
- [ ] Reliable component overrides, reset, detach, and variant switching across save/replay.
- [ ] Clear inspector states for inherited values and overrides.
- [ ] Mixed UI/vector acceptance fixture with responsive frames and reusable components.

## 4. Recoverable team access

- [ ] Persistent accounts and sign-in/sign-out.
- [ ] Recoverable document ownership independent of a browser tab.
- [ ] Project/workspace listing with clear local/shared labels.
- [ ] Account-linked invitations and durable membership management.
- [ ] Ownership transfer and account recovery.
- [ ] Test expired/revoked invitations, lost sessions, and unauthorized access.

## 5. Review and developer handoff

- [ ] Anchored comments on pages/nodes, with position fallback when artwork changes.
- [ ] Replies, resolve/reopen, and unread indicators.
- [ ] Commenter role distinct from viewer and editor.
- [ ] Persist comments and authorize comment mutations.
- [ ] Inspect dimensions, spacing, typography, colors, and exportable assets.
- [ ] Test review links and anchors after edits, deletion, and reopen.

## 6. Reliability and release readiness

- [ ] Missing-font/resource detection with understandable recovery steps.
- [ ] Mixed-content native-file, PNG, and supported SVG round-trip fixtures.
- [ ] Production/self-host service packaging, configuration, and startup documentation.
- [ ] Backup/restore procedure verified against a service restart and a fresh installation.
- [ ] Bounded history/checkpointing with a defined undo retention policy.
- [ ] Service capacity limits, resource limits, and actionable quota errors.
- [ ] CI for Rust, TypeScript, authoring UI, and collaboration regression tests.
- [ ] Keyboard/focus checks, narrow-view checks, and named-hardware performance evidence.

## 7. Open-source community release

- [ ] Add the selected open-source license and dependency notices.
- [ ] Add contribution/development instructions and a contributor code of conduct.
- [ ] Add a security reporting policy and supported-version policy.
- [ ] Provide issue templates and clearly scoped starter tasks.
- [ ] Document community versus paid features without restricting access to users' own files.

## After the MVP

Billing, enterprise SSO, advanced business administration, advanced brushes, tracing, CMYK/print production, sophisticated prototyping, published-library upgrades, and approval/revision-diff workflows are deferred. Paid services must not be prerequisites for local document ownership or basic community collaboration.
