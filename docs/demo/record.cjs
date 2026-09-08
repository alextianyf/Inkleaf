// Capture the real Electron UI with an isolated profile and sample-only index.
// Run from the repository root: npm run build:ui && node docs/demo/record.cjs
const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "../..");
const output = path.join(root, "artifacts/readme-demo");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function record(language) {
  const folder = path.join(output, language);
  // Fresh profiles also give exports predictable names on repeated recordings.
  const profile = await fs.mkdtemp(path.join(output, "profile-"));
  const notes = path.join(profile, "Notes");
  const exports = path.join(profile, "PDFs");
  await fs.mkdir(folder, { recursive: true });
  await fs.mkdir(notes);
  await fs.mkdir(exports);
  await fs.copyFile(
    path.join(__dirname, "field-notes.md"),
    path.join(notes, "field-notes.md"),
  );
  await fs.writeFile(
    path.join(profile, "settings.json"),
    JSON.stringify({
      roots: [notes],
      autoSearch: false,
      languagePreference: language,
      shortcut: "Control+Alt+F9",
      theme: "minimal",
      exportDestination: "custom",
      exportFolder: exports,
      askExportLocation: false,
      openAfterExport: false,
    }),
  );
  const env = { ...process.env, ALDUS_TEST_DIR: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    ...(process.env.ALDUS_EXECUTABLE
      ? { executablePath: path.resolve(process.env.ALDUS_EXECUTABLE), args: [] }
      : { args: [root] }),
    env,
  });
  let capturing = false;
  let captureTask;
  const frames = [];
  let stage = "search";
  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(
        false,
      );
    });
    const search = page.getByRole("combobox");
    await search.waitFor();
    await expect(page.locator(".brand")).toHaveText("Inkleaf");
    await expect(page.locator(".brand-icon")).toHaveCount(0);
    const cornerRadius = await page.locator(".desktop-app").evaluate(
      (element) =>
        parseFloat(getComputedStyle(element).borderTopLeftRadius) *
        window.devicePixelRatio,
    );
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.aldus.search("field-notes")))
            .matches,
      )
      .toBe(1);
    const start = Date.now();
    capturing = true;
    captureTask = (async () => {
      while (capturing) {
        const at = Date.now() - start;
        const currentStage = stage;
        const png = await app.evaluate(async ({ BrowserWindow }) => {
          const window = BrowserWindow.getAllWindows().find(
            (item) => item.webContents.getURL() === "aldus://app/desktop.html",
          );
          const image = await window.webContents.capturePage(undefined, {
            stayHidden: true,
            stayAwake: true,
          });
          return image.toPNG().toString("base64");
        });
        const name = String(frames.length).padStart(4, "0") + ".png";
        await fs.writeFile(path.join(folder, name), Buffer.from(png, "base64"));
        frames.push({ file: name, at, stage: currentStage });
        await delay(Math.max(0, 125 - (Date.now() - start - at)));
      }
    })();
    await delay(1000);
    await search.pressSequentially("field", { delay: 180 });
    await expect(page.getByRole("option")).toHaveCount(1);
    await delay(1200);
    stage = "preview";
    await search.press("Enter");
    const exportButton = page.getByRole("button", {
      name: language === "zh" ? "导出 PDF" : "Export PDF",
      exact: true,
    });
    await expect(exportButton).toBeEnabled({ timeout: 60000 });
    await expect
      .poll(() =>
        page
          .locator(".brand-icon")
          .evaluate((image) => image.complete && image.naturalWidth > 0),
      )
      .toBe(true);
    await expect(page.locator(".pdf-page canvas")).toHaveCount(1);
    await delay(1900);
    const posterFile = frames.at(-1).file;
    // Exercise an actual PDF internal link rather than a simulated scroll.
    const links = page.locator(".pdf-link");
    await expect(links).toHaveCount(3);
    await links.nth(1).click();
    await expect
      .poll(() =>
        page
          .locator(".preview-content")
          .evaluate((element) => element.scrollTop),
      )
      .toBeGreaterThan(100);
    await delay(1800);
    stage = "export";
    await exportButton.click();
    await expect(page.locator(".saved-row")).toBeVisible();
    const pdf = await fs.readFile(path.join(exports, "field-notes.pdf"));
    assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
    assert.deepEqual(errors, []);
    await delay(2400);
    capturing = false;
    await captureTask;
    await fs.writeFile(
      path.join(folder, "frames.json"),
      JSON.stringify(
        { language, duration: Date.now() - start, posterFile, cornerRadius, frames },
        null,
        2,
      ),
    );
    console.log(
      `${language}: ${frames.length} captured frames; real PDF export verified`,
    );
  } finally {
    capturing = false;
    if (captureTask) await captureTask;
    await app.close();
  }
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  await record("en");
  await record("zh");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
