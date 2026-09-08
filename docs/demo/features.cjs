// Produce README comparisons from actual Inkleaf PDFs, never HTML mock PDFs.
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { _electron: electron, chromium } = require("@playwright/test");

const run = promisify(execFile);
const root = path.resolve(__dirname, "../..");
const examples = path.join(__dirname, "examples");
const output = path.join(root, "docs/media/examples");
const scratch = path.join(root, "artifacts/readme-features");
const names = ["typography", "code-math", "tables-lists", "images-links"];
const escape = (text) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

async function main() {
  await fs.mkdir(output, { recursive: true });
  await fs.mkdir(scratch, { recursive: true });
  // Keep image references inside the sample folder, just like user documents.
  await fs.copyFile(
    path.join(root, "resources/icons/inkleaf-128.png"),
    path.join(examples, "inkleaf.png"),
  );
  await fs.copyFile(
    path.join(root, "resources/samples/sample-badge.svg"),
    path.join(examples, "sample-badge.svg"),
  );
  const profile = await fs.mkdtemp(path.join(scratch, "profile-"));
  await fs.writeFile(
    path.join(profile, "settings.json"),
    JSON.stringify({
      autoSearch: false,
      roots: [examples],
      languagePreference: "en",
      shortcut: "Control+Alt+F8",
      theme: "minimal",
      pageNumbers: false,
      authorEnabled: false,
      fontSize: 10.5,
      lineHeight: 1.6,
      paperSize: "A4",
      orientation: "portrait",
      margins: "standard",
    }),
  );
  const env = { ...process.env, ALDUS_TEST_DIR: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [root], env });
  const reports = [];
  try {
    const page = await app.firstWindow();
    await page.waitForFunction(() => Boolean(window.aldus));
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    for (const name of names) {
      const file = path.join(examples, name + ".md");
      const before = await fs.readFile(file);
      const result = await page.evaluate(async (file) => {
        const pdf = await window.aldus.preview(file);
        return {
          data: Array.from(pdf.data),
          warnings: pdf.warnings,
          layoutWarnings: pdf.layoutWarnings,
        };
      }, file);
      assert.deepEqual(result.warnings, [], name + ": image warnings");
      assert.deepEqual(result.layoutWarnings, [], name + ": layout warnings");
      assert.deepEqual(
        await fs.readFile(file),
        before,
        "source must stay unchanged",
      );
      const loading = pdfjs.getDocument({ data: new Uint8Array(result.data) });
      const pdf = await loading.promise;
      assert.equal(
        pdf.numPages,
        1,
        name + ": keep the complete example on one page",
      );
      const pdfPage = await pdf.getPage(1);
      const text = (await pdfPage.getTextContent()).items
        .map((item) => item.str)
        .join(" ");
      const links = await pdfPage.getAnnotations();
      assert.ok(text.length > 80, name + ": PDF has selectable text");
      if (name === "images-links") {
        assert.ok(
          links.some((link) => link.dest),
          "internal PDF link",
        );
        assert.ok(
          links.some((link) =>
            link.url?.includes("github.com/alextianyf/Inkleaf"),
          ),
          "external PDF link",
        );
      }
      await fs.writeFile(
        path.join(output, name + ".pdf"),
        Buffer.from(result.data),
      );
      reports.push({
        name,
        pages: pdf.numPages,
        links: links.length,
        warnings: result.warnings,
        text,
      });
      await loading.destroy();
    }
  } finally {
    await app.close();
  }
  // Poppler rasterizes the saved PDFs independently of the app's preview.
  for (const name of names) {
    await run("pdftoppm", [
      "-scale-to-x",
      "1200",
      "-scale-to-y",
      "-1",
      "-singlefile",
      "-png",
      path.join(output, name + ".pdf"),
      path.join(scratch, name),
    ]);
  }
  await run("python", [
    "-c",
    `
from PIL import Image, ImageChops
from pathlib import Path
folder = Path(${JSON.stringify(scratch.replaceAll("\\", "/"))})
for name in ${JSON.stringify(names)}:
    image = Image.open(folder / (name + '.png')).convert('RGB')
    difference = ImageChops.difference(image, Image.new('RGB', image.size, 'white'))
    bounds = difference.convert('L').point(lambda value: 255 if value > 20 else 0).getbbox()
    # Remove only blank paper margins; keep every printed element and spacing.
    box = (90, max(0, bounds[1] - 24), image.width - 90, min(image.height, bounds[3] + 24))
    image.crop(box).save(folder / (name + '-crop.png'))
`,
  ]);
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    for (const name of names) {
      const source = await fs.readFile(
        path.join(examples, name + ".md"),
        "utf8",
      );
      const png = (
        await fs.readFile(path.join(scratch, name + "-crop.png"))
      ).toString("base64");
      const page = await browser.newPage({
        viewport: { width: 1280, height: 1100 },
        deviceScaleFactor: 1.5,
      });
      await page.setContent(`<!doctype html><meta charset="utf-8"><style>
        *{box-sizing:border-box}body{margin:0;background:#f6f2ea;color:#30343b;font:16px "Segoe UI","Microsoft YaHei",sans-serif}
        main{padding:28px}header{display:flex;justify-content:space-between;margin:0 0 22px;font-size:17px}
        .columns{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start}
        section{border:1px solid #dedbd5;border-radius:10px;overflow:hidden;background:white}
        h2{margin:0;padding:16px 22px;border-bottom:1px solid #e8e5df;font-size:17px;font-weight:600}
        small{float:right;font-size:13px;font-weight:400;color:#68717b}
        pre{margin:0;padding:22px;font:17px/1.55 Consolas,"Microsoft YaHei",monospace;white-space:pre-wrap;overflow-wrap:anywhere;background:#fafaf9}
        img{display:block;width:100%;padding:16px}footer{margin-top:18px;color:#68717b;font-size:13px}
      </style><main><header><strong>印页 · Inkleaf</strong><span>${name}.md</span></header>
      <div class="columns"><section><h2>Markdown <small>源文件</small></h2><pre>${escape(source.trimEnd())}</pre></section>
      <section><h2>PDF <small>实际转换结果</small></h2><img src="data:image/png;base64,${png}"></section></div>
      <footer>Minimal · A4 · 10.5 pt &nbsp; | &nbsp; Actual PDF, blank margins cropped / 真实 PDF，仅裁去空白页边距</footer></main>`);
      await page.locator("img").evaluate((img) => img.decode());
      await page
        .locator("main")
        .screenshot({ path: path.join(output, name + ".png") });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  await fs.writeFile(
    path.join(scratch, "report.json"),
    JSON.stringify(reports, null, 2),
  );
  console.log(
    JSON.stringify(
      reports.map(({ text, ...report }) => report),
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
