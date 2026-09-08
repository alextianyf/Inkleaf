const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

(async () => {
  const root = path.resolve(__dirname, "../..");
  const sandbox = await fs.mkdtemp(
    path.join(os.tmpdir(), "aldus-diagnostics-"),
  );
  const notes = path.join(sandbox, "DiagnosticsNotes"),
    output = path.join(sandbox, "output");
  const artifacts = path.join(__dirname, "artifacts");
  await fs.mkdir(notes);
  await fs.mkdir(output);
  await fs.mkdir(artifacts, { recursive: true });
  const file = path.join(notes, "solution.md");
  const source = Buffer.from(
    "solution:\r\n-xxxx\r\n-xxx\r\n\r\nAnother solution:\r\n    - indented first\r\n    - indented second\r\n",
  );
  await fs.writeFile(file, source);
  const validFile = path.join(notes, "valid-list.md");
  const validSource = Buffer.from("solution:\r\n- xxxx\r\n- xxx\r\n");
  await fs.writeFile(validFile, validSource);
  const originalStat = await fs.stat(file);
  await fs.writeFile(
    path.join(sandbox, "settings.json"),
    JSON.stringify({
      roots: [notes],
      autoSearch: false,
      language: "zh",
      shortcut: "Control+Alt+F6",
    }),
  );
  const env = { ...process.env, ALDUS_TEST_DIR: sandbox };
  delete env.ELECTRON_RUN_AS_NODE;
  const desktop = await electron.launch({
    ...(process.env.ALDUS_EXECUTABLE
      ? { executablePath: process.env.ALDUS_EXECUTABLE, args: [] }
      : { args: [root] }),
    env,
  });
  try {
    const page = await desktop.firstWindow();
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.aldus.search("solution"))).busy,
      )
      .toBe(false);
    async function openFixture() {
      await page.getByRole("combobox").fill("solution");
      await expect(page.getByRole("option").first()).toContainText(
        "solution.md",
      );
      await page.getByRole("combobox").press("Enter");
      await expect(page.locator(".pdf-page canvas")).toHaveCount(1);
      await expect(page.locator(".preview-title > span")).toBeVisible();
      await page.locator(".preview-warnings summary").click();
    }
    await openFixture();
    await expect(page.locator('[data-source-status="repaired"]')).toContainText(
      "原文行 2–3",
    );
    await expect(page.locator('[data-source-status="repaired"]')).toContainText(
      "原文件未修改",
    );
    await expect(page.locator('[data-source-status="warning"]')).toContainText(
      "额外缩进",
    );
    await page.evaluate(() => window.aldus.language("en"));
    await page.reload();
    await openFixture();
    await expect(page.locator('[data-source-status="repaired"]')).toContainText(
      "Source line 2–3",
    );
    await expect(page.locator('[data-source-status="warning"]')).toContainText(
      "Extra indentation",
    );
    const preview = await page.evaluate(async (file) => {
      const p = await window.aldus.preview(file);
      return { ...p, data: Array.from(p.data) };
    }, file);
    const single = path.join(output, "single.pdf");
    await desktop.evaluate(
      ({ dialog }, { single, output }) => {
        dialog.showSaveDialog = async () => ({
          canceled: false,
          filePath: single,
        });
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [output],
        });
      },
      { single, output },
    );
    await page.evaluate((id) => window.aldus.exportPdf(id), preview.id);
    assert.deepEqual(await fs.readFile(single), Buffer.from(preview.data));
    const pdfjs = await import(
      "../../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs"
    );
    const loading = pdfjs.getDocument({ data: new Uint8Array(preview.data) }),
      pdf = await loading.promise;
    const items = (await (await pdf.getPage(1)).getTextContent()).items;
    const first = items.find((i) => i.str === "xxxx"),
      second = items.find((i) => i.str === "xxx"),
      label = items.find((i) => i.str === "solution:");
    assert.ok(
      first && second && label,
      "all source text is present in the PDF",
    );
    assert.ok(
      first.transform[5] - second.transform[5] > 5,
      "list items occupy distinct printed lines",
    );
    assert.ok(
      first.transform[4] > label.transform[4] + 8,
      "PDF list is indented relative to label",
    );
    await loading.destroy();
    // The user's exact case: no blank line between prose and a valid list.
    // It must work without relying on the repair rule at all.
    const validPreview = await page.evaluate(async (file) => {
      const p = await window.aldus.preview(file);
      return {
        data: Array.from(p.data),
        sourceDiagnostics: p.sourceDiagnostics,
      };
    }, validFile);
    assert.deepEqual(validPreview.sourceDiagnostics, []);
    const validLoading = pdfjs.getDocument({
      data: new Uint8Array(validPreview.data),
    });
    const validPdf = await validLoading.promise;
    const validItems = (await (await validPdf.getPage(1)).getTextContent())
      .items;
    const validLabel = validItems.find((i) => i.str === "solution:");
    const validFirst = validItems.find((i) => i.str === "xxxx");
    const validSecond = validItems.find((i) => i.str === "xxx");
    assert.ok(validLabel && validFirst && validSecond);
    assert.ok(validLabel.transform[5] - validFirst.transform[5] > 5);
    assert.ok(validFirst.transform[5] - validSecond.transform[5] > 5);
    assert.ok(validFirst.transform[4] > validLabel.transform[4] + 8);
    assert.equal(validFirst.transform[4], validSecond.transform[4]);
    await validLoading.destroy();
    await fs.writeFile(
      path.join(artifacts, "list-without-blank-line.pdf"),
      Buffer.from(validPreview.data),
    );
    assert.deepEqual(await fs.readFile(validFile), validSource);
    await page
      .getByRole("button", { name: "Back to search", exact: true })
      .click();
    await page.getByRole("combobox").fill("DiagnosticsNotes");
    await expect(page.getByRole("option").first()).toHaveAttribute(
      "data-kind",
      "folder",
    );
    await page.getByRole("combobox").press("Enter");
    await expect(page.locator(".batch-document canvas")).toHaveCount(1);
    await page.locator(".preview-warnings summary").click();
    await expect(page.locator('[data-source-status="repaired"]')).toContainText(
      "source file was not changed",
    );
    await page.evaluate(() =>
      window.aldus.onBatchProgress((state) => {
        window.testBatchState = state;
      }),
    );
    await page.evaluate(
      ({ notes, file }) => window.aldus.batchStart(notes, [file], true),
      { notes, file },
    );
    await expect
      .poll(() => page.evaluate(() => window.testBatchState?.running))
      .toBe(false);
    const state = await page.evaluate(() => window.testBatchState);
    assert.equal(state.failed, 0);
    assert.equal(state.entries[0].status, "warning");
    assert.equal(state.entries[0].sourceDiagnostics.length, 2);
    assert.deepEqual(
      await fs.readFile(path.join(output, "solution.pdf")),
      Buffer.from(preview.data),
    );
    assert.deepEqual(await fs.readFile(file), source);
    assert.equal((await fs.stat(file)).mtimeMs, originalStat.mtimeMs);
    assert.deepEqual((await fs.readdir(notes)).sort(), [
      "solution.md",
      "valid-list.md",
    ]);
    await fs.copyFile(single, path.join(artifacts, "diagnostics.pdf"));
    const png = await desktop.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      await win.webContents.executeJavaScript(
        "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
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
    await fs.writeFile(
      path.join(artifacts, "diagnostics.png"),
      Buffer.from(png, "base64"),
    );
    console.log(
      "PASS: valid lists without blank lines render as separate indented PDF items without repairs; in-memory list repair, bilingual notices, exact preview/export bytes, batch notices and unchanged source bytes/mtime.",
    );
  } finally {
    await desktop.close();
    await fs.rm(sandbox, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
