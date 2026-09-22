const fs = require("node:fs");
const path = require("node:path");
const { cjkFonts } = require("./cjk-fonts.cjs");

// Modern ships its own text and code faces so the exported PDF reads the same
// on a machine without them. Chinese subsets are selected per document.
const folder = path.join(__dirname, "../../resources/fonts");
const modern = [
  ["Inter", "normal", 400, "inter-latin-400-normal.woff2"],
  ["Inter", "italic", 400, "inter-latin-400-italic.woff2"],
  ["Inter", "normal", 600, "inter-latin-600-normal.woff2"],
  ["Inter", "normal", 700, "inter-latin-700-normal.woff2"],
  ["Inter", "italic", 700, "inter-latin-700-italic.woff2"],
  ["JetBrains Mono", "normal", 400, "jetbrains-mono-latin-400-normal.woff2"],
  ["JetBrains Mono", "normal", 700, "jetbrains-mono-latin-700-normal.woff2"],
];

const face = ([family, style, weight, file]) =>
  `@font-face{font-family:"${family}";font-style:${style};font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${fs
    .readFileSync(path.join(folder, file))
    .toString("base64")}) format("woff2");}`;

const themeFonts = { modern: modern.map(face).join("\n") };

function documentFonts(theme, text) {
  if (theme !== "modern") return "";
  return themeFonts.modern + "\n" + cjkFonts(text);
}

module.exports = { documentFonts };
