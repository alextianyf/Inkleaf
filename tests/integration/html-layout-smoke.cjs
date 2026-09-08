const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

(async () => {
  const root = path.resolve(__dirname, "../..");
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "aldus-layout-ui-"));
  const notes = path.join(sandbox, "notes");
  const artifacts = path.join(__dirname, "../../artifacts/tests");
  await fs.mkdir(notes);
  await fs.mkdir(artifacts, { recursive: true });
  const file = path.join(notes, "layout-fixture.md");
  await fs.writeFile(
    path.join(notes, "badge.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="20"><rect width="80" height="20" rx="3" fill="#66788a"/><text x="40" y="14" fill="white" font-family="Arial" font-size="11" text-anchor="middle">Aldus PDF</text></svg>',
  );
  await fs.writeFile(
    file,
    `<style>
.custom-title { text-align: center; color: #314860; }
.custom-image { width: 90px; height: 26px; margin: 0; }
.source-width { width: 360px; }
.flex-row { display: flex; justify-content: center; gap: 12px; }
.grid-row { display: grid; grid-template-columns: 120px 160px; justify-content: center; gap: 8px; }
.layout-box { padding: 8px; border: 1px solid #bbb; }
</style>
<h1 id="custom-title" class="custom-title">HTML layout</h1>
<p align="center" id="badge-row"><a href="https://example.com"><img id="badge-one" class="custom-image" width="75" height="18" src="badge.svg"></a> <img id="badge-two" class="custom-image" src="badge.svg"></p>
<p align="right" id="right-paragraph">Right aligned paragraph</p>
<div align="center"><p id="inherited">Container alignment</p></div>
<p id="inline-center" style="text-align:center">Inline CSS alignment</p>
<p id="plain-paragraph">Default paragraph stays left aligned.</p>
<p><img id="sized-image" width="80" height="20" style="width:120px;height:40px;display:inline-block;margin:0" src="badge.svg"></p>
<table id="sized-table" class="source-width" width="320" align="center" cellpadding="9" cellspacing="0" border="0"><tr><th id="right-header" align="right">Right header</th><th>Header</th></tr><tr><td id="sized-cell" height="60" valign="bottom">Bottom cell</td><td>Cell</td></tr></table>
<div id="flex" class="flex-row"><span class="layout-box">Flex one</span><span class="layout-box">Flex two</span></div>
<div id="grid" class="grid-row"><span class="layout-box">Grid one</span><span class="layout-box">Grid two</span></div>
<ol id="numbered-list" start="5"><li>Fifth item</li></ol>
<div style="break-before:page"><h2>Explicit page break</h2><p>This section starts on page two.</p></div>`,
  );
  await fs.writeFile(
    path.join(notes, "unsupported-fixture.md"),
    '<link rel="stylesheet" href="https://example.com/theme.css"><script>document.body.textContent="bad"</script><p style="background-image:url(https://example.com/image.png)">Content remains readable.</p>',
  );
  await fs.writeFile(
    path.join(sandbox, "settings.json"),
    JSON.stringify({
      roots: [notes],
      autoSearch: false,
      askExportLocation: true,
      language: "en",
      shortcut: "Control+Alt+F9",
    }),
  );
  const env = { ...process.env, ALDUS_TEST_DIR: sandbox };
  delete env.ELECTRON_RUN_AS_NODE;
  const desktop = await electron.launch({
    ...(process.env.ALDUS_EXECUTABLE
      ? { executablePath: process.env.ALDUS_EXECUTABLE, args: [] }
      : { args: [root] }),
    env,
  });
  try {
    const page = await desktop.firstWindow();
    await desktop.evaluate(({ app }) => {
      global.layoutChecks = [];
      app.on("web-contents-created", (_event, contents) =>
        contents.on("did-finish-load", () => {
          if (!contents.getURL().startsWith("aldus://document/")) return;
          void contents
            .executeJavaScript(
              `(async () => {
          await document.fonts.ready;
          await Promise.all(Array.from(document.images, img => img.decode().catch(() => {})));
          if (!document.getElementById('sized-table')) return null;
          const get = id => { const el = document.getElementById(id); const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return { align:s.textAlign, color:s.color, width:r.width, height:r.height, left:r.left, right:r.right, top:r.top, padding:s.paddingLeft, valign:s.verticalAlign, border:s.borderTopWidth, display:s.display, gap:s.gap, columns:s.gridTemplateColumns }; };
          return Object.fromEntries(['custom-title','badge-row','badge-one','badge-two','right-paragraph','inherited','inline-center','plain-paragraph','sized-image','sized-table','right-header','sized-cell','flex','grid','numbered-list'].map(id => [id,get(id)]));
        })()`,
            )
            .then((check) => {
              if (check) global.layoutChecks.push(check);
            });
        }),
      );
    });
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.aldus.search("layout-fixture")))
            .busy,
      )
      .toBe(false);
    for (const theme of ["default", "minimal", "dark"]) {
      const preview = await page.evaluate(
        async ({ file, theme }) => {
          await window.aldus.settings({
            ...(await window.aldus.state()),
            theme,
          });
          const next = await window.aldus.preview(file);
          return {
            warnings: next.warnings,
            layoutWarnings: next.layoutWarnings,
            data: Array.from(next.data),
          };
        },
        { file, theme },
      );
      const check = await desktop.evaluate(() => global.layoutChecks.at(-1));
      assert.ok(check, theme);
      assert.equal(
        check["custom-title"].color,
        "rgb(49, 72, 96)",
        `${theme}: document CSS overrides theme`,
      );
      for (const id of ["badge-row", "inherited", "inline-center"])
        assert.match(check[id].align, /center$/);
      for (const id of ["right-paragraph", "right-header"])
        assert.equal(check[id].align, "right");
      assert.ok(!/center|right/.test(check["plain-paragraph"].align));
      assert.equal(check["badge-one"].width, 90);
      assert.equal(check["badge-one"].height, 26);
      assert.equal(check["badge-one"].top, check["badge-two"].top);
      assert.ok(
        Math.abs(
          (check["badge-one"].left + check["badge-two"].right) / 2 -
            (check["badge-row"].left + check["badge-row"].right) / 2,
        ) < 1,
      );
      assert.equal(check["sized-image"].width, 120);
      assert.equal(check["sized-image"].height, 40);
      assert.equal(
        check["sized-table"].width,
        360,
        "document CSS overrides the HTML width attribute",
      );
      assert.ok(
        Math.abs(
          (check["sized-table"].left + check["sized-table"].right) / 2 -
            (check["badge-row"].left + check["badge-row"].right) / 2,
        ) < 1,
      );
      assert.equal(check["sized-cell"].padding, "9px");
      assert.equal(check["sized-cell"].valign, "bottom");
      assert.equal(check["sized-cell"].border, "0px");
      assert.equal(check.flex.display, "flex");
      assert.equal(check.flex.gap, "12px");
      assert.equal(check.grid.display, "grid");
      assert.equal(check.grid.columns, "120px 160px");
      assert.deepEqual(preview.warnings, []);
      assert.deepEqual(preview.layoutWarnings, []);
      assert.equal(
        Buffer.from(preview.data).subarray(0, 5).toString(),
        "%PDF-",
      );
      await fs.writeFile(
        path.join(artifacts, `html-layout-${theme}.pdf`),
        Buffer.from(preview.data),
      );
    }
    await page.evaluate(async () =>
      window.aldus.settings({
        ...(await window.aldus.state()),
        theme: "default",
      }),
    );
    await page.getByRole("combobox").fill("layout-fixture");
    await expect(page.getByRole("option").first()).toContainText(
      "layout-fixture.md",
    );
    await page.getByRole("combobox").press("Enter");
    await expect(
      page.getByRole("button", { name: "Export PDF", exact: true }),
    ).toBeEnabled({ timeout: 30000 });
    await expect(page.locator(".preview-title > span")).toContainText(
      "2 pages",
    );
    const png = await desktop.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find(
        (win) => win.webContents.getURL() === "aldus://app/desktop.html",
      );
      await window.webContents.executeJavaScript(
        "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
      );
      return (
        await window.webContents.capturePage(undefined, {
          stayHidden: true,
          stayAwake: true,
        })
      )
        .toPNG()
        .toString("base64");
    });
    await fs.writeFile(
      path.join(artifacts, "html-layout.png"),
      Buffer.from(png, "base64"),
    );
    await page
      .getByRole("button", { name: "Back to search", exact: true })
      .click();
    await page.getByRole("combobox").fill("unsupported-fixture");
    await expect(page.getByRole("option").first()).toContainText(
      "unsupported-fixture.md",
    );
    await page.getByRole("combobox").press("Enter");
    await expect(page.locator(".preview-warnings summary")).toHaveText(
      "3 document notices",
    );
    await page.locator(".preview-warnings summary").click();
    await expect(page.locator(".preview-warnings")).toContainText(
      "External stylesheets were not loaded",
    );
    console.log(
      "PASS: all three themes preserve source HTML/CSS alignment, image sizing, table layout, flex/grid; unsupported layout dependencies surface in preview.",
    );
  } finally {
    await desktop.close();
    await fs.rm(sandbox, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
