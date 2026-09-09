const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

(async () => {
  const root = path.resolve(__dirname, "../..");
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "inkleaf-math-pdf-"));
  const notes = path.join(profile, "notes");
  const output = path.join(root, "artifacts/tests");
  await fs.mkdir(notes);
  await fs.mkdir(output, { recursive: true });
  const file = path.join(notes, "math-delimiters.md");
  const original = await fs.readFile(
    path.join(root, "tests/fixtures/math-delimiters.md"),
  );
  await fs.writeFile(file, original);
  const before = await fs.stat(file);
  await fs.writeFile(
    path.join(profile, "settings.json"),
    JSON.stringify({
      autoSearch: false,
      roots: [notes],
      languagePreference: "zh",
      shortcut: "Control+Alt+F8",
      theme: "default",
      askExportLocation: true,
    }),
  );
  const env = { ...process.env, ALDUS_TEST_DIR: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [root], env });
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  async function inspect(data) {
    const loading = pdfjs.getDocument({ data: new Uint8Array(data) });
    const pdf = await loading.promise;
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .map((item) => item.str)
          .join(" ")
          .normalize("NFKC"),
      );
    }
    await loading.destroy();
    return pages;
  }
  try {
    const page = await app.firstWindow();
    async function openFixture() {
      await page.getByRole("combobox").fill("math-delimiters");
      await expect(page.getByRole("option")).toHaveCount(1);
      await page.getByRole("combobox").press("Enter");
      await expect(page.locator(".pdf-page canvas").first()).toBeVisible({
        timeout: 60000,
      });
      await page.locator(".preview-warnings summary").click();
    }
    await openFixture();
    await expect(page.locator('[data-source-status="repaired"]')).toHaveCount(
      2,
    );
    await expect(
      page.locator('[data-source-status="repaired"]').first(),
    ).toContainText("原文件未修改");
    const result = await page.evaluate(async (file) => {
      const result = await window.aldus.preview(file);
      return { ...result, data: Array.from(result.data) };
    }, file);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(result.layoutWarnings, []);
    const target = path.join(output, "math-delimiters.pdf");
    await app.evaluate(({ dialog }, target) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: target,
      });
    }, target);
    await page.evaluate((id) => window.aldus.exportPdf(id), result.id);
    assert.deepEqual(await fs.readFile(target), Buffer.from(result.data));
    const pages = await inspect(result.data);
    const text = pages.join("\n");
    for (const command of ["\\lambda", "\\boxed", "\\quad", "\\text"]) {
      assert.ok(
        !text.includes(command),
        "PDF must not leak formula source: " + command,
      );
    }
    assert.match(text, /0\.32/);
    assert.match(text, /16/);
    assert.match(text, /λ/);
    assert.match(text, /\$20 and \$30/);
    assert.match(
      text,
      /x=\\frac\{1\}\{2\}/,
      "literal code must still contain LaTeX source",
    );
    await page.evaluate(() => window.aldus.language("en"));
    await page.reload();
    await openFixture();
    await expect(
      page.locator('[data-source-status="repaired"]').first(),
    ).toContainText("source file was not changed");
    assert.deepEqual(await fs.readFile(file), original);
    assert.equal((await fs.stat(file)).mtimeMs, before.mtimeMs);
    // Optional read-only verification against a user's document. Never add it to fixtures.
    if (process.env.ALDUS_MATH_SOURCE) {
      const source = path.resolve(process.env.ALDUS_MATH_SOURCE);
      const bytes = await fs.readFile(source);
      const stat = await fs.stat(source);
      await app.evaluate(({ dialog }, source) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [source],
        });
      }, source);
      await page.evaluate(() => window.aldus.chooseFile());
      const actual = await page.evaluate(async (file) => {
        const result = await window.aldus.preview(file);
        return {
          data: Array.from(result.data),
          diagnostics: result.sourceDiagnostics,
          warnings: result.layoutWarnings,
        };
      }, source);
      const actualPages = await inspect(actual.data);
      const actualText = actualPages.join("\n");
      assert.ok(
        actual.diagnostics.some(
          (d) =>
            d.ruleId === "markdown/math-delimiters" && d.status === "repaired",
        ),
      );
      assert.ok(
        !/\\(?:frac|boxed|lambda|qquad|Rightarrow)\b/.test(actualText),
        "real solutions must not leak LaTeX commands",
      );
      assert.deepEqual(await fs.readFile(source), bytes);
      assert.equal((await fs.stat(source)).mtimeMs, stat.mtimeMs);
      await fs.writeFile(
        path.join(output, "waves-and-optics-corrected.pdf"),
        Buffer.from(actual.data),
      );
      const report = {
        source: path.basename(source),
        pages: actualPages.length,
        repaired: actual.diagnostics.filter((d) => d.status === "repaired")
          .length,
        sourceUnchanged: true,
        warnings: actual.warnings,
        standingWavePage:
          actualPages.findIndex((text) =>
            text.includes("five node-to-node intervals"),
          ) + 1,
      };
      await fs.writeFile(
        path.join(output, "math-delimiters-real-document.json"),
        JSON.stringify(report, null, 2),
      );
      console.log(JSON.stringify(report));
    }
    console.log(
      "PASS: actual PDF formulas, exact preview/export bytes, bilingual repair notices, literal code and prices preserved, source bytes/mtime unchanged.",
    );
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
