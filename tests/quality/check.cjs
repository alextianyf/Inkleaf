// Markdown → PDF quality check. Renders a document through the real app in
// every theme and language, reads the PDFs back, and writes a report with
// page images, grayscale overviews and a pass/fail summary.
//
//   npm run check:quality
//   npm run check:quality -- notes.md --themes=modern --langs=zh
//
// Needs `npm run build:ui` once. Output: output/quality/<document>/report.html
const fs = require("node:fs");
const path = require("node:path");
const { renderWithApp, root } = require("./lib/app.cjs");
const {
  inspectPdf,
  declaredMarkers,
  missingMarkers,
  headingLadder,
  ladderText,
  contrastProblems,
} = require("./lib/inspect.cjs");
const { renderPages } = require("./lib/pages.cjs");

const THEMES = { modern: "Modern", default: "Classic", minimal: "Minimal" };

function options(argv) {
  const flag = (name, fallback) =>
    argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
  const file = path.resolve(
    root,
    argv.find((arg) => !arg.startsWith("--")) ||
      "tests/quality/template/quality.md",
  );
  const name = path.basename(file, path.extname(file));
  return {
    file,
    themes: flag("themes", "modern,default,minimal").split(","),
    languages: flag("langs", "en,zh").split(","),
    out: path.resolve(root, flag("out", `output/quality/${name}`)),
  };
}

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

function writeReport({ file, out, variants, ladders }) {
  const failed = variants.filter((variant) => variant.problems.length);
  const rows = variants.map(
    (v) =>
      `| ${v.label} | ${v.pages.length} | ${v.links} | ${v.problems.length ? "✗ " + v.problems.join("; ") : "✓"} |`,
  );
  const markdown = [
    `# Quality report · ${path.basename(file)}`,
    "",
    `Generated ${new Date().toISOString()}. ${failed.length ? `${failed.length} of ${variants.length} renders need attention.` : `All ${variants.length} renders passed.`}`,
    "",
    "| Render | Pages | Links | Result |",
    "| --- | ---: | ---: | --- |",
    ...rows,
    "",
    "## Heading ladder in grayscale",
    "",
    ...ladders.map((ladder) => "```text\n" + ladderText(ladder) + "\n```\n"),
  ].join("\n");
  fs.writeFileSync(path.join(out, "report.md"), markdown);

  const cards = variants
    .map(
      (v) => `<section>
  <h2>${escapeHtml(v.label)} <span class="${v.problems.length ? "bad" : "ok"}">${v.problems.length ? "needs attention" : "passed"}</span></h2>
  <p>${v.pages.length} pages · ${v.links} links · <a href="${v.name}.pdf">open PDF</a>${v.problems.length ? " · " + escapeHtml(v.problems.join("; ")) : ""}</p>
  <div class="pair"><figure><img src="${v.name}-sheet.png" alt=""><figcaption>Colour</figcaption></figure>
  <figure><img src="${v.name}-gray-sheet.png" alt=""><figcaption>Grayscale</figcaption></figure></div>
</section>`,
    )
    .join("\n");
  const ladderHtml = ladders
    .map(
      (ladder) =>
        `<h3>${THEMES[ladder.theme] || ladder.theme}</h3><pre>${escapeHtml(ladderText(ladder))}</pre>`,
    )
    .join("\n");
  fs.writeFileSync(
    path.join(out, "report.html"),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Quality report</title>
<style>
body{margin:0;padding:32px;font:14px/1.5 "Segoe UI",system-ui,sans-serif;color:#1d2227;background:#f3f5f8}
h1{margin:0 0 4px;font-size:22px}h2{font-size:17px;margin:0 0 4px}
section{background:#fff;border:1px solid #dde2e8;border-radius:10px;padding:18px 20px;margin:18px 0}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}img{width:100%;border:1px solid #dde2e8;border-radius:6px}
figcaption{color:#6b727a;font-size:12px;margin-top:4px}.ok,.bad{font-size:12px;padding:2px 8px;border-radius:10px;margin-left:6px}
.ok{background:#e6f4ea;color:#1e6b34}.bad{background:#fdecee;color:#a3162e}pre{background:#f6f7f9;padding:12px;border-radius:6px;overflow:auto}
table{border-collapse:collapse}td,th{padding:4px 12px;border-bottom:1px solid #e3e7ec;text-align:left}
</style></head><body>
<h1>Quality report · ${escapeHtml(path.basename(file))}</h1>
<p>${failed.length ? `${failed.length} of ${variants.length} renders need attention.` : `All ${variants.length} renders passed.`} Generated ${new Date().toLocaleString()}.</p>
${cards}
<section><h2>Heading ladder in grayscale</h2>${ladderHtml}</section>
</body></html>`,
  );
}

(async () => {
  const { file, themes, languages, out } = options(process.argv.slice(2));
  if (!fs.existsSync(file)) throw new Error(`No such document: ${file}`);
  // Reuse the report directory without recursively deleting a caller-selected path.
  fs.mkdirSync(out, { recursive: true });
  const markers = declaredMarkers(fs.readFileSync(file, "utf8"));
  const original = fs.readFileSync(file);
  console.log(`Checking ${path.relative(root, file)}`);
  console.log(
    `themes: ${themes.join(", ")} · languages: ${languages.join(", ")}`,
  );
  const variants = [];
  for (const language of languages) {
    for (const result of await renderWithApp({ file, themes, language })) {
      const name = `${result.theme}-${language}`;
      fs.writeFileSync(path.join(out, `${name}.pdf`), result.data);
      const pages = await inspectPdf(result.data);
      const problems = contrastProblems(headingLadder(result.theme));
      if (!pages.length) problems.push("no pages");
      if (result.warnings.length)
        problems.push(`missing resources: ${result.warnings.join(", ")}`);
      if (result.layoutWarnings.length)
        problems.push(
          `layout notices: ${result.layoutWarnings.map((w) => w.key).join(", ")}`,
        );
      const outside = pages.reduce((sum, page) => sum + page.outside, 0);
      if (outside) problems.push(`${outside} text runs outside the paper`);
      const missing = missingMarkers(markers, pages);
      if (missing.length) problems.push(`missing text: ${missing.join(", ")}`);
      variants.push({
        name,
        label: `${THEMES[result.theme] || result.theme} · ${language}`,
        pages,
        links: pages.reduce((sum, page) => sum + page.links, 0),
        notes: result.sourceDiagnostics.length,
        problems,
      });
    }
  }
  console.log("Rendering page images…");
  renderPages({
    out,
    sheetColumns: 4,
    items: variants.map((v) => ({
      name: v.name,
      pdf: path.join(out, `${v.name}.pdf`),
      pages: true,
      sheet: true,
      graySheet: true,
    })),
  });
  const ladders = themes.map(headingLadder);
  writeReport({ file, out, variants, ladders });

  console.log("");
  for (const v of variants)
    console.log(
      `${v.problems.length ? "✗" : "✓"} ${v.label.padEnd(16)} ${String(v.pages.length).padStart(3)} pages  ${String(v.links).padStart(3)} links` +
        (v.notes ? `  ${v.notes} source notes` : "") +
        (v.problems.length ? `\n    ${v.problems.join("\n    ")}` : ""),
    );
  console.log("");
  for (const ladder of ladders) console.log(ladderText(ladder) + "\n");
  console.log(`Report: ${path.relative(root, path.join(out, "report.html"))}`);
  if (!fs.readFileSync(file).equals(original))
    throw new Error("The source Markdown changed during the check");
  if (variants.some((v) => v.problems.length)) process.exitCode = 1;
})().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
