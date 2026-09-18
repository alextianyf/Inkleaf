const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { buildDocument } = require("../../src/conversion/document.cjs");
const strings = require("../../src/shared/strings.json");

// Only the rendered body: the stylesheet naturally mentions the callout
// classes, so matching the whole document would prove nothing.
async function render(source, options = {}) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "inkleaf-callouts-"));
  const file = path.join(folder, "note.md");
  await fs.writeFile(file, source);
  try {
    const { html } = await buildDocument(file, { theme: "modern", ...options });
    return html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
  } finally {
    await fs.rm(folder, { recursive: true, force: true });
  }
}

test("a marked blockquote becomes a labelled callout in the document language", async () => {
  for (const [type, key] of [
    ["note", "calloutNote"],
    ["tip", "calloutTip"],
    ["important", "calloutImportant"],
    ["warning", "calloutWarning"],
    ["caution", "calloutCaution"],
  ]) {
    for (const language of ["en", "zh"]) {
      const html = await render(
        `> [!${type.toUpperCase()}]\n> Body text stays.\n`,
        { language },
      );
      assert.match(
        html,
        new RegExp(`<blockquote class="aldus-callout aldus-callout-${type}">`),
        `${type} ${language}: blockquote carries its type`,
      );
      assert.match(
        html,
        new RegExp(
          `<p class="aldus-callout-label">${strings[language][key]}</p>`,
        ),
        `${type} ${language}: label follows the language`,
      );
      assert.match(html, /<p>Body text stays.<\/p>/);
      assert.doesNotMatch(html, /\[!/, `${type}: the marker is consumed`);
    }
  }
});

test("the marker is recognised on the body line and in any case", async () => {
  const sameLine = await render("> [!tip] Count the gaps.\n", {
    language: "en",
  });
  assert.match(sameLine, /aldus-callout-tip/);
  assert.match(sameLine, /<p>Count the gaps.<\/p>/);
  assert.doesNotMatch(sameLine, /\[!/);
});

test("quotations without a known marker are left exactly as they were", async () => {
  const plain = await render(
    "> **Key idea:** Ordinary quotation.\n\n> [!SUMMARY]\n> Unknown marker.\n",
    { language: "en" },
  );
  assert.match(plain, /<blockquote>\n<p><strong>Key idea:<\/strong>/);
  assert.doesNotMatch(plain, /aldus-callout/);
  assert.match(plain, /\[!SUMMARY\]/, "an unknown marker stays as text");
});

test("every theme renders the same callout markup", async () => {
  const source = "> [!IMPORTANT]\n> One rule for every theme.\n";
  const modern = await render(source, { language: "en" });
  for (const theme of ["default", "minimal"]) {
    const html = await render(source, { language: "en", theme });
    assert.equal(
      html.match(/<blockquote[\s\S]*?<\/blockquote>/)[0],
      modern.match(/<blockquote[\s\S]*?<\/blockquote>/)[0],
      `${theme}: callouts are content, not a theme feature`,
    );
  }
});
