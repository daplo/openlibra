import { chromium } from "playwright-core";

const url = process.env.OPEN_LIBRA_URL ?? "http://127.0.0.1:4173/openlibra/";
const executablePath =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const headless = process.env.HEADLESS !== "false";

const browser = await chromium.launch({
  executablePath,
  headless,
  args: ["--enable-unsafe-webgpu"],
});

try {
  const page = await browser.newPage({
    viewport: { width: 1720, height: 900 },
  });
  await page.goto(url);
  await page.getByRole("button", { name: /1K Nodes/ }).click();
  await page.getByText("Objects").waitFor();
  await page.waitForFunction(() => {
    const rows = [...document.querySelectorAll(".metrics > div")];
    const objects = rows.find(
      (row) => row.querySelector("dt")?.textContent === "Objects",
    );
    return objects?.querySelector("dd")?.textContent === "1,000";
  });

  const canvas = page.getByLabel("Open Libra WebGPU editor canvas");
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Canvas bounds are unavailable.");

  for (let index = 0; index < 120; index += 1) {
    const x = bounds.x + bounds.width * (0.35 + (index % 20) / 80);
    const y = bounds.y + bounds.height * (0.4 + ((index * 3) % 20) / 100);
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, index % 2 === 0 ? -5 : 5);
    await page.waitForTimeout(16);
  }

  const metrics = await page
    .locator(".metrics > div")
    .evaluateAll((rows) =>
      Object.fromEntries(
        rows.map((row) => [
          row.querySelector("dt")?.textContent ?? "",
          row.querySelector("dd")?.textContent ?? "",
        ]),
      ),
    );
  const userAgent = await page.evaluate(() => navigator.userAgent);
  console.log(
    JSON.stringify(
      { url, viewport: "1720x900", headless, userAgent, metrics },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
