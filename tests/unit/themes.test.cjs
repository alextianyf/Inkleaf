const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  loadSettings,
  validatePreferences,
} = require("../../src/main/settings.cjs");
const { buildDocument } = require("../../src/conversion/document.cjs");
const { layoutSample } = require("../../src/main/layout-sample.cjs");

test("Folio is the default while saved Classic and Minimal preferences survive", async (t) => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "inkleaf-themes-"));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const settings = path.join(folder, "settings.json");
  assert.equal((await loadSettings(settings, "en")).theme, "folio");
  for (const theme of ["folio", "default", "minimal", "unknown"]) {
    await fs.writeFile(settings, JSON.stringify({ theme, author: "Keep me" }));
    const config = await loadSettings(settings, "en");
    assert.equal(config.theme, theme === "unknown" ? "folio" : theme);
    assert.equal(config.author, "Keep me");
    if (theme !== "unknown")
      assert.deepEqual(validatePreferences({ theme }), { theme });
  }
  const file = path.join(folder, "sample.md");
  const source = "# Sample\n\n## A section\n\nHello 中文.\n";
  await fs.writeFile(file, source);
  for (const theme of [undefined, "unknown", "folio", "default", "minimal"]) {
    const document = await buildDocument(file, { theme, language: "en" });
    const folio = !theme || theme === "unknown" || theme === "folio";
    assert.equal(document.html.includes("counter-reset: folio-section"), folio);
    assert.equal(document.title, "Sample");
    assert.deepEqual(document.layoutWarnings, []);
  }
  assert.equal(await fs.readFile(file, "utf8"), source);
  const comparison = layoutSample(
    { theme: "folio", language: "en" },
    { name: "keepHeadings", enabled: true },
  );
  assert.equal(
    comparison.options.theme,
    "default",
    "calibrated comparisons retain their reference theme",
  );
});
