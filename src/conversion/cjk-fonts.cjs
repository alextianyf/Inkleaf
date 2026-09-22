const fs = require("node:fs");
const path = require("node:path");
const subsets = require("../../resources/fonts/noto-sans-sc/manifest.json");

const folder = path.join(__dirname, "../../resources/fonts/noto-sans-sc");
const cachedFaces = new Map();
let characterIndex;

// Build once, on the first document that needs non-ASCII characters.
// A character can belong to more than one overlapping Unicode range.
function indexCharacters() {
  characterIndex = new Map();
  for (const subset of subsets) {
    for (const range of subset.unicodeRange.split(",")) {
      const [start, end = start] = range.trim().slice(2).split("-");
      for (let code = parseInt(start, 16); code <= parseInt(end, 16); code++) {
        if (!characterIndex.has(code)) characterIndex.set(code, []);
        characterIndex.get(code).push(subset);
      }
    }
  }
}

function cjkFonts(text) {
  const characters = new Set(text.match(/[^\x00-\x7f]/gu) || []);
  if (!characters.size) return "";
  if (!characterIndex) indexCharacters();
  const needed = new Set();
  for (const character of characters) {
    for (const subset of characterIndex.get(character.codePointAt(0)) || [])
      needed.add(subset);
  }
  const faces = [];
  for (const subset of needed) {
    if (!cachedFaces.has(subset.file)) {
      const data = fs
        .readFileSync(path.join(folder, subset.file))
        .toString("base64");
      cachedFaces.set(
        subset.file,
        `@font-face{font-family:"Inkleaf CJK";font-style:normal;font-weight:100 900;font-display:block;src:url(data:font/woff2;base64,${data}) format("woff2");unicode-range:${subset.unicodeRange};}`,
      );
    }
    faces.push(cachedFaces.get(subset.file));
  }
  return faces.join("\n");
}

module.exports = { cjkFonts };
