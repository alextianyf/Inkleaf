const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { resolveImages } = require("../../src/conversion/images.cjs");
const { buildDocument } = require("../../src/conversion/document.cjs");

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="20"><rect width="80" height="20" fill="purple"/></svg>';

test("image failures retain actionable reasons without changing Markdown", async (t) => {
  const { root, base } = await fixture(t);
  await fs.mkdir(path.join(root, ".git"));
  await fs.writeFile(path.join(base, "broken.png"), "not an image");
  const file = path.join(base, "failures.md");
  const source = [
    "![External](../../../outside.svg)",
    "![Missing](missing.png)",
    "![Broken](broken.png)",
    "![Timeout](https://example.com/slow.png)",
    "![External again](../../../outside.svg)",
  ].join("\n\n");
  await fs.writeFile(file, source);
  const result = await buildDocument(file, {
    remoteLoader: async () => {
      throw new DOMException("Too slow", "TimeoutError");
    },
  });
  assert.equal(result.warnings.length, 4);
  const reasons = Object.fromEntries(
    result.imageWarnings.map((item) => [item.source, item.key]),
  );
  assert.deepEqual(reasons, {
    "../../../outside.svg": "imageOutsideProject",
    "missing.png": "imageNotFound",
    "broken.png": "imageUnsupportedFormat",
    "https://example.com/slow.png": "imageTimeout",
  });
  assert.equal(await fs.readFile(file, "utf8"), source);
});

test("images beyond the document limit are reported explicitly", async (t) => {
  const { base } = await fixture(t);
  const sources = Array.from(
    { length: 101 },
    (_, i) => `https://example.com/${i}.svg`,
  );
  const issues = [];
  const images = await resolveImages(
    sources,
    base,
    async () => Buffer.from(svg),
    issues,
  );
  assert.equal(images.size, 101);
  assert.equal(images.get(sources[100]), null);
  assert.deepEqual(issues, [
    { source: sources[100], key: "imageLimitExceeded" },
  ]);
});

async function fixture(t) {
  const sandbox = await fs.mkdtemp(
    path.join(os.tmpdir(), "inkleaf-project-images-"),
  );
  t.after(async () => {
    assert.equal(path.dirname(sandbox), path.resolve(os.tmpdir()));
    assert.ok(path.basename(sandbox).startsWith("inkleaf-project-images-"));
    await fs.rm(sandbox, { recursive: true, force: true });
  });
  const root = path.join(sandbox, "project");
  const base = path.join(root, "courses", "chapter");
  await fs.mkdir(base, { recursive: true });
  await fs.mkdir(path.join(root, "assets"));
  await fs.writeFile(path.join(root, "assets", "shared logo.svg"), svg);
  await fs.writeFile(path.join(base, "local.svg"), svg);
  await fs.writeFile(path.join(sandbox, "outside.svg"), svg);
  return { sandbox, root, base };
}

test("a lesson embeds shared project images without modifying Markdown or layout", async (t) => {
  const { root, base } = await fixture(t);
  await fs.mkdir(path.join(root, ".git"));
  const file = path.join(base, "lesson.md");
  const source =
    '<p align="center"><img src="../../assets/shared%20logo.svg" alt="Company" height="20"></p>\n\n![Local](local.svg)\n';
  await fs.writeFile(file, source);
  const before = await fs.stat(file);
  for (const theme of ["modern", "default", "minimal"]) {
    const result = await buildDocument(file, { theme, language: "en" });
    assert.deepEqual(result.warnings, []);
    assert.equal((result.html.match(/<img /g) || []).length, 2);
    assert.match(result.html, /src="data:image\/svg\+xml;base64,/);
    assert.match(result.html, /alt="Company" height="20"/);
    assert.match(result.html, /text-align: center/);
  }
  assert.equal(await fs.readFile(file, "utf8"), source);
  assert.equal((await fs.stat(file)).mtimeMs, before.mtimeMs);
});

test("worktree .git files define a boundary; traversal and junction escapes stay blocked", async (t) => {
  const { sandbox, root, base } = await fixture(t);
  await fs.writeFile(path.join(root, ".git"), "gitdir: ../metadata\n");
  await fs.symlink(
    sandbox,
    path.join(root, "linked"),
    process.platform === "win32" ? "junction" : "dir",
  );
  const sources = [
    "../../assets/shared%20logo.svg",
    "../../../outside.svg",
    "../../linked/outside.svg",
    "../../assets/missing.svg",
  ];
  const images = await resolveImages(sources, base);
  assert.ok(images.get(sources[0]));
  for (const source of sources.slice(1))
    assert.equal(images.get(source), null, source);
});

test("the nearest nested project wins; standalone documents retain their folder boundary", async (t) => {
  const { root, base } = await fixture(t);
  let images = await resolveImages(
    ["local.svg", "../../assets/shared%20logo.svg"],
    base,
  );
  assert.ok(images.get("local.svg"));
  assert.equal(images.get("../../assets/shared%20logo.svg"), null);
  await fs.mkdir(path.join(root, ".git"));
  await fs.mkdir(path.join(root, "courses", ".git"));
  images = await resolveImages(
    ["local.svg", "../../assets/shared%20logo.svg"],
    base,
  );
  assert.ok(images.get("local.svg"));
  assert.equal(images.get("../../assets/shared%20logo.svg"), null);
});
