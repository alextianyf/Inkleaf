const { test } = require("node:test");
const assert = require("node:assert/strict");
const MarkdownIt = require("markdown-it");
const sanitize = require("sanitize-html");
const { highlightCode } = require("../../src/conversion/code-highlight.cjs");
const {
  loadSettings,
  validatePreferences,
} = require("../../src/main/settings.cjs");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

test("language fences color tokens without changing their code", () => {
  const md = new MarkdownIt({ highlight: highlightCode });
  for (const [language, code] of [
    [
      "javascript",
      '// comment\nconst name = "Alex";\nfunction print() { return 42; }',
    ],
    ["python", '# comment\ndef publish(name: str):\n    return "PDF"'],
    ["json", '{"name": "Alex", "copies": 3}'],
    ["cpp", "int main() { return 0; }"],
    ["html", '<div title="test">Hello & goodbye</div>'],
    ["sql", "SELECT name FROM notes WHERE id = 42;"],
    ["css", ".notes { color: #fff; margin: 12px; }"],
  ]) {
    const html = md.render("```" + language + "\n" + code + "\n```");
    assert.match(html, /class="hljs-/);
    assert.equal(
      md.utils
        .unescapeAll(sanitize(html, { allowedTags: [], allowedAttributes: {} }))
        .trim(),
      code,
    );
  }
  for (const language of ["", "unknown", "text"]) {
    const html = md.render(
      "```" + language + '\n<script>alert("x")</script>\n```',
    );
    assert.doesNotMatch(html, /<script>|hljs-/);
    assert.match(html, /&lt;script&gt;/);
  }
  assert.equal(highlightCode("x".repeat(200001), "js"), "");
});

test("retired Dark settings use Folio and retain other preferences", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "inkleaf-theme-"));
  try {
    const file = path.join(folder, "settings.json");
    await fs.writeFile(file, JSON.stringify({ theme: "dark", author: "Alex" }));
    const config = await loadSettings(file, "en");
    assert.equal(config.theme, "folio");
    assert.equal(config.author, "Alex");
    assert.throws(() => validatePreferences({ theme: "dark" }));
  } finally {
    assert.equal(path.dirname(folder), path.resolve(os.tmpdir()));
    assert.ok(path.basename(folder).startsWith("inkleaf-theme-"));
    await fs.rm(folder, { recursive: true, force: true });
  }
});
