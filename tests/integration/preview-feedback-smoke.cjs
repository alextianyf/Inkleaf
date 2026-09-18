const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

(async () => {
  const root = path.resolve(__dirname, "../..");
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "inkleaf-feedback-"));
  const source = path.join(profile, "Feedback.md");
  const markdown =
    '# Feedback\n\nPreview progress and export confirmation.\n\n<div style="break-before:page"></div>\n\n## Second page\n\nMore text.\n';
  await fs.writeFile(source, markdown);
  await fs.writeFile(
    path.join(profile, "settings.json"),
    JSON.stringify({
      roots: [profile],
      autoSearch: false,
      languagePreference: "en",
      appearance: "light",
      shortcut: "Control+Alt+F8",
      askExportLocation: true,
    }),
  );
  const env = { ...process.env, ALDUS_TEST_DIR: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [root], env });
  const artifacts = path.join(root, "artifacts/tests");
  await fs.mkdir(artifacts, { recursive: true });
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(20000);
    const input = page.getByRole("combobox");
    await input.waitFor();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.evaluate(() => {
      window.feedbackStages = [];
      window.aldus.onPreviewProgress((event) =>
        window.feedbackStages.push(event),
      );
    });
    await app.evaluate(({ app, dialog }) => {
      global.holdPrint = true;
      dialog.showSaveDialog = async () =>
        global.saveTarget
          ? { canceled: false, filePath: global.saveTarget }
          : { canceled: true };
      app.on("web-contents-created", (_, contents) => {
        const print = contents.printToPDF.bind(contents);
        contents.printToPDF = async (...args) => {
          if (global.holdPrint) {
            global.holdPrint = false;
            await new Promise((resolve) => {
              global.releasePrint = resolve;
            });
          }
          return print(...args);
        };
      });
    });
    async function capture(name) {
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      const png = await app.evaluate(
        async ({ BrowserWindow }, url) =>
          (
            await BrowserWindow.getAllWindows()
              .find((win) => win.webContents.getURL() === url)
              .webContents.capturePage(undefined, {
                stayHidden: true,
                stayAwake: true,
              })
          )
            .toPNG()
            .toString("base64"),
        page.url(),
      );
      await fs.writeFile(
        path.join(artifacts, name),
        Buffer.from(png, "base64"),
      );
    }
    await input.fill("Feedback");
    await page.getByRole("option").first().click();
    const progress = page.getByRole("progressbar", {
      name: "Preparing preview…",
    });
    await expect(progress).toHaveAttribute("value", "2");
    await expect(progress).toHaveAttribute("aria-valuetext", "Generating PDF");
    await expect(page.locator(".spinner")).toHaveCount(0);
    await capture("preview-progress.png");
    await app.evaluate(({ BrowserWindow }, url) => {
      BrowserWindow.getAllWindows()
        .find((win) => win.webContents.getURL() === url)
        .webContents.send("aldus:preview-progress", {
          requestId: "stale-request",
          stage: "previewPages",
        });
    }, page.url());
    await expect(progress).toHaveAttribute("aria-valuetext", "Generating PDF");
    await app.evaluate(() => global.releasePrint());
    const exportButton = page.getByRole("button", {
      name: "Export PDF",
      exact: true,
    });
    await expect(exportButton).toBeEnabled({ timeout: 60000 });
    await expect(progress).toHaveCount(0);
    assert.deepEqual(
      (await page.evaluate(() => window.feedbackStages))
        .filter((x) => x.requestId !== "stale-request")
        .map((x) => x.stage),
      ["previewReading", "previewLayout", "previewPrinting", "previewPages"],
    );
    // A cancelled picker must never claim success.
    await exportButton.click();
    await expect(exportButton).toBeEnabled();
    await expect(page.locator(".export-notice")).toHaveCount(0);
    // Confirm success only after actual bytes are written.
    const documentBeforeExport = await page
      .locator(".pdf-page")
      .first()
      .boundingBox();
    const target = path.join(profile, "Feedback.pdf");
    await app.evaluate((_, value) => {
      global.saveTarget = value;
    }, target);
    await exportButton.click();
    await expect(page.locator(".export-notice")).toContainText(
      "PDF exported successfully",
    );
    await expect(page.locator(".export-notice")).toContainText("Feedback.pdf");
    await expect(page.locator(".saved-row")).toContainText(target);
    const documentAfterExport = await page
      .locator(".pdf-page")
      .first()
      .boundingBox();
    assert.equal(
      documentAfterExport.y,
      documentBeforeExport.y,
      "success toast must not push the document down",
    );
    const noticeBeforeScroll = await page
      .locator(".export-notice")
      .boundingBox();
    await page.locator(".preview-content").evaluate((el) => {
      el.scrollTop = 150;
    });
    await expect
      .poll(
        async () => (await page.locator(".pdf-page").first().boundingBox()).y,
      )
      .toBeLessThan(documentAfterExport.y);
    const noticeAfterScroll = await page
      .locator(".export-notice")
      .boundingBox();
    assert.equal(
      noticeAfterScroll.y,
      noticeBeforeScroll.y,
      "toast stays anchored to the preview viewport",
    );
    await page.locator(".preview-content").evaluate((el) => {
      el.scrollTop = 0;
    });
    assert.equal(
      (await fs.readFile(target)).subarray(0, 5).toString(),
      "%PDF-",
    );
    await capture("export-success.png");
    // A later failed export clears the previous success, but keeps the saved path.
    await app.evaluate(
      (_, value) => {
        global.saveTarget = value;
      },
      path.join(profile, "missing", "failure.pdf"),
    );
    await exportButton.click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator(".export-notice")).toHaveCount(0);
    await expect(page.locator(".saved-row")).toContainText(target);
    const state = await page.evaluate(() =>
      window.aldus.settings({ languagePreference: "zh", appearance: "dark" }),
    );
    await app.evaluate(
      ({ BrowserWindow }, { url, state }) =>
        BrowserWindow.getAllWindows()
          .find((win) => win.webContents.getURL() === url)
          .webContents.send("aldus:preferences-changed", state),
      { url: page.url(), state },
    );
    await app.evaluate((_, value) => {
      global.saveTarget = value;
    }, target);
    await page.getByRole("button", { name: "导出 PDF", exact: true }).click();
    await expect(page.locator(".export-notice")).toContainText("PDF 导出成功");
    await capture("export-success-dark-zh.png");
    await page.getByRole("button", { name: "关闭导出成功提示" }).click();
    await expect(page.locator(".export-notice")).toHaveCount(0);
    await expect(page.locator(".saved-row")).toContainText(target);
    await page.keyboard.press("Escape");
    await expect(input).toBeVisible();
    await expect(page.locator(".export-notice, .preview-progress")).toHaveCount(
      0,
    );
    assert.equal(await fs.readFile(source, "utf8"), markdown);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: real preview stages, stale-event isolation, PDF page rendering, cancelled/failed/successful exports, saved path, bilingual and dark confirmation, dismissal, unchanged source.",
    );
  } finally {
    await app.close();
    assert.equal(path.dirname(profile), path.resolve(os.tmpdir()));
    assert.ok(path.basename(profile).startsWith("inkleaf-feedback-"));
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
