# Open Libra

Open Libra is a browser design tool combining interface design and vector illustration in one document. Local projects work without an account; optional collaboration runs through a development service; shared review is planned.

[Open Open Libra on GitHub Pages](https://daplo.github.io/openlibra/)

The current prototype includes local projects, frames, basic auto layout, numeric variables, text styles, components, vector primitives, images, and local undo/redo. The next milestones add dependable vector authoring, responsive design, multiplayer editing, and review.

## Documentation

- [Product brief](docs/product-brief.md)
- [Technical architecture](docs/architecture.md)
- [Domain model](docs/domain-model.md)
- [Implementation audit and active feature TODO](docs/TODO.md)
- [Design and collaboration roadmap](docs/roadmap.md)
- [MVP delivery checklist](docs/mvp.md)
- [Editable finance starter](docs/starter-design.md)
- [Community and business model](docs/community-and-business.md)
- [Performance measurements](docs/performance.md)

## Current status

A local editor is implemented with Rust/WASM document state, WebGPU plus Canvas2D rendering, `.libra` save/open, browser autosave/recovery, partial Figma import, frame PNG export, and single-vector SVG export. The main editor supports [shared mixed-content documents](docs/collaboration-prototype.md) through a development server with durable files, capability roles, per-user undo, reconnect recovery, and live presence. Production collaboration, account authentication, and comments remain planned. See the [audit](docs/TODO.md#what-is-implemented) for feature limitations and priorities.

## Run the editor

Requirements: current desktop Chrome or Edge with WebGPU, Node.js 22+, Rust, the `wasm32-unknown-unknown` Rust target, and `wasm-pack`.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Use the toolbar to create frames, text and shapes, and the File menu to open or download a project.

Run all non-browser checks with:

```sh
npm test
npm run build
```

Run individual formatting and lint checks with `npm run format` and
`npm run lint`. The complete verification pipeline, including the production
build and headless browser UI smoke tests, is:

```sh
npm run check
```

## Run the collaboration experiment

Run `npm run dev:collaboration` alongside `npm run dev`, then choose **Share document** in the editor. Publish a shared copy and open an invitation from **People and access** in another browser profile. Rooms persist in `.openlibra-collaboration/`; the UI reports the active storage mode. See [setup and limitations](docs/collaboration-prototype.md).

## Local CLI and MCP server

Run `npm run build:collaboration`, then `npm run cli -- --help` for file inspection, validation, node templates, and atomic edit batches. Launch the MCP server with `node scripts/openlibra.mjs mcp --root /absolute/workspace`. See [automation setup and reference](docs/automation.md). Verify with `npm run test:automation`.
