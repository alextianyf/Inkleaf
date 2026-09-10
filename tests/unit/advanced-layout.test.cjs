const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { buildDocument } = require("../../src/conversion/document.cjs");
const {
  validatePreferences,
  loadSettings,
} = require("../../src/main/settings.cjs");
const {
  printDecoration,
} = require("../../src/conversion/print-decoration.cjs");
const { layoutKey } = require("../../src/conversion/layout.cjs");

test("copyright label never replaces document headings, links or metadata", async (t) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "inkleaf-copyright-"),
  );
  t.after(async () => {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("inkleaf-copyright-"));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const file = path.join(directory, "notes.md");
  for (const [source, title] of [
    ["# Original\n\n[Back](#original)\n\n# Original", "Original"],
    ["Original\n========\n\nText", "Original"],
    ['<h1 id="intro"><em>HTML title</em></h1>\n\n[Back](#intro)', "HTML title"],
    ["Just a paragraph.\n\n```html\n<h1>Code</h1>\n```", "notes.md"],
  ]) {
    await fs.writeFile(file, source);
    const before = await fs.stat(file);
    const original = await buildDocument(file, { author: "Alex" });
    const result = await buildDocument(file, {
      author: "Alex",
      copyrightLabel: "Course <notes> & teaching",
      documentTitle: "Must be ignored",
    });
    assert.equal(result.title, title);
    assert.equal(
      result.html.split('<div class="aldus-footer">')[0],
      original.html.split('<div class="aldus-footer">')[0],
    );
    assert.match(result.html, /Course &lt;notes&gt; &amp; teaching · © Alex/);
    assert.ok(
      !result.layoutWarnings.some((warning) => warning.key === "brokenAnchor"),
    );
    assert.equal(await fs.readFile(file, "utf8"), source);
    assert.equal((await fs.stat(file)).mtimeMs, before.mtimeMs);
    assert.equal(
      (await buildDocument(file, { author: "Alex", copyrightLabel: "   " }))
        .html,
      original.html,
    );
  }
  const settingsFile = path.join(directory, "settings.json");
  await fs.writeFile(
    settingsFile,
    JSON.stringify({ documentTitle: "Earlier text" }),
  );
  const migrated = await loadSettings(settingsFile, "en");
  assert.equal(migrated.copyrightLabel, "Earlier text");
  assert.equal(migrated.documentTitle, undefined);
});

test("advanced settings validate values and invalidate cached layouts", () => {
  for (const patch of [
    { h1Color: "red;display:none" },
    { h6Before: -1 },
    { h1Size: 999 },
    { headerText: 123 },
    { pageNumberPosition: "top" },
    { copyrightLabel: "x".repeat(201) },
  ])
    assert.throws(() => validatePreferences(patch));
  for (const patch of [
    { h1Size: 30 },
    { h6After: 0 },
    { h2Color: "#123456" },
    { keepTables: false },
    { headerText: "{title}" },
    { pageNumberArea: "header" },
    { copyrightLabel: "Custom" },
  ]) {
    assert.deepEqual(validatePreferences(patch), patch);
    assert.notEqual(layoutKey(patch), layoutKey({}));
  }
});

test("print decorations escape text and independently place numbers and content", () => {
  const result = printDecoration(
    {
      language: "en",
      headerEnabled: true,
      headerText: "{title} <b>safe</b>",
      headerPosition: "right",
      footerEnabled: true,
      footerText: "{file} · {pages}",
      pageNumberArea: "header",
      pageNumberPosition: "left",
      pageNumberFormat: "label",
    },
    "C:/Notes/lesson.md",
    "Title <img src=x>",
  );
  assert.match(result.headerTemplate, /text-align:right/);
  assert.match(
    result.headerTemplate,
    /Title &lt;img src=x&gt; &lt;b&gt;safe&lt;\/b&gt;/,
  );
  assert.match(
    result.headerTemplate,
    /Page <span class="pageNumber"><\/span> of/,
  );
  assert.match(result.footerTemplate, /lesson.md/);
  assert.match(result.footerTemplate, /class="totalPages"/);
  assert.equal(
    printDecoration({ pageNumbers: false }, "file.md", "Title")
      .displayHeaderFooter,
    false,
  );
});
