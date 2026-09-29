# Performance measurements

Browser performance is measured from a production build on named hardware. The
browser benchmark opens the `1K Nodes · Baseline` page, verifies that all 1,000
objects are visible, applies 120 pointer and wheel interactions, and reports the
renderer diagnostics from the active interaction interval.

## 2026-08-11 baseline

- Hardware: 14-core Apple M4 Max MacBook Pro, 32-core GPU, 36 GB memory
- Display: 3440 × 1440 at 75 Hz
- Operating system: macOS 15.6.1 (24G90)
- Browser: Google Chrome 151.0.7922.109, headful
- Browser viewport: 1720 × 900
- Objects: 1,000 total, 1,000 visible
- Frame rate: 75 FPS (display refresh capped)
- CPU frame submission: 0.10 ms average
- Rust scene creation: 0.10 ms
- Initial GPU upload: below the diagnostics' 0.01 ms display precision

The result meets the MVP target of 60 FPS with roughly 1,000 visible objects
during pan and zoom.

### UUIDv7 model recheck

After migrating page and node IDs from integers to UUIDv7 on 2026-08-11, the
same headful benchmark rendered 1,000/1,000 visible objects at 60 FPS with a
0.14 ms CPU frame, 0.10 ms Rust scene creation time, and GPU upload below the
diagnostics' 0.01 ms display precision. The model change therefore remains at
the 60 FPS interaction target.

## Reproduce

Build and serve the production application:

```sh
npm run build
npm run preview --workspace @open-libra/web -- --host 127.0.0.1
```

In another terminal, run the benchmark in a visible Chrome window:

```sh
HEADLESS=false npm run benchmark:browser
```

`OPEN_LIBRA_URL` and `CHROME_PATH` can override the default preview URL and
macOS Chrome executable. Headless mode is useful for diagnostics, but the
recorded baseline must come from a headful run on named hardware.

## Shared document painter

Ordinary documents share the Canvas2D painter used by PNG export. Prepared paths and bounds are reused between redraws, offscreen subtrees are culled, and static scenes skip redraw entirely. Simple translucent leaves avoid isolation layers; other layers use cropped subtree surfaces. Effects cache shape-local raster masks. Documents with at least 2,000 nodes retain zoom-bucket scene tiles for interaction. A document or resource change invalidates those tiles; PNG paints directly at the requested scale.

### 2026-09-27 mixed-document measurements

Production build, Apple M1 Max, 64 GiB RAM, macOS 26.6.2 (25G83), Chrome 153.0.8010.54 **headful**, viewport 1720 × 900. The fixture mixes equal numbers of rectangles, ellipses, images and text, with rotation/flips, strokes, opacity on 10% of nodes and shadows on 1%. The script imports an actual `.libra` file and performs 80 wheel interactions and 40 drag-pan steps after Fit.

| Objects | Steady redraw samples | Mean CPU paint | p95 CPU paint | Maximum cold paint during import/Fit | Maximum scene-tile cache |
| ------- | --------------------- | -------------- | ------------- | ------------------------------------ | ------------------------ |
| 1,000   | 357                   | 5.35 ms        | 6.00 ms       | 13.80 ms                             | 0 MiB (direct painter)   |
| 10,000  | 365                   | 2.02 ms        | 2.10 ms       | 162.10 ms                            | 32 MiB                   |

These are **CPU paint/submission timings**, not end-to-end frame rate or a GPU/compositor measurement. They exclude React/document-command time. The warm-cache targets are p95 ≤16.7 ms at 1K and ≤33.3 ms at 10K on this machine; both pass. The 10K result benefits from cached tiles and does not establish fast continuous editing, cold starts or zooming into uncached resolution buckets. Full invalidation can still cause a visible pause; incremental dirty-tile updates remain future work.

The first headless run before the optimizations averaged 47.9 ms at 1K and 668.5 ms at 10K. Afterward, a headless check averaged 5.24 ms and 2.03 ms respectively. These diagnostic runs are separate from the headful table.

The 10K import/Fit sequence built 84 tiles across its animated zoom levels while retaining no more than 32 MiB. The 1K run used at most 0.013 MiB of active opacity surfaces. Pixel tests separately cover deep transparent groups, small-subtree isolation, tile seams, resource invalidation and the 64 MiB active-opacity guard. Retained effect and opacity scratch caches have independent 16 MiB and 32 MiB limits. These figures are not a total process-memory measurement.

Raw headful results: [2026-09-27-mixed.json](benchmarks/2026-09-27-mixed.json).

```sh
# After building and serving the production app as above:
HEADLESS=false npm run benchmark:mixed
# Optional: OPEN_LIBRA_URL, CHROME_PATH, MIXED_COUNTS=1000,10000
```

Synthetic flat-rectangle pages continue using WebGPU. Their earlier FPS measurements must not be applied to mixed documents.

## Page navigation and browser snapshots

Page navigation for already materialized pages bypasses document editing and operation-history generation. The editor caches one committed JSON snapshot per engine/revision; navigation updates only its root active-page field. Gestures continue to expose their committed baseline until the transaction finishes. Snapshot serialization streams directly from Rust structs instead of constructing an intermediate JSON tree.

Autosave reuses that snapshot, compares document strings directly, and updates the saved Library row without reloading every full project. Browser project and recovery records larger than 8 MiB use asynchronous gzip compression to avoid oversized IndexedDB records. Reads transparently restore the original JSON; existing uncompressed records remain supported. Portable .libra files are unchanged.

The synthetic 50K/100K pages still generate their nodes and initial journal on first entry; that one-time work is distinct from subsequent navigation. Regression coverage includes snapshot invalidation across edits/undo/redo and compressed browser storage, recovery, unchanged-save revisions, and stale-write rejection.

Repeated page visits reuse at most two parsed page read models. Any editor
refresh caused by an edit clears that cache. Ordinary page navigation does not
serialize or autosave the document: its selected page is tab-local session state,
restored on reload. First-time benchmark generation still adds real document
content and must be saved. Downloads and later content saves include the current
page. Cross-tab conflict checks read revisions without decompressing documents;
Library listings retain metadata only and load project contents on demand.

The browser navigation regression measures click-to-paint time separately from
browser automation overhead. Tests also ensure metadata reads do not decompress
large document payloads and retain cross-tab conflict protection.

Current-schema project loading deserializes the document and journal directly,
without a second generic JSON tree. Legacy formats still use migrations. Replay
still validates every operation and the final head; identical heads avoid allocating
full property-diff maps. Already-populated benchmark pages no longer clone and
record an unchanged document during load.
