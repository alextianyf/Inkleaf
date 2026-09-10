const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

(async () => {
  const root = path.resolve(__dirname, "../..");
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "aldus-settings-"));
  const notes = path.join(sandbox, "Notes");
  const downloads = path.join(sandbox, "Downloads");
  const custom = path.join(sandbox, "Custom");
  const artifacts = path.join(root, "artifacts/tests");
  for (const folder of [
    notes,
    downloads,
    custom,
    artifacts,
    path.join(notes, "nested"),
  ])
    await fs.mkdir(folder, { recursive: true });
  const source = path.join(notes, "private.md");
  const original = "# PRIVATE ORIGINAL\n\nDo not put this in the sample.";
  await fs.writeFile(source, original);
  await fs.writeFile(
    path.join(notes, "nested/second.md"),
    "# Second\n\nA second document.",
  );
  await fs.writeFile(
    path.join(sandbox, "settings.json"),
    JSON.stringify({
      roots: [notes],
      autoSearch: false,
      language: "en",
      shortcut: "Control+Alt+F10",
    }),
  );
  const env = { ...process.env, ALDUS_TEST_DIR: sandbox };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () =>
    electron.launch({
      ...(process.env.ALDUS_EXECUTABLE
        ? { executablePath: process.env.ALDUS_EXECUTABLE, args: [] }
        : { args: [root] }),
      env,
    });
  let desktop = await launch();
  const errors = [];
  async function setup() {
    await desktop.evaluate(({ app, dialog, shell }, directory) => {
      app.setPath("downloads", directory);
      global.openedPdfs = [];
      shell.openPath = async (file) => {
        global.openedPdfs.push(file);
        return "";
      };
      dialog.showSaveDialog = async () => {
        throw new Error("Unexpected save dialog");
      };
    }, downloads);
  }
  async function openSettings(page) {
    const next = desktop.waitForEvent("window", {
      predicate: (win) => win !== page,
    });
    await page.evaluate(() => window.aldus.openSettings());
    const settings = await next;
    settings.on("pageerror", (error) => errors.push(error.message));
    await settings.locator("#languagePreference").waitFor();
    await expect(settings.locator(".brand-icon")).toBeVisible();
    await expect(settings.locator(".brand")).not.toContainText("Aldus");
    return settings;
  }
  async function saved(settings) {
    await expect(
      settings.locator(".preferences-heading [role=status]"),
    ).not.toContainText(/Saving|正在保存/);
    await expect(settings.locator("[role=alert]")).toHaveCount(0);
  }
  async function capture(settings, name) {
    const png = await desktop.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((win) =>
        win.webContents.getURL().endsWith("?settings"),
      );
      await win.webContents.executeJavaScript(
        "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
      );
      return (
        await win.webContents.capturePage(undefined, {
          stayHidden: true,
          stayAwake: true,
        })
      )
        .toPNG()
        .toString("base64");
    });
    await fs.writeFile(path.join(artifacts, name), Buffer.from(png, "base64"));
  }
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  async function inspect(data) {
    const loading = pdfjs.getDocument({ data: new Uint8Array(data) });
    const pdf = await loading.promise;
    let text = "";
    for (let index = 1; index <= pdf.numPages; index++)
      text += (await (await pdf.getPage(index)).getTextContent()).items
        .map((item) => item.str)
        .join(" ");
    const view = (await pdf.getPage(1)).view;
    const pages = pdf.numPages;
    await loading.destroy();
    return { text, view, pages };
  }
  try {
    let page = await desktop.firstWindow();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.getByRole("combobox").waitFor();
    await setup();
    assert.equal(
      (await page.evaluate(() => window.aldus.state())).theme,
      "folio",
    );
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.aldus.search("private"))).matches,
      )
      .toBe(1);
    await page.getByRole("combobox").fill("private");
    await page.getByRole("option").first().waitFor();
    await page.getByRole("combobox").press("Enter");
    await expect(
      page.getByRole("button", { name: "Export PDF", exact: true }),
    ).toBeEnabled({ timeout: 60000 });
    const before = await fs.stat(source);
    let settings = await openSettings(page);
    await expect(settings.locator(".layout-sample")).toHaveCount(0);
    await capture(settings, "settings-general.png");
    await settings.getByRole("button", { name: "Layout", exact: true }).click();
    await expect(settings.locator(".pdf-page canvas")).toHaveCount(2, {
      timeout: 60000,
    });
    await settings.locator("#author").fill("Unsaved draft");
    assert.equal((await page.evaluate(() => window.aldus.state())).author, "");
    await settings
      .getByRole("button", { name: "Close settings", exact: true })
      .click();
    await expect(settings.getByRole("dialog")).toBeVisible();
    await settings
      .getByRole("button", { name: "Keep editing", exact: true })
      .click();
    await expect(settings.locator("#author")).toHaveValue("Unsaved draft");
    await settings
      .getByRole("button", { name: "Revert changes", exact: true })
      .click();
    await expect(settings.locator("#author")).toHaveValue("");
    await settings.locator("#author").fill("Aldus settings test");
    await settings.locator("#paperSize").selectOption("Letter");
    await settings.locator("#orientation").selectOption("landscape");
    await settings.locator("#margins").selectOption("compact");
    await settings.locator("#fontSize").fill("12");
    await settings.locator("#lineHeight").selectOption("1.8");
    await expect(settings.locator("#theme")).toHaveValue("folio");
    assert.deepEqual(
      await settings
        .locator("#theme option")
        .evaluateAll((options) => options.map((option) => option.value)),
      ["folio", "default", "minimal"],
    );
    await settings.locator("#theme").selectOption("minimal");
    await settings.locator("#copyrightLabel").fill("Custom class notes");
    assert.equal(
      (await page.evaluate(() => window.aldus.state())).copyrightLabel,
      "",
    );
    assert.equal(
      (await page.evaluate(() => window.aldus.state())).paperSize,
      "A4",
      "live layout preview must not save the draft",
    );
    await expect(
      settings.getByRole("button", { name: "View the change", exact: true }),
    ).toBeEnabled();
    await expect(
      settings.locator(".layout-sample .preview-content"),
    ).toHaveAttribute("aria-busy", "false", { timeout: 60000 });
    await expect
      .poll(() =>
        settings
          .locator(".pdf-page canvas")
          .first()
          .evaluate((c) => c.width / c.height),
      )
      .toBeGreaterThan(1.2);
    await settings.locator("#sample-zoom").selectOption("125");
    await expect
      .poll(() =>
        settings
          .locator(".pdf-page canvas")
          .first()
          .evaluate((c) => c.getBoundingClientRect().width),
      )
      .toBeGreaterThan(1200);
    await settings.locator("#sample-zoom").selectOption("fit");
    await capture(settings, "settings-layout-draft.png");
    // An empty directory blocks the atomic settings write in this test profile.
    const blockedWrite = path.join(sandbox, "settings.json.tmp");
    await fs.mkdir(blockedWrite);
    await settings
      .getByRole("button", { name: "Save layout", exact: true })
      .click();
    await expect(settings.getByRole("alert")).toContainText(
      /EISDIR|EPERM|EACCES/,
    );
    await fs.rmdir(blockedWrite);
    assert.equal(
      (await page.evaluate(() => window.aldus.state())).author,
      "",
      "a failed save must not apply the draft",
    );
    await expect(settings.locator("#author")).toHaveValue(
      "Aldus settings test",
    );
    await settings
      .getByRole("button", { name: "Save layout", exact: true })
      .click();
    await expect(settings.locator(".layout-savebar [role=status]")).toHaveText(
      "Layout saved",
    );
    await saved(settings);
    await expect(
      settings.locator(".layout-sample .preview-content"),
    ).toHaveAttribute("aria-busy", "false", { timeout: 60000 });
    // Same production PDF engine; the sample never uses the active private file.
    const sample = await settings.evaluate(async () => {
      const config = await window.aldus.state();
      return window.aldus.samplePreview(config);
    });
    const sampleInfo = await inspect(sample.data);
    assert.ok(
      sampleInfo.pages >= 2,
      "The sample paginates its expanded code examples",
    );
    assert.match(sampleInfo.text, /Aldus settings test/);
    assert.match(sampleInfo.text, /Custom class notes/);
    assert.match(sampleInfo.text, /A quieter way to publish/);
    assert.doesNotMatch(sampleInfo.text, /PRIVATE ORIGINAL/);
    assert.ok(
      Math.abs(sampleInfo.view[2] - 792) < 2 &&
        Math.abs(sampleInfo.view[3] - 612) < 2,
      "US Letter landscape",
    );
    assert.deepEqual(sample.warnings, []);
    await expect
      .poll(() =>
        settings
          .locator(".pdf-page canvas")
          .first()
          .evaluate((canvas) => canvas.width / canvas.height),
      )
      .toBeGreaterThan(1.2);
    await capture(settings, "settings-layout.png");
    const originalCanvas = await settings
      .locator(".pdf-page canvas")
      .first()
      .elementHandle();
    await settings
      .getByRole("button", { name: "View the change", exact: true })
      .click();
    await expect(settings.locator(".pdf-change-highlight")).toBeAttached();
    assert.equal(
      await originalCanvas.evaluate((canvas) => canvas.isConnected),
      true,
      "viewing a change must not rebuild the PDF canvases",
    );
    await expect
      .poll(() =>
        settings
          .locator(".layout-sample .preview-content")
          .evaluate((el) => el.scrollTop),
      )
      .toBeGreaterThan(100);
    await capture(settings, "settings-copyright.png");
    await settings.getByRole("button", { name: "Export", exact: true }).click();
    await expect(settings.locator(".layout-sample")).toHaveCount(0);
    await expect(settings.locator("input[value=downloads]")).toBeChecked();
    await capture(settings, "settings-export.png");
    await settings
      .getByRole("button", { name: "General", exact: true })
      .click();
    await settings.locator("#languagePreference").selectOption("zh");
    await expect(settings.locator(".brand")).toHaveText("印页设置");
    await expect(settings).toHaveTitle("印页 · 设置");
    await saved(settings);
    await expect(
      settings.getByRole("button", { name: "排版", exact: true }),
    ).toBeVisible();
    await settings.getByRole("button", { name: "排版", exact: true }).click();
    await expect(settings.locator(".pdf-page canvas")).toHaveCount(2, {
      timeout: 60000,
    });
    await capture(settings, "settings-layout-zh.png");
    await desktop.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((win) => win.webContents.getURL().endsWith("?settings"))
        .setSize(760, 640),
    );
    await expect
      .poll(() =>
        settings.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      )
      .toBe(true);
    await expect(
      settings.getByRole("button", { name: "保存排版", exact: true }),
    ).toBeVisible();
    await capture(settings, "settings-narrow.png");
    await settings.locator("#author").fill("关闭时放弃的草稿");
    // Alt+F4 / native close follows the same unsaved-changes interaction.
    await desktop.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((win) => win.webContents.getURL().endsWith("?settings"))
        .close(),
    );
    await expect(settings.getByRole("dialog")).toBeVisible();
    await settings
      .getByRole("button", { name: "放弃并关闭", exact: true })
      .click()
      .catch((error) => {
        if (!settings.isClosed()) throw error;
      });
    await expect.poll(() => settings.isClosed()).toBe(true);
    assert.equal(
      (await page.evaluate(() => window.aldus.state())).author,
      "Aldus settings test",
    );
    await expect(page.locator(".preview-title")).toContainText("Letter");
    await expect(
      page.getByRole("button", { name: "导出 PDF", exact: true }),
    ).toBeEnabled({ timeout: 60000 });
    await page.getByRole("button", { name: "导出 PDF", exact: true }).click();
    await expect
      .poll(() =>
        fs
          .stat(path.join(downloads, "private.pdf"))
          .then(() => true)
          .catch(() => false),
      )
      .toBe(true);
    const pdfInfo = await inspect(
      await fs.readFile(path.join(downloads, "private.pdf")),
    );
    assert.match(pdfInfo.text, /Custom class notes/);
    assert.match(pdfInfo.text, /PRIVATE ORIGINAL/);
    assert.match(pdfInfo.text, /Aldus settings test/);
    assert.deepEqual(pdfInfo.view, sampleInfo.view);
    await page.getByRole("button", { name: "导出 PDF", exact: true }).click();
    await expect
      .poll(() =>
        fs
          .stat(path.join(downloads, "private (1).pdf"))
          .then(() => true)
          .catch(() => false),
      )
      .toBe(true);
    // Saved export destinations, collision handling, explicit picker override.
    await page.evaluate(() =>
      window.aldus.settings({
        exportDestination: "source",
        openAfterExport: true,
      }),
    );
    const sibling = await page.evaluate(async (file) => {
      const preview = await window.aldus.preview(file);
      return window.aldus.exportPdf(preview.id);
    }, source);
    assert.equal(sibling, path.join(notes, "private.pdf"));
    assert.ok(
      (await desktop.evaluate(() => global.openedPdfs)).includes(sibling),
    );
    await page.evaluate(
      (folder) =>
        window.aldus.settings({
          exportDestination: "custom",
          exportFolder: folder,
          openAfterExport: false,
        }),
      custom,
    );
    const customFile = await page.evaluate(async (file) => {
      const preview = await window.aldus.preview(file);
      return window.aldus.exportPdf(preview.id);
    }, source);
    assert.equal(customFile, path.join(custom, "private.pdf"));
    const manual = path.join(custom, "manual.pdf");
    await desktop.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, manual);
    await page.evaluate(() =>
      window.aldus.settings({ askExportLocation: true }),
    );
    const manualFile = await page.evaluate(async (file) => {
      const preview = await window.aldus.preview(file);
      return window.aldus.exportPdf(preview.id);
    }, source);
    assert.equal(manualFile, manual);
    assert.equal(
      (await fs.readFile(manual)).subarray(0, 5).toString(),
      "%PDF-",
    );
    await page.evaluate(() =>
      window.aldus.settings({ askExportLocation: false }),
    );
    // Batch output uses a single snapshot, even while layout preferences change.
    const batch = await page.evaluate(async (folder) => {
      globalThis.batchDone = new Promise((resolve) => {
        const remove = window.aldus.onBatchProgress((state) => {
          if (!state.running) {
            remove();
            resolve(state);
          }
        });
      });
      const files = await window.aldus.folder(folder);
      const job = await window.aldus.batchStart(
        folder,
        files.files.map((file) => file.path),
      );
      await window.aldus.settings({ author: "For the next batch" });
      return job;
    }, notes);
    assert.equal(batch.output, path.join(custom, "Notes"));
    const done = await page.evaluate(() => globalThis.batchDone);
    assert.equal(done.failed, 0);
    assert.equal(done.completed, 2);
    assert.match(
      (
        await inspect(
          await fs.readFile(path.join(custom, "Notes/nested/second.pdf")),
        )
      ).text,
      /Aldus settings test/,
    );
    assert.equal(await fs.readFile(source, "utf8"), original);
    assert.equal((await fs.stat(source)).mtimeMs, before.mtimeMs);
    await desktop.close();
    desktop = await launch();
    page = await desktop.firstWindow();
    await page.getByRole("combobox").waitFor();
    const restarted = await page.evaluate(() => window.aldus.state());
    assert.equal(restarted.author, "For the next batch");
    assert.equal(restarted.theme, "minimal");
    assert.equal(restarted.copyrightLabel, "Custom class notes");
    assert.equal(restarted.paperSize, "Letter");
    assert.equal(restarted.orientation, "landscape");
    assert.equal(restarted.exportFolder, custom);
    assert.equal(restarted.language, "zh");
    settings = await openSettings(page);
    await settings.getByRole("button", { name: "排版", exact: true }).click();
    await settings.locator("#author").fill("Saved on close");
    await settings
      .getByRole("button", { name: "关闭设置", exact: true })
      .click();
    await settings
      .getByRole("button", { name: "保存并关闭", exact: true })
      .click();
    await expect
      .poll(
        async () => (await page.evaluate(() => window.aldus.state())).author,
      )
      .toBe("Saved on close");
    await expect.poll(() => settings.isClosed()).toBe(true);
    settings = await openSettings(page);
    await settings.getByRole("button", { name: "排版", exact: true }).click();
    await expect(settings.locator("#theme")).toHaveValue("minimal");
    await settings
      .getByRole("button", { name: "恢复此分类的默认设置", exact: true })
      .click();
    await expect(settings.locator("#theme")).toHaveValue("folio");
    assert.equal(
      (await page.evaluate(() => window.aldus.state())).theme,
      "minimal",
      "reset remains a draft",
    );
    await settings
      .getByRole("button", { name: "保存排版", exact: true })
      .click();
    await expect
      .poll(async () => (await page.evaluate(() => window.aldus.state())).theme)
      .toBe("folio");
    assert.equal(
      JSON.parse(await fs.readFile(path.join(sandbox, "settings.json"))).theme,
      "folio",
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: separate bilingual settings, real sample PDF, Letter landscape, autosave/restart, original untouched, Downloads/source/custom/picker exports, collision numbering, batch snapshot and hierarchy.",
    );
  } finally {
    await desktop.close();
    // This directory was created by this test and contains only its fixtures.
    if (path.dirname(sandbox) !== path.resolve(os.tmpdir()))
      throw new Error("Unexpected test directory");
    await fs.rm(sandbox, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
