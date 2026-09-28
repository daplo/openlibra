# Collaboration service and shared editor

The main design editor supports shared documents through a durable local development
service, capability roles, and ephemeral presence. The original rectangle screen
remains available at `?collaboration=1` for protocol testing. Accounts, hosted
production deployment, and the remaining M2 workflows are separate work.

## Run

In separate terminals:

```sh
npm run dev
npm run dev:collaboration
```

Choose **Share document** in the editor, enter the service address and display name,
and choose **Publish shared copy**. This creates a separate room containing the
current pages, nodes, components, variables, styles, and embedded assets. The local
original stays in the Library. Open an invitation from **People and access** in a
separate browser/profile to edit with a teammate. The creator receives
owner credentials; the initial invitation grants editor access for 24 hours.
Owners can create viewer/editor invitations with expiry and revoke them.

The service binds to `127.0.0.1:8787`. It allows browser origins
`http://localhost:5173` and `http://127.0.0.1:5173` by default. For another Vite port:

```sh
COLLAB_ORIGINS=http://localhost:5175,http://127.0.0.1:5175 npm run dev:collaboration
```

`COLLAB_PORT` changes the server port. Set the matching address in the screen;
invitation links include that address. The service runs on the same computer as
the browsers. GitHub Pages does not host it, and it is not configured for public
network deployment.

## Ten-task durability and access increment

1. **Durable room storage:** the CLI stores rooms in `.openlibra-collaboration/`,
   excluded from Git. `COLLAB_DATA_DIR` selects another directory. Each room file
   holds its validated document/journal, participants and invitations.
2. **Validated restart recovery:** startup validates metadata, identities, roles,
   owner count and document replay. Malformed files stop startup without replacing
   them. Interrupted `.tmp` files are ignored. A process lock prevents two services
   from writing the same directory; a dead process's lock is reclaimed.
3. **Owner/editor/viewer roles:** the server checks every endpoint. Viewers may
   read/export the document and publish presence, but cannot mutate it. Editors
   may submit design operations. Only the owner manages invitations and access.
4. **Expiring role invitations:** owners choose viewer/editor and 1 hour, 1 day or
   7 days in the UI (API range: 1 minute–7 days). Expired/revoked invitations reject
   new joins. Existing sessions retain their access until explicitly changed.
5. **Live access changes and revocation:** owners can switch another participant
   between editor/viewer or revoke their session. Downgrades update controls and
   enforce read-only access immediately on the server. Revocation closes existing
   streams and rejects subsequent reads/writes. Owner access cannot be removed.
6. **Participant names:** names are validated, persisted, editable by their owner,
   and shown with role, online state and a stable per-actor color.
7. **Shared cursors:** pointer positions in canvas coordinates are throttled and
   broadcast to other connected participants with names/colors.
8. **Shared selections:** selected node IDs produce remote selection outlines.
   Server validation rejects unknown IDs; deleted nodes are removed from presence.
9. **Presence lifecycle:** normal disconnect removes presence; stale presence
   expires after 30 seconds. Clients send 10-second heartbeats. Presence is neither
   journaled nor restored after restart and never changes document revisions.
10. **Backup restoration:** download the accepted `.libra` document, then use
    **Restore backup as new room**. The server validates the original journal before
    creating a new lineage with a new owner and invitations. It does not overwrite
    the source or import its credentials/history. All validated native document
    structures are accepted; use `?shared=1` to edit mixed documents.

Participant revocation revokes that session, not a real-world identity. Someone
with an unrevoked invitation can join again under a new actor. Revoke their
invitation too when preventing new joins. Already received content cannot be
recalled from another browser; revoked clients retain their existing copy and
pending intent for download but receive no subsequent document updates.

## Persistence contract

Mutations apply to a candidate Rust/WASM engine. The service writes and syncs a
private temporary file, closes it and atomically renames it before swapping live
state, broadcasting or acknowledging. Metadata changes follow the same save-before-
commit rule. Write failures return an error without consuming a revision or changing
live permissions. Exact operation retries remain idempotent after restart.

Files are created with mode `0600` in a directory created with mode `0700`; they
contain bearer credentials and should remain private. File fsync + atomic rename
and process restart are tested. Power-loss durability, network filesystems,
encryption at rest, independent backup scheduling and database replication are not
established. Never run two services against one directory. If a lock is invalid,
inspect it and verify no service is running before repairing it; corrupt documents
are preserved for recovery rather than silently reset.

