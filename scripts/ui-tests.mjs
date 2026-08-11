import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
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
  await page.keyboard.press("2");
  assert.match(
    (await page
      .getByRole("button", { name: "Developer" })
      .getAttribute("class")) ?? "",
    /active/,
  );
  await page.keyboard.press("1");

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

  const firstLayer = page.getByTestId(/^layer-node-/).first();
  const firstLayerId = await firstLayer.getAttribute("data-node-id");
  assert.ok(firstLayerId, "the first layer exposes its engine node ID");
  await firstLayer.locator(".layer-main").click();
  assert.equal(await firstLayer.getAttribute("data-selected"), "true");

  const cornerInputs = page.locator(".corner-grid input");
  assert.equal(await cornerInputs.count(), 4);
  const cornerValues = await cornerInputs.evaluateAll((inputs) =>
    inputs.map((input) => input.value),
  );
  await cornerInputs.first().click();
  await cornerInputs
    .first()
    .press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await cornerInputs.first().pressSequentially("20");
  assert.equal(await cornerInputs.first().inputValue(), "20");
  assert.deepEqual(
    await cornerInputs.evaluateAll((inputs) =>
      inputs.slice(1).map((input) => input.value),
    ),
    cornerValues.slice(1),
  );
  await cornerInputs.first().press("Enter");
  assert.equal(await cornerInputs.first().inputValue(), "20");

  const alignment = page.getByRole("group", { name: "Alignment" });
  await alignment.getByRole("button", { name: "outside" }).click();
  assert.equal(
    await alignment
      .getByRole("button", { name: "outside" })
      .getAttribute("aria-pressed"),
    "true",
  );
  const join = page.getByRole("group", { name: "Join" });
  await join.getByRole("button", { name: "straight" }).click();
  assert.equal(
    await join
      .getByRole("button", { name: "straight" })
      .getAttribute("aria-pressed"),
    "true",
  );

  await page.getByRole("button", { name: "Row", exact: true }).click();
  const paddingInputs = page.locator(".padding-grid input");
  const paddingBefore = await paddingInputs.evaluateAll((inputs) =>
    inputs.map((input) => input.value),
  );
  await paddingInputs.first().click();
  await paddingInputs
    .first()
    .press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await paddingInputs.first().pressSequentially("20");
  assert.equal(await paddingInputs.first().inputValue(), "20");
  assert.deepEqual(
    await paddingInputs.evaluateAll((inputs) =>
      inputs.slice(1).map((input) => input.value),
    ),
    paddingBefore.slice(1),
  );
  await paddingInputs.first().press("Enter");
  assert.equal(await paddingInputs.first().inputValue(), "20");

  await firstLayer.getByRole("button", { name: /^Rename / }).click();
  const nameInput = firstLayer.locator("input.layer-name-input");
  await nameInput.fill("UI test layer");
  await nameInput.press("Enter");
  assert.match(await firstLayer.innerText(), /UI test layer/);

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
  await page.getByRole("button", { name: "Delete layer" }).click();
  assert.equal(await rectangles.count(), rectangleCount);

  const pages = page.getByTestId(/^page-node-/);
  const pageCount = await pages.count();
  await page.getByRole("button", { name: "+ Add page" }).click();
  assert.equal(await pages.count(), pageCount + 1);
  assert.equal(await pages.last().getAttribute("data-active"), "true");
  await page
    .getByText("This page is empty. Add a frame or rectangle.")
    .waitFor();

  await page.getByRole("button", { name: /1K Nodes/ }).click();
  await page.waitForFunction(() => {
    const rows = [...document.querySelectorAll(".metrics > div")];
    return rows.some(
      (row) =>
        row.querySelector("dt")?.textContent === "Objects" &&
        row.querySelector("dd")?.textContent === "1,000",
    );
  });
  assert.equal(
    await page
      .getByRole("button", { name: /1K Nodes/ })
      .getAttribute("data-active"),
    "true",
  );
  assert.deepEqual(
    browserErrors,
    [],
    `browser errors: ${browserErrors.join("\n")}`,
  );

  console.log(
    "UI smoke tests passed (corner and border controls, input routing, selection, rename, lock, create/delete, pages, 1K scene).",
  );
} finally {
  await browser?.close();
  preview.kill("SIGTERM");
}
