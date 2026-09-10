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

test("retired themes fall back to Classic without losing other preferences", async (t) => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "inkleaf-themes-"));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const settings = path.join(folder, "settings.json");
  assert.equal((await loadSettings(settings, "en")).theme, "default");
  for (const theme of ["folio", "dark", "default", "minimal", "unknown"]) {
    await fs.writeFile(
      settings,
      JSON.stringify({
        theme,
        author: "Keep me",
        h2Size: 22,
        headingNumbering: "uniform",
        unnumberedHeadings: "Preface",
      }),
    );
    const config = await loadSettings(settings, "en");
    assert.equal(config.theme, theme === "minimal" ? "minimal" : "default");
    assert.equal(config.author, "Keep me");
    assert.equal(config.h2Size, 22);
    assert.ok(!Object.hasOwn(config, "headingNumbering"));
    assert.ok(!Object.hasOwn(config, "unnumberedHeadings"));
    if (["default", "minimal"].includes(theme))
      assert.deepEqual(validatePreferences({ theme }), { theme });
    else assert.throws(() => validatePreferences({ theme }));
  }
});

test("both themes preserve authored headings and links even with stale numbering options", async (t) => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "inkleaf-headings-"));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const file = path.join(folder, "sample.md");
  const source =
    "# Sample\n\n## Contents\n\n[9. Mechanical Waves](#9-mechanical-waves)\n\n## 9. Mechanical Waves\n\n### 9.4 Energy\n\nHello 中文.\n\n## Unnumbered chapter\n\nText.\n";
  await fs.writeFile(file, source);
  const before = await fs.stat(file);
  const classic = await buildDocument(file, {
    theme: "default",
    language: "en",
  });
  for (const theme of [undefined, "unknown", "folio", "default", "minimal"]) {
    const document = await buildDocument(file, {
      theme,
      language: "en",
      headingNumbering: "uniform",
      unnumberedHeadings: "Contents",
    });
    if (theme !== "minimal") assert.equal(document.html, classic.html);
    assert.match(
      document.html,
      /<h2 id="9-mechanical-waves">9\. Mechanical Waves<\/h2>/,
    );
    assert.match(document.html, /<h3[^>]*>9\.4 Energy<\/h3>/);
    assert.match(document.html, /<h2[^>]*>Unnumbered chapter<\/h2>/);
    assert.match(document.html, /href="#9-mechanical-waves"/);
    assert.doesNotMatch(document.html, /inkleaf-heading-number|folio-section/);
    assert.equal(document.title, "Sample");
    assert.deepEqual(document.layoutWarnings, []);
  }
  assert.equal(await fs.readFile(file, "utf8"), source);
  assert.equal((await fs.stat(file)).mtimeMs, before.mtimeMs);
});
