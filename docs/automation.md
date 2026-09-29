# Local CLI and MCP automation

The community edition includes a local CLI and a stdio MCP server. Both use the same automation API and existing Rust/WASM engine as the editor. This first version works with disk files; it does not connect to browser autosaves or live collaboration rooms.

## Setup

Requires Node.js, npm, and the Rust/wasm-pack build prerequisites used by the project:

```sh
npm install
npm run build:collaboration
npm run cli -- --help
```

Use `node scripts/openlibra.mjs` or `npm run cli --` from the checkout. Optionally run `npm link` to register the `openlibra` executable locally. The generated Node WASM module is in `target/collaboration-wasm`; it must be rebuilt after engine changes.

## CLI workflow

```sh
openlibra create design.libra
openlibra inspect design.libra
openlibra validate design.libra
openlibra nodes design.libra --limit 100
openlibra template rectangle
openlibra apply design.libra --operations edits.json --expected-sha256 HASH --output updated.libra
```

Commands return JSON. Errors go to stderr with a nonzero exit status. `--root DIRECTORY` sets the workspace boundary (default: current directory). Document and operations-file paths must resolve inside it, including paths through symlinked directories. Existing parent directories are required.

Inspection returns page IDs, node counts, schema version, operation revision, and a SHA-256 of the exact file bytes. A document without operation history has revision zero and no operation document ID until its first edit.

`nodes` accepts `--page UUID`, `--offset N`, and `--limit N` (1–200). It returns complete native nodes, including geometry and styling. MCP also supports filtering by node IDs.

`template` returns a complete native node with a fresh UUID. Supported templates: rectangle, frame, text, ellipse, polygon, star, line. Use its `node` value as the `node` field of a `create_node` command, adjusting name, position, size, and paint as needed.

An `edits.json` file is an array of commands, for example:

```json
[
  {
    "type": "move_nodes",
    "page_id": "PAGE_UUID",
    "node_ids": ["NODE_UUID"],
    "dx": 24,
    "dy": 0
  },
  {
    "type": "set_properties",
    "page_id": "PAGE_UUID",
    "node_id": "NODE_UUID",
    "properties": { "name": "Primary action", "fill": [0.2, 0.8, 0.5, 1] }
  }
]
```

Replace placeholder IDs with IDs from inspection and node reads. Supported commands:

| Command          | Fields besides `type`                        |
| ---------------- | -------------------------------------------- |
| `create_node`    | `page_id, node, before_id` (null appends)    |
| `delete_node`    | `page_id, node_id`                           |
| `move_nodes`     | `page_id, node_ids, dx, dy`                  |
| `set_bounds`     | `page_id, node_id, x, y, width, height`      |
| `resize_node`    | `page_id, node_id, handle, dx, dy`           |
| `set_transform`  | `page_id, node_id, rotation, flip_x, flip_y` |
| `set_properties` | `page_id, node_id, properties`               |
| `reparent_node`  | `page_id, node_id, parent_id, before_id`     |
| `reorder_node`   | `page_id, node_id, target_id, before`        |

The engine validates property types, IDs, locks, geometry, and hierarchy. Batches contain 1–100 commands and become one operation-history entry. Nested batches and raw history patches are not exposed.

## MCP configuration

Configure an MCP client to launch Node directly, using absolute paths:

```json
{
  "mcpServers": {
    "openlibra": {
      "command": "node",
      "args": [
        "/absolute/path/to/openlibra/scripts/openlibra.mjs",
        "mcp",
        "--root",
        "/absolute/path/to/design-workspace"
      ]
    }
  }
}
```

Use the absolute Node executable path if the client does not inherit your shell PATH. Do not launch through an npm command that prints banners to stdout; stdio stdout is reserved for MCP messages.

Tools: `inspect_document`, `validate_document`, `read_nodes`, `node_template`, `create_document`, and `apply_operations`. Inspect first, read relevant nodes, then apply with the returned `expected_sha256`. The server uses the [official MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server).

## File safety and boundaries

- Input files are limited to 64 MiB. Native project envelopes and legacy raw document JSON are accepted; writes use the current project envelope.
- Applying requires the exact inspected hash. A changed file is rejected before saving.
- Output defaults to the input file. A different output path must not already exist.
- Edits run in an isolated engine. A failed command or batch leaves the input file unchanged.
- Saves use a synced temporary file and atomic publication. In-place edits recheck the source hash immediately before replacement.
- Cooperative writers use a `.automation.lock` sidecar. After a crashed process, remove a stale sidecar only after confirming no automation writer remains. External programs that ignore this lock can still race the final replacement.
- No network listener, authentication service, or background browser connection is added.

## Verification and next steps

Run `npm run test:automation` for API, CLI, and real stdio MCP client integration tests. These also run at the end of `npm run check`.

Still planned: PNG previews and SVG export through automation; higher-level layout, component, path, mask, and boolean commands; richer resource inspection; live shared-document access with participant identity and permissions. Core CLI/MCP authoring remains community functionality.
