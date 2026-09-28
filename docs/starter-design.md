# Moss finance starter

Open **File → Open starter design** to create a separate editable copy. The current project is saved first; existing browser projects are never silently replaced. New browser installations also start with this design.

Four 360 × 780 mobile artboards cover welcome, wallet, spending analytics, and savings goals. All artwork is native document content, not a flattened screenshot.

- Six components: primary button, quick action, transaction row, bottom navigation, spending summary, and goal card.
- Navigation, transaction rows, and quick actions use actual instances with text/asset overrides. Goal cards have three variants.
- Row/column auto layouts handle headings, cards, actions, transaction columns, navigation, chart bars, and goal details.
- Eight linked Inter text styles separate display, headings, body, labels, and right-aligned amounts. No text uses runs of spaces to simulate columns.
- Shared spacing variables bind gaps and padding; the mobile-width variable binds artboards. Color swatches remain saved colors, not semantic color tokens.
- Eighteen embedded SVG icons share a consistent stroke style. Charts and progress bars use editable shapes.

The artboards target a fixed mobile size. Full responsive constraints and two-axis hug/fill sizing remain on the MVP roadmap. Local fonts, resources, and supported exports follow the same capabilities and limits as other editor documents.

Source: `crates/scene-wasm/src/finance_demo.rs`. Rust tests verify layout containment, component reuse, and save/reopen validity; the regular UI suite exercises authoring and component workflows with this starter.
