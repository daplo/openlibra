import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const messages = [];
page.on("console", (message) => messages.push(`${message.type()}: ${message.text()}`));
page.on("pageerror", (error) => messages.push(`pageerror: ${error.stack}`));
await page.goto("http://localhost:5173/?debug=selection", { waitUntil: "networkidle" });
await page.waitForTimeout(5000);
const canvas = page.getByLabel("Open Libra WebGPU editor canvas");
const bounds = await canvas.boundingBox();
if (!bounds) throw new Error("Canvas has no bounds");
await page.mouse.click(bounds.x + 124, bounds.y + 196);
await page.waitForTimeout(200);
const selected = await page.locator(".layer-row.selected").allTextContents();
const boundsBefore = await page.locator(".geometry-input input").evaluateAll((inputs) => inputs.map((input) => input.value));
await page.mouse.move(bounds.x + 20 + 446 * 0.8, bounds.y + 20 + 376 * 0.8);
await page.mouse.down();
await page.mouse.move(bounds.x + 20 + 446 * 0.8 + 40, bounds.y + 20 + 376 * 0.8 + 30, { steps: 4 });
await page.mouse.up();
await page.waitForTimeout(100);
const boundsAfter = await page.locator(".geometry-input input").evaluateAll((inputs) => inputs.map((input) => input.value));
await page.getByRole("button", { name: "Edit" }).click();
await page.getByRole("menuitem", { name: /Undo/ }).click();
await page.waitForTimeout(100);
const boundsAfterUndo = await page.locator(".geometry-input input").evaluateAll((inputs) => inputs.map((input) => input.value));
const errorCard = await page.locator(".error-card").allTextContents();
await page.screenshot({ path: "/tmp/open-libra-selection.png" });
console.log(JSON.stringify({ bounds, selected, boundsBefore, boundsAfter, boundsAfterUndo, errorCard, messages }, null, 2));
await browser.close();
