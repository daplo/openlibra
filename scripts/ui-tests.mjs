import { testPageNavigation } from "./page-navigation-tests.mjs";
import { testLargeStorage } from "./large-storage-tests.mjs";
import { testBooleans } from "./boolean-tests.mjs";
import { testMasks } from "./mask-tests.mjs";
import { testPathEditing } from "./path-editing-tests.mjs";
import { testOperations } from "./operation-tests.mjs";
import { testRenderingInteraction } from "./rendering-interaction-tests.mjs";
import { testRendering } from "./rendering-tests.mjs";
import assert from "node:assert/strict";
import { testCrossTab } from "./cross-tab-tests.mjs";
import { testProjectSafety } from "./project-safety-tests.mjs";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = Number(process.env.OPEN_LIBRA_TEST_PORT ?? 4174);
const url = `http://127.0.0.1:${port}/openlibra/`;
const defaultChrome =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executablePath = process.env.CHROME_PATH ?? defaultChrome;
const preview = spawn(
  "npm",
  [
    "run",
    "preview",
    "--workspace",
    "@open-libra/web",
    "--",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
);

let previewOutput = "";
preview.stdout.on("data", (chunk) => (previewOutput += chunk));
preview.stderr.on("data", (chunk) => (previewOutput += chunk));

async function waitForPreview() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (preview.exitCode !== null)
      throw new Error(`Preview exited early.\n${previewOutput}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The preview server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Preview did not start.\n${previewOutput}`);
}

