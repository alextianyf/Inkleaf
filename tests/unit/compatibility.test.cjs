const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { buildDocument } = require("../../src/conversion/document.cjs");

async function document(t, source) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "aldus-compat-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, "fixture.md");
  await fs.writeFile(file, source);
  const result = await buildDocument(file);
  return {
    ...result,
    html: result.html.replace(/data:font\/[^)]+/g, "font-omitted"),
  };
}

test("heading anchors use visible text, avoid collisions and respect explicit HTML anchors", async (t) => {
  const doc = await document(
    t,
    `# [API](https://example.com)
# API
# API-1
# **中文** &amp; \\_name\\_
<a id="reserved"></a>

# Reserved

[API](#api) [Duplicate](#api-1) [Collision](#api-1-1) [Chinese](#中文--_name_) [Same file](fixture.md#api)
`,
  );
  for (const id of ["api", "api-1", "api-1-1", "中文--_name_", "reserved-1"])
    assert.match(doc.html, new RegExp(`<h1 id="${id}">`));
  assert.match(doc.html, /href="#api">Same file/);
  assert.deepEqual(doc.layoutWarnings, []);
});

test("task checkboxes and footnotes survive sanitization; disclosures include their body", async (t) => {
  const doc = await document(
    t,
    `- [x] Complete
- [ ] Pending
  - [X] Nested

A note[^one], used again[^one].

[^one]: Footnote **body**.

<details id="more"><summary>More</summary><p>Details body</p></details>
<input type="text" value="secret"><input type="checkbox" checked onclick="bad()">
`,
  );
  const inputs = doc.html.match(/<input\b[^>]*>/g) || [];
  assert.equal(
    inputs.filter((input) => /type="checkbox"/.test(input)).length,
    4,
  );
  assert.equal(
    inputs.filter((input) => /\schecked(?:\s|=|\/?>)/.test(input)).length,
    3,
  );
  assert.match(doc.html, /id="fn1"/);
  assert.match(doc.html, /href="#fnref1:1"/);
  assert.match(doc.html, /<details id="more" open/);
  assert.doesNotMatch(doc.html, /onclick|value="secret"|type="text"/);
  assert.deepEqual(doc.layoutWarnings, []);
});

test("unsupported diagrams, local links, missing anchors and inline SVG produce notices without flagging code examples", async (t) => {
  const doc = await document(
    t,
    '```mermaid\ngraph TD; A-->B\n```\n\n[missing](#absent) [local](other.md)\n\n<svg><rect width="20" height="20"/></svg>\n\n```html\n<script>example</script>\n```',
  );
  assert.deepEqual(doc.layoutWarnings.map((w) => w.key).sort(), [
    "brokenAnchor",
    "diagramSource",
    "inlineSvg",
    "localLinks",
  ]);
  const clean = await document(
    t,
    "```text\n[missing](#absent)\n<svg></svg>\n```\n\n[web](//example.com)",
  );
  assert.deepEqual(clean.layoutWarnings, []);
  assert.match(clean.html, /href="https:\/\/example.com"/);
});
