const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  codeLines,
  highlightCode,
} = require("../../src/conversion/code-highlight.cjs");
const { buildDocument } = require("../../src/conversion/document.cjs");
const MarkdownIt = require("markdown-it");
const sanitize = require("sanitize-html");

test("multiline highlighted spans stay balanced and preserve empty lines", () => {
  const lines = codeLines(
    '<span class="hljs-comment">first\n\n<span class="hljs-doctag">TODO</span> last</span>',
  );
  assert.deepEqual(lines, [
    '<span class="hljs-comment">first</span>',
    '<span class="hljs-comment"></span>',
    '<span class="hljs-comment"><span class="hljs-doctag">TODO</span> last</span>',
  ]);
});

test("Modern code furniture does not change Classic or Minimal code rendering", async (t) => {
  const folder = await fs.mkdtemp(
    path.join(os.tmpdir(), "inkleaf-code-lines-"),
  );
  t.after(async () => {
    assert.equal(path.dirname(folder), path.resolve(os.tmpdir()));
    await fs.rm(folder, { recursive: true, force: true });
  });
  const source =
    '```js\n/* line one\nline two */\n\nconst text = "<script>";\nconsole.log(text);\n```\n';
  const file = path.join(folder, "code.md");
  await fs.writeFile(file, source);
  const legacy = sanitize(
    new MarkdownIt({ highlight: highlightCode }).render(source),
    {
      allowedTags: ["pre", "code", "span"],
      allowedAttributes: { "*": ["class"] },
    },
  ).trim();
  for (const theme of ["default", "minimal", "modern"]) {
    const { html } = await buildDocument(file, { theme, language: "en" });
    const block = html.match(/<pre[\s\S]*?<\/pre>/)[0];
    if (theme !== "modern") assert.equal(block, legacy);
    else {
      assert.match(block, /class="aldus-numbered"/);
      assert.equal((block.match(/class="aldus-code-line"/g) || []).length, 5);
      assert.match(block, /&lt;script&gt;/);
      assert.doesNotMatch(block, /<script>/);
    }
  }
});