let browser;
try {
  await waitForPreview();
  browser = await chromium.launch({
    ...(existsSync(executablePath) ? { executablePath } : {}),
    headless: process.env.HEADLESS !== "false",
    args: ["--enable-unsafe-webgpu"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      message.text() !==
        "Failed to load resource: the server responded with a status of 404 (Not Found)"
    )
      browserErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (
      response.status() >= 400 &&
      new URL(response.url()).pathname !== "/favicon.ico"
    )
      browserErrors.push(`${response.status()} ${response.url()}`);
  });

  await page.goto(url);
  await page
    .getByTestId(/^layer-node-/)
    .first()
    .waitFor();

  const leftPanel = page.locator(".left-panel");
  const initialPanelWidth = (await leftPanel.boundingBox()).width;
  await page.getByRole("button", { name: "Resize left sidebar" }).focus();
  await page.keyboard.press("ArrowRight");
  assert.equal((await leftPanel.boundingBox()).width, initialPanelWidth + 10);

  const rulerBounds = await page.locator(".horizontal-ruler").boundingBox();
  const toolDockBounds = await page.locator(".tool-rail").boundingBox();
  assert.ok(rulerBounds && toolDockBounds);
  assert.ok(
    toolDockBounds.y >= rulerBounds.y + rulerBounds.height,
    "the tool dock sits below the horizontal ruler",
  );

  const canvas = page.getByLabel("Open Libra WebGPU editor canvas");
  const waitForTool = (tool) =>
    page.waitForFunction(
      (expected) =>
        document.querySelector('[aria-label="Open Libra WebGPU editor canvas"]')
          ?.dataset.tool === expected,
      tool,
    );
  await waitForTool("select");
  await page.keyboard.press("h");
  await waitForTool("hand");
  await page.keyboard.press("v");
  await waitForTool("select");
  await page.keyboard.down("Space");
  await waitForTool("hand");
  await page.keyboard.up("Space");
  await waitForTool("select");
  const requestAction = page
    .locator('[data-testid^="layer-node-"][data-node-kind="group"]')
    .filter({ hasText: "Payment card / Savings" })
    .first();
  const sendAction = page
    .locator('[data-testid^="layer-node-"][data-node-kind="group"]')
    .filter({ hasText: "Payment card / Everyday" })
    .first();
  await requestAction.locator(".layer-main").dblclick();
  await page.waitForTimeout(350);
  await sendAction.locator(".layer-main").click();
  const spacingCanvasBounds = await canvas.boundingBox();
  assert.ok(spacingCanvasBounds);
  await page.keyboard.down("Alt");
  await page.mouse.move(
    spacingCanvasBounds.x + spacingCanvasBounds.width / 2,
    spacingCanvasBounds.y + spacingCanvasBounds.height / 2,
  );
  await page.waitForFunction(
    () =>
      document.querySelector(".spacing-overlay")?.dataset.visible === "true",
  );
  await page.keyboard.up("Alt");
  await page.waitForFunction(
    () =>
      document.querySelector(".spacing-overlay")?.dataset.visible === "false",
  );
  await page.getByTitle("Zoom to fit (F)").click();
  await page.keyboard.press("2");
  assert.match(
    (await page
      .getByRole("button", { name: "Developer" })
      .getAttribute("class")) ?? "",
    /active/,
  );
  await page.keyboard.press("1");

  await page.getByRole("button", { name: "View", exact: true }).click();
  const gridMenuItem = page.getByRole("menuitemcheckbox", {
    name: /Show grid/,
  });
  assert.equal(await gridMenuItem.getAttribute("aria-checked"), "false");
  await gridMenuItem.click();
  assert.equal(await gridMenuItem.getAttribute("aria-checked"), "true");
  await page.getByTestId("canvas-grid").waitFor();
  const toolbarBottom = page.getByRole("menuitemradio", { name: "Bottom" });
  await toolbarBottom.click();
  assert.equal(await toolbarBottom.getAttribute("aria-checked"), "true");
  const stageBounds = await page.locator(".stage").boundingBox();
  const bottomDockBounds = await page.locator(".tool-rail").boundingBox();
  assert.ok(stageBounds && bottomDockBounds);
  assert.ok(
    Math.abs(
      stageBounds.y +
        stageBounds.height -
        bottomDockBounds.y -
        bottomDockBounds.height -
        12,
    ) < 1,
    "the bottom toolbar respects its 12px inset",
  );
  await page.getByRole("menuitemradio", { name: "Top" }).click();
  await page.getByRole("button", { name: "View", exact: true }).click();
  await page.keyboard.press("Shift+g");
  assert.equal(await page.getByTestId("canvas-grid").count(), 0);
  await page.keyboard.press("Shift+g");
  await page.getByTestId("canvas-grid").waitFor();

  const canvasBounds = await canvas.boundingBox();
  assert.ok(canvasBounds, "the editor canvas has measurable bounds");
  await page.mouse.click(canvasBounds.x + 124, canvasBounds.y + 196);
  assert.equal(await page.locator(".layer-row.selected").count(), 1);

  const zoomLabel = page.locator(".zoom-controls button").nth(1);
  const zoomBefore = await zoomLabel.textContent();
  await page.mouse.move(
    canvasBounds.x + canvasBounds.width / 2,
    canvasBounds.y + canvasBounds.height / 2,
  );
  await page.mouse.wheel(0, -300);
  await page.waitForFunction(
    (previous) =>
      document.querySelectorAll(".zoom-controls button")[1]?.textContent !==
      previous,
    zoomBefore,
  );
  await page.mouse.move(
    canvasBounds.x + canvasBounds.width - 140,
    canvasBounds.y + canvasBounds.height - 140,
  );
  await page.mouse.down();
  await page.mouse.move(
    canvasBounds.x + canvasBounds.width - 40,
    canvasBounds.y + canvasBounds.height - 40,
  );
  await page.locator(".selection-marquee").waitFor();
  await page.mouse.up();
  await page.locator(".selection-marquee").waitFor({ state: "detached" });

  const firstLayer = page.getByTestId(/^layer-node-/).first();
  const firstLayerId = await firstLayer.getAttribute("data-node-id");
  assert.ok(firstLayerId, "the first layer exposes its engine node ID");
  await firstLayer.locator(".layer-main").click();
  assert.equal(await firstLayer.getAttribute("data-selected"), "true");

  const cornerInputs = page.locator(".corner-grid input");
  assert.equal(await cornerInputs.count(), 4);
  await cornerInputs.first().click();
  await cornerInputs
    .first()
    .press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await cornerInputs.first().pressSequentially("20");
  assert.equal(await cornerInputs.first().inputValue(), "20");
  await cornerInputs.first().press("Enter");
  assert.equal(await cornerInputs.first().inputValue(), "20");
  await page.getByRole("button", { name: "Unlink radius values" }).click();

  const alignment = page.getByRole("group", { name: "Alignment" });
  await alignment.getByRole("button", { name: "Outside border" }).click();
  assert.equal(
    await alignment
      .getByRole("button", { name: "Outside border" })
      .getAttribute("aria-pressed"),
    "true",
  );
  const join = page.getByRole("group", { name: "Join" });
  await join.getByRole("button", { name: "Straight join" }).click();
  assert.equal(
    await join
      .getByRole("button", { name: "Straight join" })
      .getAttribute("aria-pressed"),
    "true",
  );

  await page.getByRole("button", { name: "Row", exact: true }).click();
  await page.getByRole("button", { name: "Unlink padding values" }).waitFor();
  const paddingInputs = page.locator(".padding-grid input");
  await paddingInputs.first().click();
  await paddingInputs
    .first()
    .press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await paddingInputs.first().pressSequentially("20");
  assert.equal(await paddingInputs.first().inputValue(), "20");
  await paddingInputs.first().press("Enter");
  assert.equal(await paddingInputs.first().inputValue(), "20");
  await page.getByRole("button", { name: "Unlink padding values" }).click();

  await firstLayer.getByRole("button", { name: /^Rename / }).click();
  const nameInput = firstLayer.locator("input.layer-name-input");
  await nameInput.fill("UI test layer");
  await nameInput.press("Enter");
  assert.match(await firstLayer.innerText(), /UI test layer/);
  const layerSearch = page.getByRole("searchbox", { name: "Search layers" });
  await layerSearch.fill("UI test layer");
  assert.equal(await page.getByTestId(/^layer-node-/).count(), 1);
  await layerSearch.fill("");

  const pngDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "PNG 1×" }).click();
  const pngDownload = await pngDownloadPromise;
  assert.equal(pngDownload.suggestedFilename(), "UI test layer@1x.png");

  await page.getByRole("button", { name: "Developer" }).click();
  await page.getByText("UI test layer", { exact: true }).last().waitFor();
  await page.getByRole("button", { name: "Copy CSS" }).click();
  await page.getByRole("button", { name: "Copied" }).waitFor();
  await page.getByRole("button", { name: "Design" }).click();

  await firstLayer.getByRole("button", { name: /^Lock / }).click();
  assert.equal(await firstLayer.getAttribute("data-locked"), "true");
  assert.equal(await firstLayer.getAttribute("data-selected"), "false");
  await firstLayer.getByRole("button", { name: /^Unlock / }).click();
  assert.equal(await firstLayer.getAttribute("data-locked"), "false");

  const rectangles = page.locator(
    '[data-testid^="layer-node-"][data-node-kind="rectangle"]',
  );
  const rectangleCount = await rectangles.count();
  await page.getByRole("button", { name: "Rectangle" }).click();
  await rectangles.nth(rectangleCount).waitFor();
  assert.equal(await rectangles.count(), rectangleCount + 1);
  const createdRectangle = rectangles.nth(rectangleCount);
  assert.equal(await createdRectangle.getAttribute("data-selected"), "true");
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+C" : "Control+C",
  );
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+V" : "Control+V",
  );
  assert.equal(await rectangles.count(), rectangleCount + 2);
  await page.getByRole("button", { name: "Delete layer" }).click();
  await createdRectangle.locator(".layer-main").click();
  await page.getByRole("button", { name: "Delete layer" }).click();
  assert.equal(await rectangles.count(), rectangleCount);

  const textLayers = page.locator(
    '[data-testid^="layer-node-"][data-node-kind="text"]',
  );
  const textCount = await textLayers.count();
  await page.getByRole("button", { name: "Text" }).click();
  const textLayer = textLayers.nth(textCount);
  await textLayer.waitFor();
  const textEditor = page.getByRole("textbox", { name: "Edit text content" });
  await textEditor.fill("Typography works");
  await textEditor.press("Tab");
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="Text content"]')?.value ===
      "Typography works",
  );
  assert.equal(
    await page.getByRole("textbox", { name: "Text content" }).inputValue(),
    "Typography works",
  );
  const unchangedTextBounds = {
    width: await page.getByRole("spinbutton", { name: "W" }).inputValue(),
    height: await page.getByRole("spinbutton", { name: "H" }).inputValue(),
  };
  await textLayer.locator(".layer-main").dblclick();
  assert.equal(await textEditor.count(), 0);
  assert.equal(
    await page.getByRole("textbox", { name: "Text content" }).inputValue(),
    "Typography works",
  );
  assert.equal(
    await page.getByRole("spinbutton", { name: "W" }).inputValue(),
    unchangedTextBounds.width,
  );
  assert.equal(
    await page.getByRole("spinbutton", { name: "H" }).inputValue(),
    unchangedTextBounds.height,
  );
  const fontFamily = page.getByRole("combobox", { name: "Font family" });
  await fontFamily.selectOption("Roboto");
  assert.equal(await fontFamily.inputValue(), "Roboto");
  await page.waitForFunction(() =>
    [...document.querySelectorAll("link[data-open-libra-font]")].some(
      (link) => link.dataset.openLibraFont === "Roboto",
    ),
  );
  const fontSize = page.getByRole("spinbutton", { name: "Size" });
  await fontSize.fill("32");
  await fontSize.press("Enter");
  assert.equal(await fontSize.inputValue(), "32");
  const textBox = page.getByRole("group", { name: "Text box" });
  const inactiveTextBoxStyle = await textBox
    .getByRole("button", { name: "Fixed" })
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return [style.color, style.backgroundColor, style.borderColor];
    });
  assert.notEqual(inactiveTextBoxStyle[1], "rgba(0, 0, 0, 0)");
  assert.notEqual(inactiveTextBoxStyle[0], inactiveTextBoxStyle[1]);
  await textBox.getByRole("button", { name: "Auto height" }).click();
  assert.equal(
    await textBox
      .getByRole("button", { name: "Auto height" })
      .getAttribute("aria-pressed"),
    "true",
  );
  const activeTextBoxStyle = await textBox
    .getByRole("button", { name: "Auto height" })
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return [style.color, style.backgroundColor, style.borderColor];
    });
  assert.notDeepEqual(activeTextBoxStyle, inactiveTextBoxStyle);
  const propertyControlHeights = await page
    .locator(
      '.right-panel .property-section-body button, .right-panel .property-section-body input:not([type="range"]):not([type="color"]):not(.transform-controls input), .right-panel .property-section-body select, .right-panel .transform-controls label',
    )
    .evaluateAll((elements) =>
      elements
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => getComputedStyle(element).height),
    );
  assert.ok(propertyControlHeights.length > 0);
  assert.deepEqual([...new Set(propertyControlHeights)], ["30px"]);
  const typographyGridMetrics = await page
    .locator(".typography-number-grid")
    .evaluate((grid) => ({
      clientWidth: grid.clientWidth,
      scrollWidth: grid.scrollWidth,
      valueWidths: [...grid.querySelectorAll('input[type="number"], select')]
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => element.getBoundingClientRect().width),
    }));
  assert.equal(
    typographyGridMetrics.scrollWidth,
    typographyGridMetrics.clientWidth,
  );
  assert.ok(typographyGridMetrics.valueWidths.every((width) => width >= 58));
  const horizontal = page.getByRole("group", { name: "Horizontal" });
  await horizontal.getByRole("button", { name: "Align center" }).click();
  assert.equal(
    await horizontal
      .getByRole("button", { name: "Align center" })
      .getAttribute("aria-pressed"),
    "true",
  );

  assert.equal(
    await page
      .getByRole("combobox", { name: "Width variable" })
      .locator("option:checked")
      .textContent(),
    "px",
  );
  await page.getByRole("button", { name: "Create height variable" }).click();
  assert.match(
    await page
      .getByRole("combobox", { name: "Height variable" })
      .locator("option:checked")
      .textContent(),
    /Height \/ /,
  );
  await page
    .getByRole("button", { name: "Create text style from selection" })
    .click();
  assert.match(
    await page
      .getByRole("combobox", { name: "Text style" })
      .locator("option:checked")
      .textContent(),
    /style$/,
  );
  await horizontal.getByRole("button", { name: "Align left" }).click();
  assert.equal(
    await horizontal
      .getByRole("button", { name: "Align left" })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await page.getByRole("combobox", { name: "Text style" }).inputValue(),
    "",
  );

  await page.getByRole("button", { name: "Assets" }).click();
  await page.getByTestId("document-vault").waitFor();
  await page
    .getByText(/auto height/)
    .first()
    .waitFor();
  await page
    .getByText(/H center/)
    .first()
    .waitFor();
  const vaultMetrics = await page
    .getByTestId("document-vault")
    .evaluate((vault) => ({
      clientWidth: vault.clientWidth,
      scrollWidth: vault.scrollWidth,
      controlHeights: [
        ...vault.querySelectorAll(
          'button:not(.media-asset-card), input:not([type="file"])',
        ),
      ]
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => getComputedStyle(element).height),
    }));
  assert.equal(vaultMetrics.scrollWidth, vaultMetrics.clientWidth);
  assert.deepEqual([...new Set(vaultMetrics.controlHeights)], ["30px"]);
  await page.getByLabel("New variable name").fill("Size / Text width");
  await page.getByLabel("New variable value").fill("240");
  await page.getByRole("button", { name: "Add variable" }).click();
  await page.getByLabel("New text style name").fill("Body / Test");
  await page.getByRole("button", { name: "Add from selection" }).click();
  await page.getByTestId("image-upload").setInputFiles({
    name: "pixel.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page.getByTitle("Insert pixel.png").waitFor();
  await page
    .getByLabel("Open Libra WebGPU editor canvas")
    .evaluate((canvas) => {
      const bytes = Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        ),
        (character) => character.charCodeAt(0),
      );
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([bytes], "dropped.png", { type: "image/png" }),
      );
      canvas.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          clientX: canvas.getBoundingClientRect().left + 500,
          clientY: canvas.getBoundingClientRect().top + 300,
          dataTransfer: transfer,
        }),
      );
    });
  await page.getByTitle("Insert dropped.png").waitFor();
  await page.getByTestId("icon-library-Home").click();
  await page.getByRole("button", { name: "Layers" }).click();
  const imageLayer = page.locator(
    '[data-testid^="layer-node-"][data-node-kind="image"]',
  );
  assert.ok((await imageLayer.count()) >= 2);
  const iconLayer = page
    .locator('[data-testid^="layer-node-"][data-node-kind="icon"]')
    .last();
  await imageLayer.first().waitFor();
  await iconLayer.waitFor();
  await imageLayer.first().locator(".layer-main").click();
  await page
    .getByRole("combobox", { name: "Image fit" })
    .selectOption("contain");
  assert.equal(
    await page
      .getByRole("combobox", { name: "Image fit" })
      .locator("option:checked")
      .textContent(),
    "Contain",
  );
  await textLayer.locator(".layer-main").click();
  await page
    .getByRole("combobox", { name: "Width variable" })
    .selectOption({ label: "Size / Text width · 240" });
  await page
    .getByRole("combobox", { name: "Text style" })
    .selectOption({ label: "Body / Test" });
  assert.match(
    await page
      .getByRole("combobox", { name: "Width variable" })
      .locator("option:checked")
      .textContent(),
    /Size \/ Text width/,
  );
  assert.equal(
    await page
      .getByRole("combobox", { name: "Text style" })
      .locator("option:checked")
      .textContent(),
    "Body / Test",
  );

  const componentSource = page
    .locator('[data-testid^="layer-node-"]')
    .filter({ hasText: "Wallet content · Auto layout" })
    .first();
  await componentSource.locator(".layer-main").click();
  await page.getByRole("button", { name: "Create component" }).click();
  await page.getByTestId("component-master-readonly").waitFor();
  assert.equal(await page.getByText("Properties", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "Assets" }).click();
  await page
    .locator(".component-asset-card")
    .filter({ hasText: "Wallet content · Auto layout" })
    .getByRole("button", { name: "Insert Default" })
    .click();
  await page.getByRole("button", { name: "Layers" }).click();
  const createdComponentId =
    await componentSource.getAttribute("data-component-id");
  const componentInstance = page.locator(
    `[data-testid^="layer-node-"][data-component-id="${createdComponentId}"][data-instance-root-id]:not([data-instance-root-id=""])`,
  );
  await componentInstance.first().waitFor();
  await componentInstance.first().locator(".layer-main").click();
  assert.equal(
    await page
      .locator(".selection-overlay")
      .getAttribute("data-component-selection"),
    "true",
  );
  await componentInstance.first().click({ button: "right" });
  await page
    .getByLabel("Open Libra WebGPU editor canvas")
    .evaluate((canvas) => (canvas.dataset.rendererPersistence = "mounted"));
  await page.getByRole("menuitem", { name: "View in library" }).click();
  const componentLibrary = page.getByTestId("component-library-view");
  await componentLibrary.waitFor();
  await componentLibrary
    .getByText("Wallet content · Auto layout", { exact: true })
    .waitFor();
  await componentLibrary.getByRole("button", { name: "Add variant" }).click();
  await componentLibrary.getByText("Variant 2", { exact: true }).waitFor();
  await componentLibrary.getByRole("button", { name: "Edit main" }).click();
  await page.getByTestId("component-isolation").waitFor();
  await page.getByTestId("component-isolation-mask").waitFor();
  assert.equal(
    await page
      .getByLabel("Open Libra WebGPU editor canvas")
      .getAttribute("data-renderer-persistence"),
    "mounted",
  );
  await page.getByLabel("Canvas tools").waitFor();
  await page.getByTestId("component-tree-heading").waitFor();
  assert.equal(await page.getByTestId(/^page-node-/).count(), 0);
  assert.equal(await page.getByText("Diagnostics", { exact: true }).count(), 0);
  assert.equal(await componentSource.getAttribute("data-selected"), "true");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByTestId("component-isolation").waitFor({ state: "detached" });
  await componentInstance.first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "View in library" }).click();
  await page.getByRole("button", { name: "Editor" }).click();

  const pages = page.getByTestId(/^page-node-/);
  const pageCount = await pages.count();
  await page.getByRole("button", { name: "+ Add page" }).click();
  assert.equal(await pages.count(), pageCount + 1);
  assert.equal(await pages.last().getAttribute("data-active"), "true");
  await page
    .getByText("This page is empty. Add a frame or rectangle.")
    .waitFor();
  const addedPage = pages.last();
  await addedPage.getByRole("button", { name: /^Rename / }).click();
  const pageNameInput = addedPage.locator("input.layer-name-input");
  await pageNameInput.fill("Renamed UI page");
  await pageNameInput.press("Enter");
  await addedPage.getByText("Renamed UI page", { exact: true }).waitFor();
  await addedPage.getByRole("button", { name: /^Delete / }).click();
  assert.equal(await pages.count(), pageCount);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Save/ }).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "Engine study.libra");
  const savedDocumentPath = await download.path();
  assert.ok(savedDocumentPath);

  await page.getByRole("button", { name: "Library", exact: true }).click();
  const projectLibrary = page.getByTestId("project-library-view");
  await projectLibrary.waitFor();
  const recentProject = projectLibrary
    .locator(".project-card")
    .filter({ hasText: "Engine study.libra" });
  await recentProject.waitFor();
  assert.ok((await recentProject.locator(".project-preview-node").count()) > 0);
  await recentProject.getByRole("button", { name: /Duplicate/ }).click();
  const duplicatedProject = projectLibrary
    .locator(".project-card")
    .filter({ hasText: "Engine study copy.libra" });
  await duplicatedProject.waitFor();
  await duplicatedProject.getByRole("button", { name: /Archive/ }).click();
  await duplicatedProject.waitFor({ state: "detached" });
  await projectLibrary.getByRole("button", { name: /^Archived/ }).click();
  const archivedProject = projectLibrary
    .locator(".project-card")
    .filter({ hasText: "Engine study copy.libra" });
  await archivedProject.waitFor();
  await archivedProject.getByRole("button", { name: /Restore/ }).click();
  await archivedProject.waitFor({ state: "detached" });
  await projectLibrary.getByRole("button", { name: "All projects" }).click();
  await duplicatedProject.waitFor();
  await page.getByRole("button", { name: "Editor", exact: true }).click();

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: /^New document/ }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid^="page-node-"]').length === 1,
  );
  await page.getByText("Untitled.libra", { exact: true }).waitFor();
  await page
    .getByText("This page is empty. Add a frame or rectangle.")
    .waitFor();

  await page.getByRole("button", { name: "+ Add page" }).click();
  assert.equal(await pages.count(), 2);
  await page.locator("button.file-name").click();
  await page
    .locator(".document-switcher-actions")
    .getByRole("menuitem", { name: /^New/ })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid^="page-node-"]').length === 1,
  );

  await page.locator("button.file-name").click();
  const documentSwitcher = page.locator(".document-switcher-menu");
  await documentSwitcher.getByText("2 pages · 0 objects").waitFor();
  await documentSwitcher
    .locator(".document-switcher-item")
    .filter({ hasText: "Engine study.libra" })
    .click();
  await page.getByText("Engine study.libra", { exact: true }).waitFor();
  assert.equal(await pages.count(), pageCount);

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: /^New document/ }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid^="page-node-"]').length === 1,
  );

  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Open…/ }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: "Engine study.libra",
    mimeType: "application/vnd.openlibra+json",
    buffer: readFileSync(savedDocumentPath),
  });
  await page.getByText("Engine study.libra", { exact: true }).waitFor();
  assert.equal(await pages.count(), pageCount);

  await page.getByTitle("Shapes", { exact: true }).click();
  await page.getByRole("dialog", { name: "Shape tools" }).waitFor();
  await page
    .getByRole("dialog", { name: "Shape tools" })
    .getByRole("button", { name: "Star" })
    .click();
  await page.getByText("Vector", { exact: true }).waitFor();
  const starPoints = page.getByRole("spinbutton", { name: "Points" });
  assert.equal(await starPoints.inputValue(), "5");
  await starPoints.fill("8");
  await starPoints.press("Enter");
  assert.equal(await starPoints.inputValue(), "8");
  const svgDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export SVG" }).click();
  assert.equal((await svgDownloadPromise).suggestedFilename(), "Star.svg");
  await page.getByRole("button", { name: "Convert to path" }).click();
  await page.getByRole("button", { name: "Convert to path" }).waitFor({
    state: "detached",
  });

  const benchmarkPage = page.getByRole("button", {
    name: "1K Nodes stress test",
    exact: true,
  });
  await benchmarkPage.click();
  await page.waitForFunction(() => {
    const rows = [...document.querySelectorAll(".metrics > div")];
    return rows.some(
      (row) =>
        row.querySelector("dt")?.textContent === "Objects" &&
        row.querySelector("dd")?.textContent === "1,000",
    );
  });
  assert.equal(await benchmarkPage.getAttribute("aria-pressed"), "true");
  assert.deepEqual(
    browserErrors,
    [],
    `browser errors: ${browserErrors.join("\n")}`,
  );

  await testOperations(browser, url);
  await testRendering(browser, url);
  await testPathEditing(browser, url);
  await testMasks(browser, url);
  await testBooleans(browser, url);
  await testLargeStorage(browser, url);
  await testPageNavigation(browser, url);
  await testRenderingInteraction(browser, url);
  await testProjectSafety(browser, url);
  await testCrossTab(browser, url);

  console.log(
    "UI smoke tests passed (typography, variables, vectors, SVG export, images, icons, corner and border controls, input routing, selection, rename, lock, create/delete, pages, 1K scene).",
  );
} finally {
  await browser?.close();
  preview.kill("SIGTERM");
}
