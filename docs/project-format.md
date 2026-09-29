# `.libra` project format

Open Libra project files use the `.libra` extension and the media type
`application/vnd.openlibra.project+json`.

Version 1 is a UTF-8 JSON envelope:

```json
{
  "format": "open-libra-project",
  "format_version": 1,
  "document": {
    "schema_version": 9,
    "active_page_id": "…",
    "pages": []
  }
}
```

`format_version` versions the outer project container. `document.schema_version`
independently versions the Rust-owned document model. Readers reject unknown
container versions and migrate supported legacy document schemas during load.

The first version keeps media sources in the structured document payload. A later
container version may add content-addressed binary entries without changing the
document schema. Open Libra also accepts legacy raw document JSON and `.olibra`
files for backward compatibility.

Local autosaves and recovery snapshots are browser-owned IndexedDB records. They
are not part of a downloaded `.libra` file.

## Browser storage and recovery

All browser projects remain stored until explicitly deleted; quick-switcher recency
limits do not remove documents. The Library lists all active browser projects and
provides a separate archive view. No storage schema migration is required for this
retention change; documents already deleted by older versions cannot be recreated.

The editor distinguishes saving in this browser, saved, pending and failed states.
File saving requests a `.libra` download; it does not confirm disk completion or write
back to an originally opened file. Failed browser saves retain the last committed
copy and offer retry/download. Closing with unpersisted changes triggers the browser
warning. Browser storage can still be cleared or evicted, so downloaded files remain
important independent copies.

Autosave keeps up to five recovery snapshots per project, normally at least five
minutes apart. Recovery opens the selected snapshot as a new `recovered.libra`
project, preserving the source project's latest state and history. Snapshot failures
are reported separately from primary save failures. A damaged startup project is
preserved rather than overwritten by the sample document.

Permanent deletion asks for confirmation and deletes that project's recovery
snapshots too. Same-tab document saves are serialized. Recovery history shows dates, page counts,
simplified active-page thumbnails and page names before opening a selected snapshot
as a separate project. Previews are structural approximations, not full-fidelity
image/effect renders. Damaged or unsupported snapshots are disabled; loading, empty
and read-failure states offer cancellation or retry without changing the project.

## Cross-tab conflict protection

Browser project records carry a storage `revision`, separate from both the `.libra`
container version and the Rust document schema. Legacy records without a revision
are read as revision zero; their next changed save writes revision one. No IndexedDB
schema migration or change to exported project files is needed.

A save compares its loaded revision and commits the next revision within one
IndexedDB read/write transaction. Metadata changes and deletion also check revisions.
An unchanged save does not increment the revision. A stale save is rejected even
when cross-tab notifications are unavailable, including after another tab deletes
the record; stale tabs cannot recreate it under its old ID.

BroadcastChannel notifies other tabs to check stored state. Focus/visibility changes
also check it. Notifications are a convenience; transactional checks enforce safety.
After a conflict, autosave pauses for that document until the user chooses:

- **Reload latest:** confirm discarding this tab's changes and load the current saved
  revision. If the project was deleted, keep the in-memory work and offer a copy.
- **Save as a copy:** preserve this tab's current work under a new project ID without
  changing the other tab's saved project.

Recovery likewise opens a separate project. These checks protect current-version
tabs sharing the same browser/origin storage; they do not implement cloud collaboration
or merge concurrent edits. Refresh old editor tabs after upgrading the application.

### Transform compatibility

The hierarchy-transform implementation retains schema 9 and resolved world-space bounds/orientation. Opening an existing document does not reinterpret stored ancestor rotations. Subsequent container rotation/flip commands transform descendant geometry atomically. Selected-frame PNG applies the inverse of the frame's rotation/reflections to all descendants so the exported image uses the frame's own axes. No extra matrix or local-coordinate field is written.

## Operation history

Current editor saves include an optional `operation_history` object inside the
native document: journal version, document lineage UUID, validated baseline and
ordered entries (envelope, revision, resolved changes). The document remains schema
9 and the outer `.libra` container remains version 1. Loading verifies replay and
head equality; a malformed journal rejects the file rather than silently losing
history. Legacy files without this field remain supported. See
[edit operations](edit-operations.md) for compatibility, actor ownership, undo,
retained deleted content and current unbounded-history costs. Storage revisions
and operation revisions serve different purposes and must not be interchanged.

## Shared-room files and backup restoration

The local collaboration service stores a separate version-1 room envelope containing
the native document JSON/journal, room UUID, participant credentials/roles/names and
expiring invitations. These private service files are not `.libra` exports. Room
backup downloads contain only the ordinary `.libra` envelope and native document;
credentials and presence are excluded. Restoring validates the source journal, then
creates a new room/document lineage with a fresh baseline, owner and invitations.
Source node IDs are retained but old actor history is not inherited. Current shared
restoration is limited to single-page flat rectangle documents. See
[the collaboration storage contract](collaboration-prototype.md#persistence-contract).

## Shape masks

A shape node can carry optional `mask_shape: true` (absent means false). Within a group, that direct child supplies the clipping geometry for all other children and is not painted itself. There is at most one mask source per group. Supported sources are rectangles, ellipses, polygons, stars, and closed native paths; paths preserve their fill rule. Source fill, stroke, and opacity do not affect the geometric mask. Transforms and descendants continue to use resolved world coordinates.

**Use as mask** groups selected siblings and marks the topmost selected shape. **Release mask** clears the flag and keeps the editable group and artwork. Ungrouping clears the flag on promoted children; deleting the source also removes clipping. Canvas and frame PNG share the mask renderer. Native save/reopen and shared entity/property operations preserve the flag. This is geometric clipping, not raster alpha/luminance masking; group SVG export remains unsupported.

## Boolean groups

A group can carry optional `boolean_operation`: `union`, `subtract`, `intersect`, or `exclude`. Its direct children are editable operands, ordered by document paint order. The group’s `vector` stores a derived normalized, closed, even-odd path. Children do not paint separately; canvas selection targets the result, and Layers provides explicit operand selection.

The engine recomputes derived paths after operand edits and shared operation replay, deepest groups first. Native documents store both operands and the result. Creation accepts 2–64 unlocked sibling rectangles or closed vector shapes (including nested boolean results); open paths, ordinary groups, masks, text, images, and component instances are not operands. Removing operands can leave a single-operand or empty result.

Operations combine filled geometry, ignoring operand stroke width, opacity, and visibility. Subtraction folds upper operands into the bottom operand; the group copies the bottom operand’s fill, stroke, stroke width, and stroke join once at creation (stroke alignment starts centered). The result then owns its paint: operand paint edits and reordering do not change it, while geometry edits still recompute the result. Edit the boolean group itself to change its paint. Curves are flattened with a 0.05 document-pixel tolerance; original Bézier handles remain unchanged. Geometry is capped at 131,072 points per operand/result, with bounded curve subdivision. This is geometric combination, not alpha compositing.

Release clears boolean mode and the derived path, restoring an ordinary group of original artwork. Undo restores the operation. Result SVG export exports the derived vector path; PNG uses the same painter as the canvas.
