const fs = require("node:fs");
const path = require("node:path");
// Embed once so every PDF can render math without downloading fonts.
const katexFolder = path.dirname(require.resolve("katex/dist/katex.min.css"));
const mathCss = fs
  .readFileSync(path.join(katexFolder, "katex.min.css"), "utf8")
  .replace(/url\(([^)]+)\)/g, (_, font) => {
    const file = font.replace(/["']/g, "");
    const extension = path.extname(file).slice(1);
    return `url(data:font/${extension};base64,${fs.readFileSync(path.join(katexFolder, file)).toString("base64")})`;
  });

module.exports = { mathCss };
