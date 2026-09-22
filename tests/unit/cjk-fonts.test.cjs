const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { cjkFonts } = require("../../src/conversion/cjk-fonts.cjs");
const { documentFonts } = require("../../src/conversion/theme-fonts.cjs");
const { buildDocument } = require("../../src/conversion/document.cjs");
const manifest = require("../../resources/fonts/noto-sans-sc/manifest.json");

test("bundled font subsets match their source hashes and packaging includes them", () => {
  assert.equal(manifest.length, 101);
  for (const subset of manifest) {
    const bytes = fs.readFileSync(
      path.join(__dirname, "../../resources/fonts/noto-sans-sc", subset.file),
    );
    assert.equal(bytes.subarray(0, 4).toString(), "wOF2");
    assert.equal(bytes.length, subset.bytes);
    assert.equal(
      crypto.createHash("sha256").update(bytes).digest("hex"),
      subset.sha256,
    );
  }
  const config = require("../../package.json");
  assert.ok(config.build.files.includes("resources/fonts/**/*"));
});

test("only required Unicode subsets are embedded; Latin and other themes stay unchanged", () => {
  assert.equal(cjkFonts("ASCII text, Python, 0123456789\n"), "");
  assert.equal(documentFonts("default", "中文"), "");
  assert.equal(documentFonts("minimal", "中文"), "");
  const css = cjkFonts("波动");
  assert.match(css, /font-family:"Inkleaf CJK"/);
  assert.match(css, /font-weight:100 900/);
  assert.doesNotMatch(css, /https:\/\//);
  assert.ok(
    css.length < 400000,
    "a short label must not embed the whole CJK font",
  );
  assert.equal(cjkFonts("波动波动"), css);
});

test("entity-encoded Chinese and generated copyright text also get bundled fonts", async (t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "inkleaf-cjk-"));
  t.after(() => {
    assert.equal(path.dirname(folder), path.resolve(os.tmpdir()));
    assert.ok(path.basename(folder).startsWith("inkleaf-cjk-"));
    fs.rmSync(folder, { recursive: true, force: true });
  });
  const file = path.join(folder, "sample.md");
  const source = "# English\n\n&#20013;&#25991;\n\n> [!NOTE]\n> A note.\n";
  fs.writeFileSync(file, source);
  const result = await buildDocument(file, {
    theme: "modern",
    language: "zh",
    author: "张三",
  });
  assert.match(result.html, /font-family:"Inkleaf CJK"/);
  for (const text of ["中文", "张三", "说明"]) {
    for (const face of cjkFonts(text).split("\n"))
      assert.ok(result.html.includes(face), text);
  }
  assert.equal(fs.readFileSync(file, "utf8"), source);
});
