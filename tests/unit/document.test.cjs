const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { buildDocument } = require("../../src/conversion/document.cjs");

test("renders the existing sample with bundled math/fonts and embedded local images", async () => {
  const document = await buildDocument(
    path.join(__dirname, "../fixtures/sample.md"),
  );
  assert.match(document.html, /class="katex"/);
  assert.match(document.html, /data:font\/woff2;base64,/);
  assert.match(document.html, /data:image\/png;base64,/);
  assert.match(document.html, /id="headings"/);
  assert.doesNotMatch(document.html, /<script|cdn\.jsdelivr/);
  assert.deepEqual(document.warnings, []);
});

test("disables executable Markdown and escapes metadata; never writes a PDF during HTML preparation", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "aldus-document-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, "untrusted.md");
  await fs.writeFile(
    file,
    '# 标题\n\n<script>window.evil = true</script>\n\n<img src="https://example.com/tracker.png" onerror="alert(1)">\n\n[bad](javascript:alert(1))\n\n$E=mc^2$',
  );
  const document = await buildDocument(file, {
    author: "<img src=x onerror=alert(1)>",
    remoteLoader: async () => {
      throw new Error("offline");
    },
  });
  assert.equal(
    /<script|<[^>]+\sonerror=|href="javascript:/.test(document.html),
    false,
  );
  assert.match(document.html, /&lt;img/);
  assert.match(document.html, /class="katex"/);
  assert.equal(document.warnings.length, 1);
  assert.deepEqual(await fs.readdir(root), ["untrusted.md"]);
});

test("embeds remote and local SVG badges inline, retains dimensions and removes active SVG content", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "aldus-badges-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="110" height="20" viewBox="0 0 110 20"><defs><linearGradient id="shade"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect width="110" height="20" fill="#66788a"/><text x="10" y="14" fill="#fff">build passing</text><script>alert(1)</script><image href="https://private.test/tracker"/><rect fill="url(https://private.test/x)" onload="bad()"/></svg>';
  await fs.writeFile(path.join(root, "badge.svg"), svg);
  const file = path.join(root, "badges.md");
  await fs.writeFile(
    file,
    '<p align="center"><a href="https://example.com"><img alt="build" src="https://img.shields.io/test.svg"></a> <img alt="local" src="badge.svg"></p>\n\n<div align="left"><p style="text-align: right"><img src="https://img.shields.io/test.svg" width="110" height="20"/></p></div>\n\n![unavailable](https://example.com/missing.png)',
  );
  let requests = 0;
  const document = await buildDocument(file, {
    remoteLoader: async (url) => {
      requests++;
      if (url.includes("missing")) throw new Error("offline");
      return Buffer.from(svg);
    },
  });
  assert.equal(requests, 2, "duplicate badge is loaded once per document");
  assert.equal(
    (document.html.match(/class="aldus-badge(?: aldus-layout-\d+)?"/g) || [])
      .length,
    3,
  );
  assert.match(document.html, /width="110" height="20"/);
  assert.match(document.html, /<p align="center" class="aldus-layout-\d+">/);
  assert.match(
    document.html,
    /<div align="left" class="aldus-layout-\d+"><p style="text-align:right">/,
  );
  const embedded = Buffer.from(
    document.html.match(/data:image\/svg\+xml;base64,([^"]+)/)[1],
    "base64",
  ).toString();
  assert.match(embedded, /build passing/);
  assert.match(embedded, /linearGradient/);
  assert.doesNotMatch(embedded, /<script|onload|private\.test/);
  assert.deepEqual(document.warnings, ["https://example.com/missing.png"]);
  assert.match(document.html, /unavailable<\/span>/);
});

test("preserves authored CSS, image presentation, table layout and list numbering; reports unsupported resources", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "aldus-layout-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(
    path.join(root, "badge.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="20"><rect width="80" height="20" fill="green"/></svg>',
  );
  await fs.copyFile(
    path.join(__dirname, "../fixtures/images/trig_graphs.png"),
    path.join(root, "raster.png"),
  );
  const file = path.join(root, "layout.md");
  await fs.writeFile(
    file,
    `<style>.custom {display:flex;justify-content:center;gap:12px}</style>
<h1 align="right">Title</h1>
<div class="custom" dir="rtl"><img id="badge" class="custom-image" style="width:120px;height:32px" width="80" src="badge.svg" title="Badge"></div>
<img src="raster.png" width="80" height="20" style="width:96px;display:inline-block">
<table width="50%" align="center" cellpadding="7" cellspacing="0" border="0"><tr><th align="right">Header</th></tr><tr><td rowspan="2" colspan="2" valign="bottom" height="60">Cell</td></tr></table>
<ol start="5" reversed><li value="9">Nine</li></ol>
<link rel="stylesheet" href="https://example.com/main.css"><script>alert(1)</script>
<div style="background-image:url(https://example.com/background.png)">Background</div>`,
  );
  const doc = await buildDocument(file);
  assert.match(
    doc.html,
    /<style>\.custom \{display:flex;justify-content:center;gap:12px\}<\/style>/,
  );
  assert.match(doc.html, /@layer aldus-defaults/);
  assert.match(doc.html, /class="custom-image aldus-badge aldus-layout-\d+"/);
  assert.match(doc.html, /width:120px;height:32px/);
  assert.match(doc.html, /width:96px;display:inline-block/);
  assert.match(doc.html, /width:50%;margin-left:auto;margin-right:auto/);
  assert.match(doc.html, /text-align:right/);
  assert.match(doc.html, /vertical-align:bottom;padding:7px/);
  assert.match(doc.html, /rowspan="2" colspan="2"/);
  assert.match(doc.html, /<ol start="5" reversed/);
  assert.match(doc.html, /<li value="9">/);
  assert.doesNotMatch(doc.html, /<script|<link/);
  assert.deepEqual(doc.layoutWarnings.map((warning) => warning.key).sort(), [
    "cssResources",
    "dynamicContent",
    "externalStyles",
  ]);
});
