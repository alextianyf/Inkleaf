const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

(async () => {
  const root = path.resolve(__dirname, "../..");
  const profile = await fs.mkdtemp(
    path.join(os.tmpdir(), "inkleaf-heading-pages-"),
  );
  const artifacts = path.join(root, "artifacts/tests/heading-pagination");
  await fs.mkdir(artifacts, { recursive: true });
  await fs.writeFile(
    path.join(profile, "settings.json"),
    JSON.stringify({
      language: "en",
      autoSearch: false,
      roots: [profile],
      shortcut: "Control+Alt+F7",
      authorEnabled: false,
      pageNumbers: false,
      avoidWidows: false,
    }),
  );
  const env = { ...process.env, ALDUS_TEST_DIR: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const desktop = await electron.launch({ args: [root], env });
  try {
    const main = await desktop.firstWindow();
    await main.getByRole("combobox").waitFor();
    await desktop.evaluate(({ app }) => {
      app.on("web-contents-created", (_, contents) => {
        const print = contents.printToPDF.bind(contents);
        contents.printToPDF = async (options) => {
          // Put a real, multiline heading at a precisely controlled page boundary.
          // Fixed heading width makes screen measurements equal print measurements.
          await contents.executeJavaScript(`(() => {
            const spacer = document.getElementById('spacer');
            if (!spacer) return;
            const heading = document.querySelector('h2');
            const style = getComputedStyle(heading);
            const height = heading.getBoundingClientRect().height;
            const remaining = spacer.classList.contains('inside')
              ? height / 2 : height + parseFloat(style.marginBottom) + 5;
            spacer.style.height = (parseFloat(spacer.style.height) - remaining) + 'px';
          })()`);
          return print(options);
        };
      });
    });
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    for (const theme of ["default", "minimal"]) {
      for (const keepHeadings of [true, false]) {
        for (const edge of ["inside", "after"]) {
          // Exercise Letter landscape as well as A4 portrait.
          const landscape = theme === "minimal";
          const pageHeight =
            (((landscape ? 215.9 : 297) - 20 - 25) * 96) / 25.4;
          const name = `${theme}-${keepHeadings}-${edge}`;
          const file = path.join(profile, name + ".md");
          const fixture = `<style>body{margin:0}h2{width:420px}</style>
<div id="spacer" class="${edge}" style="height:${pageHeight}px"></div>

## 37. Mechanical Waves and energy transferred through a medium HEADING_END

FOLLOWING_TEXT starts immediately after this heading.
`;
          await fs.writeFile(file, fixture);
          const before = await fs.stat(file);
          await expect
            .poll(
              () =>
                main.evaluate(async (file) => {
                  const result = await window.aldus.search(
                    file.split(/[\\/]/).pop(),
                  );
                  return result.files.some((entry) => entry.path === file);
                }, file),
              { timeout: 15000 },
            )
            .toBe(true);
          await main.evaluate((options) => window.aldus.settings(options), {
            theme,
            keepHeadings,
            h2Before: 0,
            paperSize: landscape ? "Letter" : "A4",
            orientation: landscape ? "landscape" : "portrait",
          });
          const result = await main.evaluate(
            (file) => window.aldus.preview(file),
            file,
          );
          await fs.writeFile(
            path.join(artifacts, name + ".pdf"),
            new Uint8Array(result.data),
          );
          const loading = pdfjs.getDocument({
            data: new Uint8Array(result.data),
          });
          const pdf = await loading.promise;
          const pages = [];
          for (let i = 1; i <= pdf.numPages; i++) {
            const items = (await (await pdf.getPage(i)).getTextContent()).items;
            pages.push(
              items
                .map((item) => item.str)
                .join("")
                .replace(/\s/g, ""),
            );
          }
          await loading.destroy();
          const number = "37.";
          const numberPage = pages.findIndex((text) => text.includes(number));
          const titlePage = pages.findIndex((text) =>
            text.includes("MechanicalWaves"),
          );
          const endPage = pages.findIndex((text) =>
            text.includes("HEADING_END"),
          );
          const followingPage = pages.findIndex((text) =>
            text.includes("FOLLOWING_TEXT"),
          );
          console.log(name, {
            numberPage,
            titlePage,
            endPage,
            followingPage,
          });
          assert.ok(
            numberPage >= 0 &&
              titlePage >= 0 &&
              endPage >= 0 &&
              followingPage >= 0,
            "all content survives",
          );
          assert.equal(
            numberPage,
            titlePage,
            "number and title must be on the same page",
          );
          assert.equal(
            titlePage,
            endPage,
            "a multiline heading that fits a page must stay whole",
          );
          if (keepHeadings)
            assert.equal(
              titlePage,
              followingPage,
              "keep heading with following text",
            );
          if (edge === "after" && !keepHeadings) {
            assert.equal(
              titlePage,
              0,
              "turning the rule off still allows a heading at the page end",
            );
            assert.equal(followingPage, 1);
          }
          assert.equal(await fs.readFile(file, "utf8"), fixture);
          assert.equal((await fs.stat(file)).mtimeMs, before.mtimeMs);
        }
      }
    }
    console.log(
      "PASS: heading numbers, multiline titles and following-text rules at real PDF page boundaries.",
    );
  } finally {
    await desktop.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
