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
