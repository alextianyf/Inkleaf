// Grayscale check: most classrooms print in black and white, so the hierarchy
// has to survive without colour. Exports a document through the real app,
// renders every page in grayscale, and reports the heading ladder as grays.
//
//   npm run check:grayscale
//   npm run check:grayscale -- notes.md --theme=all --lang=zh
//
// --theme  modern (default), default, minimal or all
// Output:  output/grayscale/<document>/  (pages, overview sheet, report.md)
const fs = require("node:fs");
const path = require("node:path");
const { renderWithApp, root } = require("./lib/app.cjs");
const {
  headingLadder,
  ladderText,
  contrastProblems,
} = require("./lib/inspect.cjs");
const { renderPages } = require("./lib/pages.cjs");

(async () => {
  const argv = process.argv.slice(2);
  const flag = (name, fallback) =>
    argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
  const file = path.resolve(
    root,
    argv.find((arg) => !arg.startsWith("--")) ||
      "tests/quality/template/quality.md",
  );
  if (!fs.existsSync(file)) throw new Error(`No such document: ${file}`);
  const requested = flag("theme", "modern");
  const themes =
    requested === "all" ? ["modern", "default", "minimal"] : [requested];
  const language = flag("lang", "en");
  const name = path.basename(file, path.extname(file));
  const out = path.resolve(root, flag("out", `output/grayscale/${name}`));
  // Reuse the report directory without recursively deleting a caller-selected path.
  fs.mkdirSync(out, { recursive: true });

  const results = await renderWithApp({ file, themes, language });
  for (const result of results)
    fs.writeFileSync(
      path.join(out, `${result.theme}-${language}.pdf`),
      result.data,
    );
  renderPages({
    out,
    sheetColumns: 4,
    items: results.map((result) => ({
      name: `${result.theme}-${language}`,
      pdf: path.join(out, `${result.theme}-${language}.pdf`),
      grayPages: true,
      graySheet: true,
    })),
  });

  const ladders = themes.map(headingLadder);
  const report = ladders.map(ladderText);
  const problems = ladders.flatMap(contrastProblems);
  for (const result of results) {
    if (result.warnings.length || result.layoutWarnings.length)
      problems.push(`${result.theme}: resource or layout warnings`);
  }
  fs.writeFileSync(
    path.join(out, "report.md"),
    `# Grayscale · ${path.basename(file)}\n\n` +
      report.map((text) => "```text\n" + text + "\n```\n").join("\n"),
  );
  console.log(`\n${report.join("\n\n")}\n`);
  console.log(`Grayscale pages: ${path.relative(root, out)}`);
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
