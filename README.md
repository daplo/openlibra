# Open Libra

Open Libra is a cloud-first, collaborative product-design tool for the browser. It uses one shared editor engine with task-focused modes for designers, developers, and reviewers.

[Open Open Libra on GitHub Pages](https://daplo.github.io/openlibra/)

The first prototype focuses on structured web and mobile interface design: tokens, frames, responsive layout, constraints, layers, transforms, undo/redo, comments, and multiplayer presence.

## Documentation

- [Product brief](docs/product-brief.md)
- [Technical architecture](docs/architecture.md)
- [Domain model](docs/domain-model.md)
- [Prototype roadmap](docs/roadmap.md)
- [Performance measurements](docs/performance.md)

## Current status

Level 1 engine spike is implemented. It renders 1,000 Rust-generated objects through a single batched WASM boundary and an instanced WebGPU pipeline, with pan/zoom and live performance diagnostics.

## Run the spike

Requirements: current desktop Chrome or Edge with WebGPU, Node.js 22+, Rust, the `wasm32-unknown-unknown` Rust target, and `wasm-pack`.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Drag to pan, use the wheel to zoom, and double-click the canvas to exercise the DOM text-editing overlay.

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
