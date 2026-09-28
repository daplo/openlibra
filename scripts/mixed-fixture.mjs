// Valid native document built from the app's saved defaults; no production hooks.
export async function mixedFixture(page, count) {
  return page.evaluate(async (count) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("open-libra-documents", 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise((resolve) => {
      const request = db
        .transaction("recent-documents")
        .objectStore("recent-documents")
        .getAll();
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    const source = JSON.parse(records[0].json);
    delete source.operation_history; // Fixture changes establish a new baseline.
    const template = source.pages
      .flatMap((page) => page.nodes)
      .find((node) => node.kind === "rectangle");
    const image = document.createElement("canvas");
    image.width = 20;
    image.height = 20;
    const context = image.getContext("2d");
    context.fillStyle = "#397ee8";
    context.fillRect(0, 0, 20, 20);
    context.fillStyle = "#f7bc52";
    context.fillRect(0, 0, 10, 10);
    const assetId = crypto.randomUUID(),
      pageId = crypto.randomUUID();
    const columns = Math.ceil(Math.sqrt(count * 1.7));
    const nodes = Array.from({ length: count }, (_, i) => {
      const kind = ["rectangle", "vector", "image", "text"][i % 4];
      return {
        ...template,
        id: crypto.randomUUID(),
        name: `Mixed ${i}`,
        parent_id: null,
        kind,
        x: (i % columns) * 40,
        y: Math.floor(i / columns) * 34,
        width: 32,
        height: 26,
        rotation: i % 13 === 0 ? 15 : 0,
        flip_x: i % 17 === 0,
        flip_y: false,
        fill: [0.12, 0.65, 0.38, 1],
        stroke: [0.1, 0.2, 0.3, 1],
        stroke_width: i % 7 === 0 ? 1 : 0,
        corner_radii: [3, 3, 3, 3],
        opacity: i % 10 === 0 ? 0.6 : 1,
        locked: false,
        shadows:
          i % 100 === 0
            ? [
                {
                  id: crypto.randomUUID(),
                  kind: "outer",
                  enabled: true,
                  color: [0, 0, 0, 0.4],
                  offset_x: 2,
                  offset_y: 2,
                  blur: 4,
                  spread: 1,
                },
              ]
            : [],
        layout_mode: "none",
        auto_height: false,
        width_sizing: "fixed",
        guide_mode: "none",
        variable_bindings: { padding: [null, null, null, null] },
        text_style_id: null,
        component_id: null,
        component_variant_id: null,
        component_slot_id: null,
        instance_root_id: null,
        text_override: false,
        asset_override: false,
        vector:
          kind === "vector"
            ? { geometry: { type: "ellipse" }, fill_rule: "nonzero" }
            : null,
        text:
          kind === "text"
            ? {
                content: "Aa Bb",
                font_family: "Arial",
                font_size: 8,
                font_weight: 400,
                font_style: "normal",
                line_height: 1.2,
                letter_spacing: 0,
                horizontal_align: "left",
                vertical_align: "top",
                sizing: "fixed",
              }
            : null,
        asset_id: kind === "image" ? assetId : null,
        image_fit: "cover",
      };
    });
    return {
      document: {
        ...source,
        active_page_id: pageId,
        pages: [
          {
            id: pageId,
            name: `Mixed ${count}`,
            description: "Rendering benchmark",
            nodes,
          },
        ],
        components: [],
        media_assets: [
          {
            id: assetId,
            name: "Fixture",
            kind: "image",
            mime_type: "image/png",
            source: image.toDataURL(),
            width: 20,
            height: 20,
            tags: [],
          },
        ],
      },
      firstNode: nodes[0],
    };
  }, count);
}

export async function openFixture(page, document, name = "Mixed.libra") {
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Open…/ }).click();
  await (
    await chooserPromise
  ).setFiles({
    name,
    mimeType: "application/vnd.openlibra+json",
    buffer: Buffer.from(JSON.stringify(document)),
  });
  await page.locator("button.file-name").filter({ hasText: name }).waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector(".scene-content")?.dataset.resources === "ready",
  );
}
