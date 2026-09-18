// Read an exported PDF back and check what a reader would actually get: the
// text is there, links survive, nothing is printed off the paper.
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../..");

async function inspectPdf(data) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: data.slice(), useSystemFonts: true });
  const pdf = await task.promise;
  const pages = [];
  try {
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const [, , width, height] = page.view;
      const content = await page.getTextContent();
      let outside = 0;
      for (const item of content.items) {
        if (!item.str?.trim()) continue;
        const [x, y] = [item.transform[4], item.transform[5]];
        if (x < -1 || y < -1 || x + item.width > width + 1 || y > height + 1)
          outside++;
      }
      const links = (await page.getAnnotations()).filter(
        (annotation) => annotation.subtype === "Link",
      );
      pages.push({
        number,
        text: content.items.map((item) => item.str).join(" "),
        links: links.length,
        outside,
      });
    }
  } finally {
    await task.destroy();
  }
  return pages;
}

// A document can declare text that must survive into the PDF:
//   <!-- quality-markers: QC-START, QC-END -->
function declaredMarkers(source) {
  const markers = [];
  for (const match of source.matchAll(/<!--\s*quality-markers:([^>]*)-->/g))
    markers.push(
      ...match[1]
        .split(",")
        .map((marker) => marker.trim())
        .filter(Boolean),
    );
  return markers;
}

// Line wrapping and syntax highlighting can split a token into several text
// runs, so compare with all whitespace removed.
function missingMarkers(markers, pages) {
  const text = pages
    .map((page) => page.text)
    .join("")
    .replace(/\s+/g, "");
  return markers.filter((marker) => !text.includes(marker.replace(/\s+/g, "")));
}

const channel = (value) => {
  const part = value / 255;
  return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex) => {
  const number = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((number >> 16) & 255) +
    0.7152 * channel((number >> 8) & 255) +
    0.0722 * channel(number & 255)
  );
};
const contrast = (first, second) => {
  const [high, low] = [luminance(first), luminance(second)].sort(
    (a, b) => b - a,
  );
  return (high + 0.05) / (low + 0.05);
};

// The heading colours a theme declares, read as gray values. Text on white
// has to stay near 4.5:1, which leaves room for about four clearly separated
// grays; levels past that must be told apart by size, case or a marker.
function headingLadder(theme) {
  const css = fs
    .readFileSync(path.join(root, "resources/themes", `${theme}.css`), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const colourOf = (selector) => {
    const rules = css.matchAll(
      new RegExp(`(?:^|\\})\\s*${selector}\\s*\\{([^}]*)\\}`, "gm"),
    );
    for (const rule of rules) {
      const colour = /(?:^|[;\s])color:\s*(#[0-9a-f]{6})/i.exec(rule[1]);
      if (colour) return colour[1];
    }
    return null;
  };
  const rows = [];
  let previous = null;
  for (let level = 1; level <= 6; level++) {
    const colour = colourOf(`h${level}`) || colourOf("body");
    if (!colour) continue;
    rows.push({
      level: `h${level}`,
      colour,
      gray: Math.round(luminance(colour) * 100),
      page: contrast(colour, "#ffffff"),
      above: previous ? contrast(colour, previous.colour) : null,
      from: previous?.level,
    });
    previous = rows.at(-1);
  }
  const steps = rows.filter((row) => row.above);
  const weakest = steps.length
    ? steps.reduce((low, row) => (row.above < low.above ? row : low))
    : null;
  return { theme, body: colourOf("body"), rows, weakest };
}

function ladderText({ theme, body, rows, weakest }) {
  const lines = [
    `${theme}: declared heading colours (white-page reference)`,
    "level  colour    lumin.   vs page   vs level above",
  ];
  for (const row of rows)
    lines.push(
      `${row.level.padEnd(6)} ${row.colour}  ${String(row.gray).padStart(3)}%  ` +
        `${row.page.toFixed(2).padStart(6)}   ${row.above ? row.above.toFixed(2) : "   —"}`,
    );
  if (body)
    lines.push(
      `body   ${body}  ${String(Math.round(luminance(body) * 100)).padStart(3)}%  ` +
        `${contrast(body, "#ffffff").toFixed(2).padStart(6)}`,
    );
  if (weakest)
    lines.push(
      `weakest step: ${weakest.above.toFixed(2)} (${weakest.from} to ${weakest.level})` +
        (weakest.above < 1.2
          ? " — colour alone no longer separates these two; check size, case or a marker"
          : " — inspect the rendered pages to judge separation"),
    );
  return lines.join("\n");
}

// A baseline check of declared text colours against white, not a replacement
// for reviewing rendered backgrounds or an actual printer proof.
function contrastProblems(ladder) {
  const problems = ladder.rows
    .filter((row) => row.page < 4.5)
    .map(
      (row) =>
        `${row.level} text/white contrast below 4.5:1 (${row.page.toFixed(2)})`,
    );
  if (ladder.body && contrast(ladder.body, "#ffffff") < 4.5)
    problems.push("body text/white contrast below 4.5:1");
  return problems;
}

module.exports = {
  inspectPdf,
  declaredMarkers,
  missingMarkers,
  headingLadder,
  ladderText,
  contrastProblems,
};
