const katex = require("katex");

// A dollar on each of two separate lines is often an intended display formula.
// Repair only a complete ordinary paragraph, never code or authored HTML.
const delimiter = /^( {0,3})\$[ \t]*$/;

module.exports = {
  id: "markdown/math-delimiters",
  *check({ lines, paragraphs }) {
    for (const [start, end] of paragraphs) {
      if (end - start < 3) continue;
      const opening = delimiter.exec(lines[start]);
      const closing = delimiter.exec(lines[end - 1]);
      if (!opening || !closing) continue;
      const formula = lines.slice(start + 1, end - 1).join("\n");
      // A bare number or ordinary prose may be a price, not mathematics.
      const mathLike = /\\[A-Za-z]+|[=^_]/.test(formula);
      if (!mathLike) continue;
      let valid = true;
      try {
        katex.renderToString(formula, {
          displayMode: true,
          output: "html",
          throwOnError: true,
          trust: false,
          maxExpand: 1000,
        });
      } catch {
        valid = false;
      }
      yield {
        key: valid
          ? "sourceMathDelimitersRepaired"
          : "sourceMathDelimitersUncertain",
        line: start + 1,
        endLine: end,
        edits: valid
          ? [
              { line: start + 1, text: lines[start].replace("$", () => "$$") },
              { line: end, text: lines[end - 1].replace("$", () => "$$") },
            ]
          : [],
      };
    }
  },
};
