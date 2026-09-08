const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const MarkdownIt = require("markdown-it");
const { checkMarkdown } = require("../diagnostics/index.cjs");
const { buildDocument } = require("../document.cjs");
const parser = () => new MarkdownIt({ html: true });

test("no blank line before a valid bullet list is legal and needs no repair", () => {
  for (const source of [
    "solution:\n- xxxx\n- xxx",
    "solution:\n\n- xxxx\n- xxx",
  ]) {
    const checked = checkMarkdown(source, parser());
    assert.equal(checked.source, source);
    assert.deepEqual(checked.diagnostics, []);
    assert.match(
      parser().render(checked.source),
      /<p>solution:<\/p>\n<ul>\n<li>xxxx<\/li>\n<li>xxx<\/li>/,
    );
  }
});

test("repairs the narrow label-plus-consecutive-bullets case and preserves original line numbers/newlines", () => {
  const source = "# Intro\r\n\r\nsolution:\r\n-xxxx\r\n-xxx\r\n";
  const checked = checkMarkdown(source, parser());
  assert.equal(
    checked.source,
    "# Intro\r\n\r\nsolution:\r\n- xxxx\r\n- xxx\r\n",
  );
  assert.deepEqual(checked.diagnostics, [
    {
      ruleId: "markdown/list-spacing",
      key: "sourceListSpaceRepaired",
      status: "repaired",
      line: 4,
      endLine: 5,
    },
  ]);
  assert.match(
    parser().render(checked.source),
    /<li>xxxx<\/li>\n<li>xxx<\/li>/,
  );
  assert.deepEqual(checkMarkdown(checked.source, parser()), {
    source: checked.source,
    diagnostics: [],
  });
  const chinese = checkMarkdown("解决方案：\n-第一项\n-第二项", parser());
  assert.match(parser().render(chinese.source), /<li>第一项<\/li>/);
});

test("code, HTML, math-like prose, nested lists, blockquotes and escaped hyphens remain untouched", () => {
  for (const source of [
    "~~~md\nsolution:\n-xxxx\n-xxx\n~~~",
    "    solution:\n    -xxxx\n    -xxx",
    "<div>\nsolution:\n-xxxx\n-xxx\n</div>",
    "solution:\n`-xxxx\n-xxx`",
    "solution:\n-2\n-3",
    "- Parent\n  solution:\n  -xxxx\n  -xxx",
    "> solution:\n> -xxxx\n> -xxx",
    "solution:\n\\-xxxx\n\\-xxx",
    "---\nname: file\n---",
  ]) {
    const checked = checkMarkdown(source, parser());
    assert.equal(checked.source, source);
    assert.ok(checked.diagnostics.every((d) => d.status !== "repaired"));
  }
});

test("ambiguous indentation, command options, a single bullet and same-line items are notices only", () => {
  for (const [source, key] of [
    ["solution:\n    - xxxx\n    - xxx", "sourceIndentedList"],
    ["Options:\n-help\n-verbose", "sourceListSpaceUncertain"],
    ["solution:\n-x\n-y", "sourceListSpaceUncertain"],
    ["solution:\n-xxxx", "sourceListSpaceUncertain"],
    ["solution:- xxxx - xxx", "sourceInlineList"],
  ]) {
    const checked = checkMarkdown(source, parser());
    assert.equal(checked.source, source);
    assert.equal(checked.diagnostics[0]?.key, key);
    assert.equal(checked.diagnostics[0]?.status, "warning");
  }
});

test("diagnostic payload is bounded while all matching lists are repaired", () => {
  const source = Array.from(
    { length: 110 },
    () => "solution:\n-xxxx\n-xxx",
  ).join("\n\n");
  const checked = checkMarkdown(source, parser());
  assert.equal((checked.source.match(/- xxxx/g) || []).length, 110);
  assert.equal(checked.diagnostics.length, 101);
  assert.equal(checked.diagnostics.at(-1).key, "sourceMoreIssues");
});

test("real document pipeline repairs only its in-memory copy and propagates notices", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "aldus-source-check-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, "original.md");
  const original = Buffer.from("\uFEFFsolution:\r\n-xxxx\r\n-xxx\r\n");
  await fs.writeFile(file, original);
  const stat = await fs.stat(file);
  const doc = await buildDocument(file);
  assert.ok(doc.html.includes("<li>xxxx</li>\n<li>xxx</li>"));
  assert.equal(doc.sourceDiagnostics[0].status, "repaired");
  assert.deepEqual(await fs.readFile(file), original);
  assert.equal((await fs.stat(file)).mtimeMs, stat.mtimeMs);
  assert.deepEqual(await fs.readdir(root), ["original.md"]);
});