The programmatic test harness can omit storage and run memory-only rooms. The UI
reports **saved on server disk** or **memory-only server** from the server snapshot;
it does not infer durability from browser autosave.

## Editing and reconnect

Shared mode (`?shared=1&room=…&server=…`) uses the main editor canvas, layers,
inspector, components, and asset tools. Page navigation is participant-local.
Native editor mutations are collected into one committed `document_changes`
operation per synchronous action or explicit gesture transaction. This command
contains typed entity targets and property compare-and-set values, including
resolved layout/component effects; it is not a replacement of the whole document
or a bypass for `recorded_edit`.

A working engine provides live gesture previews. The accepted head remains
separate; after submitting, the editor shows confirmed state and blocks further
mutations until acknowledgment or explicit resolution. Server and browser validate
the same changes. HTTP POST establishes order; authenticated fetch/SSE distributes
accepted envelopes. Same-property retry conflicts do not overwrite accepted work.

**Make local copy** stores an independent project in the Library, clears the shared
journal, and opens the local editor. It is disabled while an edit is unresolved.
Normal `.libra` download retains accepted document history but contains no room
credentials. Embedded resources travel in the document/operation payloads; there
is no separate object-store upload service. Shared cursors are page-scoped and
remote selections are shown on the current page.

Reconnect loads a validated full snapshot while retaining one unacknowledged local
intent separately. Already accepted retries are deduplicated. A stale operation
remains recoverable with **Retry against latest revision**, download, or confirmed
discard. Further mutations are disabled while one is pending. A viewer downgrade
retains pending intent but disables sending/retrying; revocation stops reconnects.
This is snapshot fallback and explicit retry, not automatic offline merging.

Same-tab reload of the main shared editor automatically resumes its stored session
and pending intent. The legacy prototype requires **Join room** to resume. Leaving disconnects without deleting credentials. Credentials live in
session storage: closing the tab or clearing browser storage may lose access to
that actor, including owner management. Account-backed recovery is not implemented.
Download pending intent before closing when it must survive independently; the JSON
operation download is a recovery artifact, not an automatic import workflow.
Document downloads contain accepted state and history, excluding pending intent.

## API and limits

- `POST /rooms`: create an empty room, or restore a supplied native document into
  a new room. Returns the creator's owner credentials and an editor invitation.
- `POST /rooms/:id/join`: exchange a valid invitation for server-issued credentials.
- `GET /rooms/:id/events`: authenticated snapshot, ordered operations, access and
  presence events.
- `POST /rooms/:id/operations`: owner/editor only; actor must match bearer session.
- `GET /rooms/:id/backup`: authenticated `.libra` envelope, no room credentials.
- `GET/POST /rooms/:id/invitations`: owner-only list/create/revoke.
- `GET/POST /rooms/:id/participants`: authenticated roster; owner-only access changes.
- `POST /rooms/:id/profile`: update the acting participant's name.
- `POST /rooms/:id/presence`: authenticated, validated ephemeral cursor/selection.

Development limits: 32 rooms, 64 issued sessions per room (including revoked
sessions), 64 concurrent streams per room, 100 invitations per room, 32 MiB request
bodies, 100 selected IDs and 2,000 accepted operations per room. Presence permits
at most 20 updates/second per actor. Streams with more than 2 MiB queued output
are disconnected. File writes and document validation run synchronously; each
accepted operation copies/revalidates the journal and rewrites its room file.
These limits are not production performance or scale claims.

Accounts, workspaces, commenter roles, ownership transfer/recovery, PostgreSQL/object
storage, comments, bounded replay/compaction, viewport following and production deployment remain open. Capability sessions and
local private files do not complete the planned business identity/access system.

## Verification

```sh
npm run test:collaboration
```

Server tests cover atomic write failure, restart/replay, lock/corruption handling,
role enforcement, invitation expiry/revocation, live access changes, profile names,
cursor/selection validation and expiry, and isolated backup restoration. Browser
tests run three independent sessions through live roles/presence, server restart,
stale-intent recovery, revocation and restoration. Desktop/narrow layouts are
inspected. `npm run check` also runs the existing local-editor suite.

The full-editor regression suite additionally covers mixed-document publication,
independent pages, embedded resources, layout/component/style updates, local forks,
and stale/conflicting gestures through the shared editor adapter.
