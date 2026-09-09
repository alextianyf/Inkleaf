const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const MarkdownIt = require("markdown-it");
const { checkMarkdown } = require("../../src/conversion/diagnostics/index.cjs");
const { buildDocument } = require("../../src/conversion/document.cjs");

function parser() {
  return new MarkdownIt({ html: true }).use(require("markdown-it-texmath"), {
    engine: require("katex"),
    delimiters: "dollars",
  });
}

test("repairs standalone single-dollar display formulas and preserves lines, whitespace and idempotence", () => {
  const original =
    "# Solution\r\n\r\n  $ \t\r\n0.80=5\\frac{\\lambda}{2}\r\n\\lambda=\\boxed{0.32\\text{ m}}\r\n  $\r\n";
  const md = parser();
  assert.equal(
    md.parse(original, {}).filter((t) => t.type === "math_block").length,
    0,
  );
  const checked = checkMarkdown(original, md);
  assert.equal(
    checked.source,
    "# Solution\r\n\r\n  $$ \t\r\n0.80=5\\frac{\\lambda}{2}\r\n\\lambda=\\boxed{0.32\\text{ m}}\r\n  $$\r\n",
  );
  assert.equal(
    checked.source.split("\r\n").length,
    original.split("\r\n").length,
  );
  assert.deepEqual(checked.diagnostics, [
    {
      ruleId: "markdown/math-delimiters",
      key: "sourceMathDelimitersRepaired",
      status: "repaired",
      line: 3,
      endLine: 6,
    },
  ]);
  assert.equal(
    md.parse(checked.source, {}).filter((t) => t.type === "math_block").length,
    1,
  );
  assert.deepEqual(checkMarkdown(checked.source, md), {
    source: checked.source,
    diagnostics: [],
  });
});

test("keeps valid math, literal examples, HTML, prices and ambiguous delimiters unchanged", () => {
  for (const original of [
    "$v$ and $E=mc^2$",
    "$$\nx=1\n$$",
    "$x=1$",
    "$20 and $30",
    "$\n20\n$",
    "$\nordinary text\n$",
    "```latex\n$\nx=\\frac{1}{2}\n$\n```",
    "    $\n    x=1\n    $",
    "`$\nx=1\n$`",
    "<pre>\n$\nx=1\n$\n</pre>",
    "<div>\n$\nx=1\n$\n</div>",
    "\\$\nx=1\n\\$",
    "$\nx=1",
    "$\nx=1\n$$",
    "$\nx=1\n$\nprose after the delimiter",
    "$\nx=1\n$\n$\ny=2\n$",
  ])
    assert.equal(checkMarkdown(original, parser()).source, original, original);
});

test("unparseable candidate gives a source-line warning instead of guessing its mathematics", () => {
  const original = "$\nx=\\frac{1}{\n$";
  const result = checkMarkdown(original, parser());
  assert.equal(result.source, original);
  assert.equal(result.diagnostics[0].key, "sourceMathDelimitersUncertain");
  assert.equal(result.diagnostics[0].status, "warning");
});

test("repairs every formula even when the visible diagnostic list reaches its limit", () => {
  const source = Array.from({ length: 110 }, () => "$\nx=1\n$").join("\n\n");
  const md = parser();
  const result = checkMarkdown(source, md);
  assert.equal(
    md.parse(result.source, {}).filter((t) => t.type === "math_block").length,
    110,
  );
  assert.equal(result.diagnostics.length, 101);
  assert.equal(result.diagnostics.at(-1).key, "sourceMoreIssues");
});

test("real document pipeline repairs both screenshot equations without writing the original", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "inkleaf-math-"));
  const file = path.join(root, "solutions.md");
  const original = await fs.readFile(
    path.join(__dirname, "../fixtures/math-delimiters.md"),
  );
  await fs.writeFile(file, original);
  const before = await fs.stat(file);
  const document = await buildDocument(file);
  assert.equal(
    document.sourceDiagnostics.filter((d) => d.status === "repaired").length,
    2,
  );
  assert.equal((document.html.match(/class="katex-display"/g) || []).length, 3);
  assert.equal((document.html.match(/class="katex"/g) || []).length, 4);
  assert.deepEqual(document.layoutWarnings, []);
  assert.match(document.html, /Tickets cost \$20 and \$30/);
  assert.deepEqual(await fs.readFile(file), original);
  assert.equal((await fs.stat(file)).mtimeMs, before.mtimeMs);
  // Remove only the two files this test created; no recursive directory delete.
  await fs.unlink(file);
  await fs.rmdir(root);
});
