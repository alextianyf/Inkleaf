const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

(async () => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const root = path.resolve(__dirname, "../..");
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "aldus-compat-ui-"));
  const notes = path.join(sandbox, "notes");
  const artifacts = path.join(__dirname, "../../artifacts/tests");
  await fs.mkdir(notes);
  await fs.mkdir(artifacts, { recursive: true });
  await fs.copyFile(
    path.join(root, "tests/fixtures/images/trig_graphs.png"),
    path.join(notes, "image.png"),
  );
  const file = path.join(notes, "compatibility.md");
  await fs.writeFile(
    file,
    `# Compatibility

**Bold** *emphasis* ~~removed~~ \\*literal\\* &amp; 中文内容。
Hard break  
NEXT-LINE

- [x] Completed
- [ ] Pending
  - [X] Nested completed

7. Seventh item
8. Eighth item

> Quote with **bold** text.

[Linked heading](#api) · [Duplicate](#api-1-1) · [Chinese](#中文章节) · [Email](mailto:test@example.com)

A footnote[^note] and the same note again[^note].

<details><summary>More details</summary><p>DISCLOSURE-BODY</p></details>
<p id="image-row" align="right"><img id="plain-image" width="120" src="image.png"></p>

| Left | Center | Right |
| :--- | :---: | ---: |
| left value | middle value | right value |

<table id="html-table" width="320" align="center" cellpadding="7"><tr><td id="html-cell">Cell stays left aligned</td><td>Other</td></tr></table>

Inline $E=mc^2$ and display math:

$$\\frac{1}{2}+\\sqrt{x^2+y^2}$$

<div style="break-before:page"></div>

## [API](https://example.com)
## API
## API-1
## 中文章节

[Back](#compatibility)

### Long code and table

~~~text
${"long_token_".repeat(60)}END-LONG-CODE
${Array.from({ length: 55 }, (_, i) => `CODE-LINE-${String(i + 1).padStart(3, "0")}`).join("\n")}
~~~

| RepeatHeader | Payload |
| --- | --- |
${Array.from({ length: 70 }, (_, i) => `| ROW-${String(i + 1).padStart(3, "0")} | ${i === 20 ? "longcell".repeat(80) : "Printable table content"} |`).join("\n")}

[^note]: FOOTNOTE-BODY with a [web link](https://example.com).
`,
  );
  await fs.writeFile(
    path.join(sandbox, "settings.json"),
    JSON.stringify({
      roots: [notes],
      autoSearch: false,
      askExportLocation: true,
      language: "en",
      shortcut: "Control+Alt+F7",
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
      global.compatChecks = [];
      app.on("web-contents-created", (_, contents) =>
        contents.on("did-finish-load", () => {
          if (!contents.getURL().startsWith("aldus://document/")) return;
          void contents
            .executeJavaScript(
              `(async()=>{
          await document.fonts.ready;
          await Promise.all(Array.from(document.images,i=>i.decode().catch(()=>{})));
          const image=document.getElementById('plain-image'); if(!image) return null;
          const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width}};
          return {image:rect(image),row:rect(document.getElementById('image-row')),
            tableAlign:getComputedStyle(document.getElementById('html-cell')).textAlign,
            columns:Array.from(document.querySelectorAll('thead th')).slice(0,3).map(el=>getComputedStyle(el).textAlign),
            tasks:Array.from(document.querySelectorAll('input')).map(el=>({checked:el.checked,disabled:el.disabled,width:el.getBoundingClientRect().width})),
            details:document.querySelector('details').open,
            math:document.querySelectorAll('.katex').length};
        })()`,
            )
            .then((check) => {
              if (check) global.compatChecks.push(check);
            });
        }),
      );
    });
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.aldus.search("compatibility")))
            .busy,
      )
      .toBe(false);
    const reports = [];
    for (const theme of ["default", "minimal", "folio"]) {
      const preview = await page.evaluate(
        async ({ file, theme }) => {
          await window.aldus.settings({
            ...(await window.aldus.state()),
            theme,
          });
          const p = await window.aldus.preview(file);
          return {
            data: Array.from(p.data),
            warnings: p.warnings,
            layoutWarnings: p.layoutWarnings,
          };
        },
        { file, theme },
      );
      assert.deepEqual(preview.warnings, []);
      assert.deepEqual(preview.layoutWarnings, []);
      const check = await desktop.evaluate(() => global.compatChecks.at(-1));
      assert.ok(
        Math.abs(check.image.right - check.row.right) < 1,
        `${theme}: ordinary image obeys paragraph alignment`,
      );
      assert.equal(check.image.width, 120);
      assert.ok(
        !/center|right/.test(check.tableAlign),
        `${theme}: centering a table must not center its cell text`,
      );
      assert.deepEqual(check.columns, ["left", "center", "right"]);
      assert.deepEqual(
        check.tasks.map((t) => t.checked),
        [true, false, true],
      );
      assert.ok(check.tasks.every((t) => t.disabled && t.width > 5));
      assert.equal(check.details, true);
      assert.equal(check.math, 2);
      await fs.writeFile(
        path.join(artifacts, `compatibility-${theme}.pdf`),
        Buffer.from(preview.data),
      );
      const loading = pdfjs.getDocument({
        data: new Uint8Array(preview.data),
        useSystemFonts: true,
      });
      const pdf = await loading.promise;
      const texts = [],
        links = [],
        tablePages = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        const p = await pdf.getPage(n),
          content = await p.getTextContent();
        const text = content.items
          .map((i) => i.str)
          .join("")
          .normalize("NFKC");
        texts.push(text);
        for (const item of content.items.filter((i) => i.str?.trim())) {
          assert.ok(
            item.transform[4] >= 50 &&
              item.transform[4] + item.width <= p.view[2] - 50,
            `${theme} page ${n}: text outside paper: ${item.str.slice(0, 40)}`,
          );
        }
        if (/ROW-\d/.test(text)) {
          tablePages.push(n);
          assert.ok(
            text.includes("RepeatHeader"),
            `${theme}: table header repeats on page ${n}`,
          );
        }
        for (const a of await p.getAnnotations())
          if (a.subtype === "Link") links.push(a);
      }
      const all = texts.join("");
      for (const marker of [
        "Bold",
        "emphasis",
        "removed",
        "NEXT-LINE",
        "DISCLOSURE-BODY",
        "FOOTNOTE-BODY",
        "END-LONG-CODE",
        ...Array.from(
          { length: 55 },
          (_, i) => `CODE-LINE-${String(i + 1).padStart(3, "0")}`,
        ),
        ...Array.from(
          { length: 70 },
          (_, i) => `ROW-${String(i + 1).padStart(3, "0")}`,
        ),
      ])
        assert.ok(all.includes(marker), `${theme}: PDF is missing ${marker}`);
      assert.ok(tablePages.length >= 2);
      const destinations = await pdf.getDestinations();
      for (const name of [
        "api",
        "api-1-1",
        "中文章节",
        "fn1",
        "fnref1",
        "fnref1:1",
      ])
        assert.ok(
          destinations.get(name) || destinations.get(encodeURIComponent(name)),
          `${theme}: missing destination ${name}`,
        );
      assert.ok(links.some((a) => a.url?.startsWith("mailto:")));
      for (const link of links.filter((a) => a.dest))
        assert.ok(
          typeof link.dest !== "string" || destinations.get(link.dest),
          `${theme}: dangling PDF annotation`,
        );
      reports.push({
        theme,
        pages: pdf.numPages,
        links: links.length,
        tablePages,
      });
      await loading.destroy();
    }
    await page.evaluate(async () =>
      window.aldus.settings({
        ...(await window.aldus.state()),
        theme: "default",
      }),
    );
    // Synchronize the UI after the direct IPC theme sweep above.
    await page.reload();
    await page.getByRole("combobox").waitFor();
    await page.getByRole("combobox").fill("compatibility");
    await expect(page.getByRole("option").first()).toContainText(
      "compatibility.md",
    );
    await page.getByRole("combobox").press("Enter");
    await expect(
      page.getByRole("button", { name: "Export PDF", exact: true }),
    ).toBeEnabled({ timeout: 30000 });
    await page.getByRole("link", { name: "[1]", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.activeElement.closest(".pdf-page")?.dataset.pageNumber,
        ),
      )
      .not.toBe("1");
    await page
      .locator('.pdf-page:last-child .pdf-link[data-link-kind="internal"]')
      .first()
      .click();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.activeElement.closest(".pdf-page")?.dataset.pageNumber,
        ),
      )
      .toBe("1");
    const png = await desktop.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      await win.webContents.executeJavaScript(
        "document.querySelector('.preview-content').scrollTop=0;new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
      );
      return (
        await win.webContents.capturePage(undefined, {
          stayHidden: true,
          stayAwake: true,
        })
      )
        .toPNG()
        .toString("base64");
    });
    await fs.writeFile(
      path.join(artifacts, "compatibility.png"),
      Buffer.from(png, "base64"),
    );
    await fs.writeFile(
      path.join(artifacts, "compatibility-report.json"),
      JSON.stringify(reports, null, 2),
    );
    console.log(
      "PASS: compatibility corpus, all themes, printed text bounds/content, repeated table headers, images, task lists, footnotes and preview return links.",
      reports,
    );
  } finally {
    await desktop.close();
    await fs.rm(sandbox, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
