# ADR 0001: Level 1 editor boundaries

Status: accepted for the prototype

## Context

Open Libra needs a browser editor that can later share domain behavior with server and native processes. The first spike must validate Rust/WASM, GPU rendering, text editing, and centralized collaboration assumptions without prematurely implementing the full editor.

## Decision

### Document and scene computation

Rust owns scene generation and will own the editable document model. JavaScript requests coarse operations and receives packed, batched scene updates. The Level 1 scene crosses the boundary as one `Float32Array` containing eight floats per rectangle.

This first transfer copies data. Later levels should measure dirty-range updates and direct views into WASM memory before choosing a more complex zero-copy protocol.

### Rendering

The browser shell owns WebGPU setup and resource submission for the initial spike. One six-vertex rectangle is instanced 1,000 times, with bounds and colors stored in a GPU instance buffer. Camera movement changes only a small uniform buffer.

The renderer boundary remains narrow so GPU ownership can move behind Rust or a shared render crate later if native reuse justifies it.

### Text editing

Designed text will be rendered on the canvas, but active editing will use a positioned DOM control. This preserves browser input, selection, IME, clipboard, and accessibility behavior. Level 1 includes a double-click overlay experiment; font shaping and exact canvas/DOM metric parity remain unresolved.

### Collaboration

A central server assigns monotonically increasing revisions. Clients apply accepted property operations in server order. The Level 1 test proves convergence for out-of-order receipt after revision sorting and last-writer-wins property updates.

This is not yet sufficient for tree operations. Reparenting, ordered children, deletion, rejection, reconnects, and collaborative undo need explicit operation semantics in later levels.

## Consequences

- React is not a second owner of editable scene state.
- WASM calls must be coarse and measurable.
- Pan and zoom do not regenerate or re-upload scene instances.
- WebGPU is required for the spike; compatibility rendering is deferred.
- Actual FPS must be measured in a supported browser on named hardware, not inferred from build success.

## Level 1 evidence

- Rust deterministically generates 1,000 packed rectangles.
- Rust tests cover object count, deterministic generation, and property-operation convergence.
- TypeScript compiles against generated WASM bindings and WebGPU types.
- The UI reports Rust scene-build time, initial GPU upload time, CPU frame-submission time, FPS, and object count.
- The renderer supports cursor-centered zoom and pointer panning.
- A DOM text-editing overlay tests the proposed editing boundary.
